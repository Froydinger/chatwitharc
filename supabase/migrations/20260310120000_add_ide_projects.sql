CREATE TABLE public.ide_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Untitled Project',
  prompt text NOT NULL DEFAULT '',
  files jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  versions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ide_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own IDE projects" ON public.ide_projects FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own IDE projects" ON public.ide_projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own IDE projects" ON public.ide_projects FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own IDE projects" ON public.ide_projects FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_ide_projects_updated_at BEFORE UPDATE ON public.ide_projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
