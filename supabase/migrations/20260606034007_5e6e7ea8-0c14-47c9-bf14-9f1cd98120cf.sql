-- Deduplicate any existing rows first (keep oldest), then enforce uniqueness on subdomain.
DELETE FROM public.published_sites a
USING public.published_sites b
WHERE a.subdomain = b.subdomain
  AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS published_sites_subdomain_key
  ON public.published_sites (subdomain);