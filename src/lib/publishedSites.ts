import { supabase } from '@/integrations/supabase/client';

export interface PublishedSite {
  id: string;
  user_id: string;
  netlify_site_id: string;
  subdomain: string;
  url: string;
  title: string;
  favicon_svg: string | null;
  favicon_data: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  code: string | null;
  code_language: string | null;
  created_at: string;
  updated_at: string;
}

export async function savePublishedSite(
  record: Omit<PublishedSite, 'id' | 'user_id' | 'created_at' | 'updated_at'>
): Promise<PublishedSite> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('published_sites' as any)
    .insert({ ...record, user_id: user.id })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as PublishedSite;
}

export async function updatePublishedSite(
  id: string,
  updates: Partial<Omit<PublishedSite, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<PublishedSite> {
  const { data, error } = await supabase
    .from('published_sites' as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as PublishedSite;
}

export async function deletePublishedSite(id: string): Promise<void> {
  const { error } = await supabase
    .from('published_sites' as any)
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}
