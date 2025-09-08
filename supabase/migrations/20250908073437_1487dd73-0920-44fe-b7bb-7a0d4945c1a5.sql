-- Create storage policies for the avatars bucket to allow authenticated users to upload images

-- Allow authenticated users to upload their own images
CREATE POLICY "Users can upload images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'
);

-- Allow authenticated users to view all images in avatars bucket
CREATE POLICY "Users can view all images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'avatars');

-- Allow users to update their own uploaded images
CREATE POLICY "Users can update their own images"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own uploaded images
CREATE POLICY "Users can delete their own images"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);