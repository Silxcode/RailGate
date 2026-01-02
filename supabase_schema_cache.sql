-- Cache table for storing client-side cache data
-- Replaces IndexedDB with database-backed persistent storage

CREATE TABLE IF NOT EXISTS public.cache (
    key TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient expiry-based queries
CREATE INDEX IF NOT EXISTS idx_cache_expires ON public.cache (expires_at);

-- RLS Policies (Read/Write for all authenticated and anonymous users)
ALTER TABLE public.cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cache"
    ON public.cache FOR SELECT
    USING (true);

CREATE POLICY "Anyone can insert cache"
    ON public.cache FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Anyone can update cache"
    ON public.cache FOR UPDATE
    USING (true);

CREATE POLICY "Anyone can delete expired cache"
    ON public.cache FOR DELETE
    USING (expires_at < now());

-- Cleanup function to automatically remove expired entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void AS $$
BEGIN
    DELETE FROM public.cache WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional: Schedule cleanup (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-cache', '0 * * * *', 'SELECT cleanup_expired_cache()');
