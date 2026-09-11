import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';

export type MemorySummaryOperation = 'save' | 'delete' | 'edit' | 'replace_summary';

export interface MemorySummaryResult {
  summary: string;
  revision: number;
  migrated: boolean;
}

async function invokeMemorySummary(body: Record<string, unknown>): Promise<MemorySummaryResult> {
  if (!supabase || !isSupabaseConfigured) {
    throw new Error('Memory service is not available.');
  }

  const { data, error } = await supabase.functions.invoke('memory-summary', { body });
  if (error) throw error;
  if (!data || typeof data.summary !== 'string') {
    throw new Error(data?.error || 'Memory service returned an invalid response.');
  }

  return {
    summary: data.summary,
    revision: Number(data.revision) || 1,
    migrated: data.migrated !== false,
  };
}

export function getMemorySummary(): Promise<MemorySummaryResult> {
  return invokeMemorySummary({ action: 'get' });
}

export function applyMemorySummary(
  operation: MemorySummaryOperation,
  change?: string,
  summary?: string,
  replaces?: string[],
): Promise<MemorySummaryResult> {
  return invokeMemorySummary({
    action: 'apply',
    operation,
    ...(change !== undefined ? { change } : {}),
    ...(summary !== undefined ? { summary } : {}),
    ...(replaces && replaces.length > 0 ? { replaces } : {}),
  });
}
