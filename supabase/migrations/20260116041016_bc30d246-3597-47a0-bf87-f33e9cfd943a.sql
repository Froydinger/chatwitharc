-- Fix RLS policies for generated_files to explicitly block anonymous access
-- Drop and recreate policies with TO authenticated clause

DROP POLICY IF EXISTS "Users can view their own generated files" ON public.generated_files;
DROP POLICY IF EXISTS "Users can create their own generated files" ON public.generated_files;
DROP POLICY IF EXISTS "Users can update their own generated files" ON public.generated_files;
DROP POLICY IF EXISTS "Users can delete their own generated files" ON public.generated_files;

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