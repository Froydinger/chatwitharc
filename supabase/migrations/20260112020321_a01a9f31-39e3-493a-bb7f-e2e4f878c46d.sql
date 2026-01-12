-- Create search_sessions table for storing user search sessions across devices
CREATE TABLE public.search_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  query TEXT NOT NULL,
  results JSONB DEFAULT '[]'::jsonb,
  formatted_content TEXT,
  related_queries JSONB DEFAULT '[]'::jsonb,
  source_conversations JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create saved_links table for storing user's saved links across devices
CREATE TABLE public.saved_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  list_id TEXT NOT NULL DEFAULT 'default',
  list_name TEXT NOT NULL DEFAULT 'Saved Links',
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  snippet TEXT,
  saved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.search_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_links ENABLE ROW LEVEL SECURITY;

-- RLS policies for search_sessions
CREATE POLICY "Users can view their own search sessions"
ON public.search_sessions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own search sessions"
ON public.search_sessions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own search sessions"
ON public.search_sessions
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own search sessions"
ON public.search_sessions
FOR DELETE
USING (auth.uid() = user_id);

-- RLS policies for saved_links
CREATE POLICY "Users can view their own saved links"
ON public.saved_links
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own saved links"
ON public.saved_links
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved links"
ON public.saved_links
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved links"
ON public.saved_links
FOR DELETE
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_search_sessions_user_id ON public.search_sessions(user_id);
CREATE INDEX idx_search_sessions_created_at ON public.search_sessions(created_at DESC);
CREATE INDEX idx_saved_links_user_id ON public.saved_links(user_id);
CREATE INDEX idx_saved_links_list_id ON public.saved_links(user_id, list_id);

-- Create trigger for updating updated_at on search_sessions
CREATE TRIGGER update_search_sessions_updated_at
BEFORE UPDATE ON public.search_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();