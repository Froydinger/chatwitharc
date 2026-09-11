-- Canonical, account-scoped living memory. The existing profile and
-- context_blocks data remains untouched as a recoverable migration source.
CREATE TABLE public.memory_summaries (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL DEFAULT '',
  revision BIGINT NOT NULL DEFAULT 1,
  migrated_from_legacy BOOLEAN NOT NULL DEFAULT FALSE,
  legacy_item_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.memory_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own memory summary"
ON public.memory_summaries FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can create their own memory summary"
ON public.memory_summaries FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own memory summary"
ON public.memory_summaries FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own memory summary"
ON public.memory_summaries FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE TRIGGER update_memory_summaries_updated_at
BEFORE UPDATE ON public.memory_summaries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
