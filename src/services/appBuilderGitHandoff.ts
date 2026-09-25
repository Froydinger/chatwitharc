import { supabase } from '@/integrations/supabase/client';
import { readEdgeErrorBody } from '@/lib/invokeEdgeFunction';

export type AppBuilderGitHandoffInput = {
  projectId: string;
  repo: string;
  targetPlatform: string;
  targetDatabase: string;
};

export type AppBuilderGitHandoffResult = {
  success: true;
  repo: string;
  baseBranch: string;
  branch: string;
  commitSha: string;
  pullRequestUrl: string;
};

export async function createAppBuilderDraftPullRequest(input: AppBuilderGitHandoffInput): Promise<AppBuilderGitHandoffResult> {
  const { data, error } = await supabase.functions.invoke('app-builder-git-handoff', { body: input });
  if (error) {
    const parsed = await readEdgeErrorBody(error);
    const message = parsed && typeof parsed.error === 'string' ? parsed.error : error.message;
    throw new Error(message || 'Could not create a Git handoff.');
  }
  if (!data || data.error || data.success !== true || typeof data.pullRequestUrl !== 'string') {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Git handoff returned an invalid response.');
  }
  return data as AppBuilderGitHandoffResult;
}
