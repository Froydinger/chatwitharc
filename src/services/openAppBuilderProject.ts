import { supabase } from '@/integrations/supabase/client';
import { useIDEStore } from '@/store/useIDEStore';
import { loadAppBuilderProject } from '@/services/appBuilderProject';
import type { AppBuilderProjectSummary } from '@/utils/appBuilderIntent';

const PAGE_SIZE = 100;

/** Fetch only private project labels needed to choose an app. App source files stay out of Chat. */
export async function listOwnedAppBuilderProjects(): Promise<AppBuilderProjectSummary[]> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Sign in to find your saved apps.');

  const projects: AppBuilderProjectSummary[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('ide_projects')
      .select('id,title,prompt,netlify_subdomain,favicon_label,updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as AppBuilderProjectSummary[];
    projects.push(...page);
    if (page.length < PAGE_SIZE) return projects;
  }
}

/** Load and ownership-check the latest saved snapshot before opening an app for edits. */
export async function reopenOwnedAppBuilderProject(projectId: string, initialPrompt?: string) {
  const loaded = await loadAppBuilderProject(projectId);
  if (!loaded.row) throw new Error('That saved app is no longer available in your account.');

  useIDEStore.getState().reopenIDECanvas(
    projectId,
    loaded.files,
    loaded.messages,
    initialPrompt,
  );
  return loaded.row;
}
