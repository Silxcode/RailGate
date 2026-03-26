-- Add 'side' column to gates table for left/right gate logic
-- This migration adds GPS-based gate positioning

ALTER TABLE public.gates 
ADD COLUMN IF NOT EXISTS side TEXT DEFAULT 'center' 
    CHECK (side IN ('left', 'right', 'center'));

-- Add bearing and distance columns for debugging/analysis
ALTER TABLE public.gates 
ADD COLUMN IF NOT EXISTS bearing INT,
ADD COLUMN IF NOT EXISTS direction TEXT,
ADD COLUMN IF NOT EXISTS distance_meters INT;

-- Create index for efficient querying by side
CREATE INDEX IF NOT EXISTS idx_gates_side ON public.gates (side);
CREATE INDEX IF NOT EXISTS idx_gates_station_side ON public.gates (station_code, side);

COMMENT ON COLUMN public.gates.side IS 'Gate position relative to station: left (approaching), right (departing), center (both)';
COMMENT ON COLUMN public.gates.bearing IS 'GPS bearing from station to gate (0-360 degrees)';
COMMENT ON COLUMN public.gates.direction IS 'Cardinal direction (N, NE, E, SE, S, SW, W, NW)';
COMMENT ON COLUMN public.gates.distance_meters IS 'Distance from station to gate in meters';
