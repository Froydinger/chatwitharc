-- Create search_sessions table
CREATE TABLE IF NOT EXISTS public.search_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id text NOT NULL,
  query text NOT NULL,
  results jsonb DEFAULT '[]'::jsonb,
  formatted_content text,
  related_queries jsonb,
  source_conversations jsonb,
  active_source_url text,
  current_tab text DEFAULT 'search',
  timestamp bigint NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add RLS policies
ALTER TABLE public.search_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own search sessions"
  ON public.search_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own search sessions"
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

-- Create unique constraint for upsert
ALTER TABLE public.search_sessions ADD CONSTRAINT unique_user_session UNIQUE (user_id, session_id);

-- Create index for faster queries
CREATE INDEX idx_search_sessions_user_id ON public.search_sessions(user_id);
CREATE INDEX idx_search_sessions_timestamp ON public.search_sessions(timestamp DESC);

-- Create updated_at trigger
CREATE TRIGGER update_search_sessions_updated_at
  BEFORE UPDATE ON public.search_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
