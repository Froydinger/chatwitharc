ALTER TABLE public.ide_projects ADD COLUMN IF NOT EXISTS netlify_url TEXT DEFAULT NULL;
ALTER TABLE public.ide_projects ADD COLUMN IF NOT EXISTS netlify_site_id TEXT DEFAULT NULL;
ALTER TABLE public.ide_projects ADD COLUMN IF NOT EXISTS netlify_subdomain TEXT DEFAULT NULL;