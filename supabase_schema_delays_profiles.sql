-- Train delays table for crowdsourced delay reporting
-- Supports quick-select delay buckets and optional train numbers

CREATE TABLE IF NOT EXISTS public.train_delays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gate_id UUID REFERENCES gates(id) ON DELETE CASCADE,
    station_code TEXT REFERENCES stations(code) ON DELETE CASCADE,
    delay_bucket TEXT NOT NULL CHECK (delay_bucket IN ('5-15', '15-30', '30-60', '60+')),
    train_number TEXT, -- Optional, user can specify
    reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_train_delays_gate ON public.train_delays (gate_id);
CREATE INDEX IF NOT EXISTS idx_train_delays_station ON public.train_delays (station_code);
CREATE INDEX IF NOT EXISTS idx_train_delays_time ON public.train_delays (created_at DESC);

-- RLS Policies
ALTER TABLE public.train_delays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read train delays"
    ON public.train_delays FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can insert delays"
    ON public.train_delays FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own delays"
    ON public.train_delays FOR UPDATE
    USING (reported_by = auth.uid());

-- User profiles table for gamification stats
CREATE TABLE IF NOT EXISTS public.user_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    points INT DEFAULT 0,
    level INT DEFAULT 1,
    total_reports INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for user profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read all profiles"
    ON public.user_profiles FOR SELECT
    USING (true);

CREATE POLICY "Users can update their own profile"
    ON public.user_profiles FOR UPDATE
    USING (user_id = auth.uid());

-- Trigger to auto-create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();
