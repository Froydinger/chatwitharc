
-- Allow anyone (authenticated) to read download_ prefixed admin settings
CREATE POLICY "Anyone can read download settings"
ON public.admin_settings
FOR SELECT
TO authenticated
USING (key LIKE 'download_%');

-- Also allow anon to read download settings (for unauthenticated download page)
CREATE POLICY "Anon can read download settings"
ON public.admin_settings
FOR SELECT
TO anon
USING (key LIKE 'download_%');

-- Seed initial download settings
INSERT INTO public.admin_settings (key, value, description)
VALUES 
  ('download_version', '4.0.9', 'Current Mac app version number'),
  ('download_filename', 'ArcAi-4.0.9.dmg', 'Current Mac app filename in storage')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Storage policies for download-files bucket (admin upload)
CREATE POLICY "Admins can upload download files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'download-files' AND
  EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
);

CREATE POLICY "Admins can delete download files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'download-files' AND
  EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
);

CREATE POLICY "Anyone can read download files"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'download-files');
