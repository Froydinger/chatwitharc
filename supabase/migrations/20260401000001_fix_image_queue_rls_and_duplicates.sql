-- Fix RLS policies and prevent duplicate writes in image_generation_jobs

-- First, drop the overly permissive policy
DROP POLICY IF EXISTS "Service role can update any job" ON public.image_generation_jobs;

-- Add a restrictive policy - users can only update their own jobs
-- Service role (backend) can bypass RLS and update any job
CREATE POLICY "Users can update their own jobs"
ON public.image_generation_jobs
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add policy to prevent users from deleting jobs (soft deletes only)
CREATE POLICY "No one can delete jobs"
ON public.image_generation_jobs
FOR DELETE
USING (false);

-- Add a check constraint to validate status values
ALTER TABLE public.image_generation_jobs
ADD CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

-- Add a check constraint to validate job_type
ALTER TABLE public.image_generation_jobs
ADD CONSTRAINT valid_job_type CHECK (job_type IN ('generate', 'edit'));

-- Create a function to prevent duplicate inserts within 5 seconds
CREATE OR REPLACE FUNCTION check_duplicate_image_job()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if a similar job was created in the last 5 seconds by the same user with same prompt/type
  IF EXISTS (
    SELECT 1 FROM public.image_generation_jobs
    WHERE user_id = NEW.user_id
    AND job_type = NEW.job_type
    AND prompt = NEW.prompt
    AND created_at > (NOW() - INTERVAL '5 seconds')
    AND id != NEW.id
  ) THEN
    RAISE EXCEPTION 'Duplicate image job submitted too quickly';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to check for duplicates on insert
CREATE TRIGGER check_image_job_duplicate
  BEFORE INSERT ON public.image_generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION check_duplicate_image_job();

-- Clean up any existing duplicates: keep only the first one
DELETE FROM public.image_generation_jobs WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, job_type, prompt) id
  FROM public.image_generation_jobs
  ORDER BY user_id, job_type, prompt, created_at ASC
);

-- Add a comment to document the table
COMMENT ON TABLE public.image_generation_jobs IS 'Queue for async image generation and editing tasks';
COMMENT ON COLUMN public.image_generation_jobs.status IS 'Job status: pending, processing, completed, or failed';
COMMENT ON COLUMN public.image_generation_jobs.attempts IS 'Number of processing attempts';
