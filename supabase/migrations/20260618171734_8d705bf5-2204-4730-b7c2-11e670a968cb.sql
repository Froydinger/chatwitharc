
CREATE TABLE public.anon_usage (
  ip_hash TEXT NOT NULL,
  usage_date DATE NOT NULL,
  replies_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ip_hash, usage_date)
);
GRANT ALL ON public.anon_usage TO service_role;
ALTER TABLE public.anon_usage ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (edge function) can touch this table.
