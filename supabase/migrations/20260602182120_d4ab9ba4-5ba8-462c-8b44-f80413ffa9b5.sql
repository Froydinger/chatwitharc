
-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============ SCHEDULED TASKS ============
CREATE TABLE public.scheduled_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agent_id uuid,
  title text NOT NULL,
  prompt text NOT NULL,
  schedule_type text NOT NULL CHECK (schedule_type IN ('once','cron')),
  run_at timestamptz,
  cron_expr text,
  timezone text NOT NULL DEFAULT 'UTC',
  last_run_at timestamptz,
  next_run_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','failed')),
  result_chat_id uuid,
  push_on_complete boolean NOT NULL DEFAULT true,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_tasks TO authenticated;
GRANT ALL ON public.scheduled_tasks TO service_role;
ALTER TABLE public.scheduled_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tasks" ON public.scheduled_tasks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all tasks" ON public.scheduled_tasks FOR SELECT TO authenticated USING (is_admin_user());
CREATE INDEX idx_scheduled_tasks_due ON public.scheduled_tasks (next_run_at) WHERE status = 'active';
CREATE INDEX idx_scheduled_tasks_user ON public.scheduled_tasks (user_id);

CREATE TABLE public.scheduled_task_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.scheduled_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed')),
  output text,
  chat_session_id uuid,
  error text
);
GRANT SELECT ON public.scheduled_task_runs TO authenticated;
GRANT ALL ON public.scheduled_task_runs TO service_role;
ALTER TABLE public.scheduled_task_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own runs" ON public.scheduled_task_runs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_task_runs_task ON public.scheduled_task_runs (task_id, started_at DESC);

CREATE TRIGGER tg_scheduled_tasks_updated BEFORE UPDATE ON public.scheduled_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SHARED CHATS ============
CREATE TABLE public.shared_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New Shared Chat',
  canvas_content text,
  agent_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_chats TO authenticated;
GRANT ALL ON public.shared_chats TO service_role;
ALTER TABLE public.shared_chats ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.shared_chat_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.shared_chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('owner','editor','viewer')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(chat_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_chat_members TO authenticated;
GRANT ALL ON public.shared_chat_members TO service_role;
ALTER TABLE public.shared_chat_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_shared_members_user ON public.shared_chat_members (user_id);
CREATE INDEX idx_shared_members_chat ON public.shared_chat_members (chat_id);

-- Security definer helper to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.is_shared_chat_member(_chat_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.shared_chat_members WHERE chat_id = _chat_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_shared_chat_owner(_chat_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.shared_chats WHERE id = _chat_id AND owner_id = _user_id);
$$;

CREATE POLICY "Members view shared chats" ON public.shared_chats FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_shared_chat_member(id, auth.uid()));
CREATE POLICY "Users create their own shared chats" ON public.shared_chats FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners update shared chats" ON public.shared_chats FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());
CREATE POLICY "Owners delete shared chats" ON public.shared_chats FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Members view membership" ON public.shared_chat_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_shared_chat_member(chat_id, auth.uid()) OR public.is_shared_chat_owner(chat_id, auth.uid()));
CREATE POLICY "Owners add members" ON public.shared_chat_members FOR INSERT TO authenticated
  WITH CHECK (public.is_shared_chat_owner(chat_id, auth.uid()) OR user_id = auth.uid());
CREATE POLICY "Owners update members" ON public.shared_chat_members FOR UPDATE TO authenticated
  USING (public.is_shared_chat_owner(chat_id, auth.uid()));
CREATE POLICY "Owners or self remove member" ON public.shared_chat_members FOR DELETE TO authenticated
  USING (public.is_shared_chat_owner(chat_id, auth.uid()) OR user_id = auth.uid());

CREATE TABLE public.shared_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.shared_chats(id) ON DELETE CASCADE,
  author_user_id uuid,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  attachments jsonb DEFAULT '[]'::jsonb,
  mentions uuid[] DEFAULT ARRAY[]::uuid[],
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_chat_messages TO authenticated;
GRANT ALL ON public.shared_chat_messages TO service_role;
ALTER TABLE public.shared_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_shared_msgs_chat ON public.shared_chat_messages (chat_id, created_at);
CREATE POLICY "Members read messages" ON public.shared_chat_messages FOR SELECT TO authenticated
  USING (public.is_shared_chat_member(chat_id, auth.uid()) OR public.is_shared_chat_owner(chat_id, auth.uid()));
CREATE POLICY "Members write messages" ON public.shared_chat_messages FOR INSERT TO authenticated
  WITH CHECK ((author_user_id = auth.uid()) AND (public.is_shared_chat_member(chat_id, auth.uid()) OR public.is_shared_chat_owner(chat_id, auth.uid())));
CREATE POLICY "Authors delete own messages" ON public.shared_chat_messages FOR DELETE TO authenticated
  USING (author_user_id = auth.uid() OR public.is_shared_chat_owner(chat_id, auth.uid()));

-- Realtime
ALTER TABLE public.shared_chat_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_chat_messages;

CREATE TABLE public.shared_chat_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.shared_chats(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'editor' CHECK (role IN ('editor','viewer')),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24),'hex'),
  invited_by uuid NOT NULL,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_chat_invites TO authenticated;
GRANT ALL ON public.shared_chat_invites TO service_role;
ALTER TABLE public.shared_chat_invites ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_invites_email ON public.shared_chat_invites (lower(email));
CREATE POLICY "Owners manage invites" ON public.shared_chat_invites FOR ALL TO authenticated
  USING (public.is_shared_chat_owner(chat_id, auth.uid())) WITH CHECK (public.is_shared_chat_owner(chat_id, auth.uid()));
CREATE POLICY "Invitees view their invites" ON public.shared_chat_invites FOR SELECT TO authenticated
  USING (lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid())));

CREATE TRIGGER tg_shared_chats_updated BEFORE UPDATE ON public.shared_chats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
