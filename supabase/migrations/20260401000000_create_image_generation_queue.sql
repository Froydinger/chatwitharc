-- Create image_generation_jobs table for async job queuing
CREATE TABLE public.image_generation_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL, -- 'generate' or 'edit'
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  prompt TEXT NOT NULL,
  base_image_urls TEXT[], -- Array of image URLs for edit jobs
  aspect_ratio TEXT DEFAULT '16:9',
  preferred_model TEXT,
  result_image_url TEXT, -- populated when completed
  error_message TEXT, -- populated on failure
  error_type TEXT, -- populated on failure
  attempts INT DEFAULT 0,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.image_generation_jobs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own jobs"
ON public.image_generation_jobs
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own jobs"
ON public.image_generation_jobs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can update any job"
ON public.image_generation_jobs
FOR UPDATE
USING (true);

-- Create indexes for efficient querying
CREATE INDEX idx_image_jobs_user_id ON public.image_generation_jobs(user_id);
CREATE INDEX idx_image_jobs_status ON public.image_generation_jobs(status);
CREATE INDEX idx_image_jobs_created_at ON public.image_generation_jobs(created_at DESC);
CREATE INDEX idx_image_jobs_status_created ON public.image_generation_jobs(status, created_at DESC);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_image_jobs_updated_at
  BEFORE UPDATE ON public.image_generation_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
