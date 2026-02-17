
-- Create context_blocks table for individual context items
CREATE TABLE public.context_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual' or 'memory'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.context_blocks ENABLE ROW LEVEL SECURITY;

-- Users can only see their own context blocks
CREATE POLICY "Users can view their own context blocks"
ON public.context_blocks FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own context blocks"
ON public.context_blocks FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own context blocks"
ON public.context_blocks FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own context blocks"
ON public.context_blocks FOR DELETE
USING (auth.uid() = user_id);

-- Index for fast lookups by user
CREATE INDEX idx_context_blocks_user_id ON public.context_blocks (user_id);

-- Trigger for updated_at
CREATE TRIGGER update_context_blocks_updated_at
BEFORE UPDATE ON public.context_blocks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
