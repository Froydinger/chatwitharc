
-- Make music-files bucket public
UPDATE storage.buckets SET public = true WHERE id = 'music-files';

-- Allow public read access
CREATE POLICY "Public read access for music files"
ON storage.objects FOR SELECT
USING (bucket_id = 'music-files');
