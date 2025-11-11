-- Create generated-files storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-files', 'generated-files', true);

-- RLS policies for generated-files bucket
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'generated-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Allow public downloads"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'generated-files');

CREATE POLICY "Allow users to delete their own files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'generated-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Table to track generated files
CREATE TABLE IF NOT EXISTS public.generated_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL,
  file_size bigint,
  mime_type text,
  prompt text,
  created_at timestamptz DEFAULT now(),
  downloaded_count integer DEFAULT 0
);

-- RLS policies for generated_files table
ALTER TABLE public.generated_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own files"
ON public.generated_files FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own files"
ON public.generated_files FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own files"
ON public.generated_files FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Create index for better query performance
CREATE INDEX idx_generated_files_user_id ON public.generated_files(user_id);
CREATE INDEX idx_generated_files_created_at ON public.generated_files(created_at DESC);