-- Published sites: tracks canvas/code-block deployments to Netlify
CREATE TABLE public.published_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  netlify_site_id text NOT NULL,
  subdomain text NOT NULL,
  url text NOT NULL,
  title text NOT NULL DEFAULT 'My Site',
  favicon_svg text,            -- SVG string (emoji favicon)
  favicon_data text,           -- data URL for uploaded favicon files
  og_title text,
  og_description text,
  og_image_url text,
  code text,
  code_language text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.published_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own published sites"
  ON public.published_sites FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own published sites"
  ON public.published_sites FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own published sites"
  ON public.published_sites FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own published sites"
  ON public.published_sites FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_published_sites_updated_at
  BEFORE UPDATE ON public.published_sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
