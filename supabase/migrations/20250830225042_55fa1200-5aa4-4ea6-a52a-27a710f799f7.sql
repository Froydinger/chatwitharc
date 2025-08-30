-- Enable real-time updates for chat_sessions table
ALTER TABLE public.chat_sessions REPLICA IDENTITY FULL;

-- Add chat_sessions to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_sessions;