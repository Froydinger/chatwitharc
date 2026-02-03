-- Fix generated_files RLS policies to block anonymous access by adding TO authenticated clause
-- This ensures only authenticated users can even attempt to access the table

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own generated files" ON public.generated_files;
DROP POLICY IF EXISTS "Users can create their own generated files" ON public.generated_files;
DROP POLICY IF EXISTS "Users can update their own generated files" ON public.generated_files;
DROP POLICY IF EXISTS "Users can delete their own generated files" ON public.generated_files;

-- Recreate policies with TO authenticated clause
CREATE POLICY "Users can view their own generated files"
  ON public.generated_files FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own generated files"
  ON public.generated_files FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own generated files"
  ON public.generated_files FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own generated files"
  ON public.generated_files FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);