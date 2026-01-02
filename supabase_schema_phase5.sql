-- Phase 5: Advanced Prediction Schema
-- Tables for ML data collection, schedules, and direction-aware gates

-----------------------------------------------
-- 1. Prediction Logs (For ML Training)
-----------------------------------------------
CREATE TABLE IF NOT EXISTS public.prediction_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gate_id UUID REFERENCES gates(id) ON DELETE CASCADE,
    station_code TEXT NOT NULL,
    
    -- Prediction details
    predicted_status TEXT NOT NULL CHECK (predicted_status IN ('open', 'closed', 'warning', 'unknown')),
    predicted_at TIMESTAMPTZ DEFAULT now(),
    confidence FLOAT,
    data_source TEXT,           -- 'railradar', 'crowdsource', 'timetable', 'no_data'
    
    -- Train context
    train_number TEXT,
    train_name TEXT,
    train_type TEXT,
    minutes_until_arrival INT,
    
    -- Time context
    hour_of_day INT,
    day_of_week INT,            -- 0=Sunday, 6=Saturday
    is_peak_hour BOOLEAN,
    
    -- User verification (filled when user reports)
    actual_status TEXT CHECK (actual_status IN ('open', 'closed', NULL)),
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES auth.users(id),
    
    -- Accuracy tracking
    was_correct BOOLEAN GENERATED ALWAYS AS (
        CASE WHEN actual_status IS NULL THEN NULL
             WHEN predicted_status = actual_status THEN TRUE
             WHEN predicted_status = 'warning' AND actual_status = 'closed' THEN TRUE
             ELSE FALSE
        END
    ) STORED
);

CREATE INDEX idx_prediction_logs_station ON public.prediction_logs (station_code);
CREATE INDEX idx_prediction_logs_gate ON public.prediction_logs (gate_id);
CREATE INDEX idx_prediction_logs_time ON public.prediction_logs (predicted_at DESC);
CREATE INDEX idx_prediction_logs_accuracy ON public.prediction_logs (was_correct) WHERE was_correct IS NOT NULL;

-- RLS
ALTER TABLE public.prediction_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read logs" ON public.prediction_logs FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert" ON public.prediction_logs FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update their verifications" ON public.prediction_logs FOR UPDATE 
    USING (verified_by = auth.uid() OR verified_by IS NULL);

-----------------------------------------------
-- 2. Station Schedules (Static Timetable)
-----------------------------------------------
CREATE TABLE IF NOT EXISTS public.station_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    station_code TEXT NOT NULL,
    train_number TEXT NOT NULL,
    train_name TEXT,
    train_type TEXT,
    
    arrival_time TIME,
    departure_time TIME,
    days_of_week TEXT[] DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    
    direction TEXT DEFAULT 'both' CHECK (direction IN ('up', 'down', 'both')),
    
    -- Metadata
    source TEXT DEFAULT 'manual',  -- 'manual', 'irctc', 'csv_import'
    last_updated TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(station_code, train_number)
);

CREATE INDEX idx_schedules_station ON public.station_schedules (station_code);
CREATE INDEX idx_schedules_time ON public.station_schedules (arrival_time);

-- RLS
ALTER TABLE public.station_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read schedules" ON public.station_schedules FOR SELECT USING (true);

-- Allow authenticated users to manage schedules (or use your own admin check)
CREATE POLICY "Authenticated can manage schedules" ON public.station_schedules FOR ALL 
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-----------------------------------------------
-- 3. Add Direction to Gates Table
-----------------------------------------------
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'gates' AND column_name = 'direction') THEN
        ALTER TABLE public.gates ADD COLUMN direction TEXT DEFAULT 'both' 
            CHECK (direction IN ('up', 'down', 'both'));
    END IF;
END $$;

-----------------------------------------------
-- 4. Accuracy Aggregation View
-----------------------------------------------
CREATE OR REPLACE VIEW public.gate_accuracy AS
SELECT 
    gate_id,
    station_code,
    COUNT(*) FILTER (WHERE was_correct IS NOT NULL) as total_verified,
    COUNT(*) FILTER (WHERE was_correct = TRUE) as correct_predictions,
    ROUND(
        COUNT(*) FILTER (WHERE was_correct = TRUE)::NUMERIC / 
        NULLIF(COUNT(*) FILTER (WHERE was_correct IS NOT NULL), 0) * 100, 
        1
    ) as accuracy_percent,
    AVG(minutes_until_arrival) FILTER (WHERE actual_status = 'closed') as avg_closure_lead_time
FROM public.prediction_logs
WHERE predicted_at > now() - INTERVAL '30 days'
GROUP BY gate_id, station_code;

-- Grant access
GRANT SELECT ON public.gate_accuracy TO authenticated;
