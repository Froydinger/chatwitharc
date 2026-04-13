import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface AdminSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  role: string;
  is_primary_admin: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Hook to manage admin settings and admin users.
 * 
 * SECURITY NOTE: Admin status checks are for UI purposes only.
 * The actual security boundary is enforced server-side via:
 * - RLS policies using is_admin_user() SECURITY DEFINER function
 * - Database-level access controls on admin_settings and admin_users tables
 * 
 * Even if a user manipulates client state, they cannot access admin data
 * because all backend operations are protected by RLS.
 */
export function useAdminSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const checkAdminStatus = async () => {
    if (!user || !supabase || !isSupabaseConfigured) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    try {
      // Use the server-side is_admin_user() RPC function for verification
      // This calls a SECURITY DEFINER function that checks admin_users table
      const { data, error } = await supabase.rpc('is_admin_user');

      if (error) {
        console.error('Admin check error:', error);
        setIsAdmin(false);
      } else {
        setIsAdmin(!!data);
      }
    } catch (err) {
      console.error('Admin check error:', err);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    if (!isAdmin || !supabase) return;

    try {
      setError(null);

      const { data, error } = await supabase
        .from('admin_settings')
        .select('*')
        .order('key');

      if (error) throw error;
      setSettings(data || []);
    } catch (err) {
      console.error('Settings fetch error:', err);
      setError(err as Error);
    }
  };

  const fetchAdminUsers = async () => {
    if (!isAdmin || !supabase) return;

    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .order('email');

      if (error) throw error;
      setAdminUsers(data || []);
    } catch (err) {
      console.error('Admin users fetch error:', err);
      setError(err as Error);
    }
  };

  const getSetting = (key: string) => {
    return settings.find(s => s.key === key)?.value || '';
  };

  const updateSetting = async (key: string, value: string, description: string = '') => {
    if (!isAdmin || !supabase) throw new Error('Not authorized');

    try {
      setUpdating(true);
      const { data, error } = await supabase
        .from('admin_settings')
        .upsert({ key, value, description }, { onConflict: 'key' })
        .select()
        .single();

      if (error) throw error;

      setSettings(prev => {
        const existingIndex = prev.findIndex(s => s.key === key);
        if (existingIndex >= 0) {
          return prev.map(setting => setting.key === key ? data : setting);
        } else {
          return [...prev, data];
        }
      });

      return data;
    } catch (err) {
      console.error('Setting update error:', err);
      throw err;
    } finally {
      setUpdating(false);
    }
  };

  const addAdminUser = async (email: string) => {
    if (!isAdmin || !supabase) throw new Error('Not authorized');

    try {
      // Use the admin-users edge function which has service role access
      // to look up users by email via auth.admin API
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('No session');

      const { data: fnData, error: fnError } = await supabase.functions.invoke('admin-users', {
        body: { action: 'add_by_email', email },
      });

      if (fnError) throw new Error(fnError.message || 'Failed to add admin');
      if (fnData?.error) throw new Error(fnData.error);

      // Refresh admin users list
      await fetchAdminUsers();
      return fnData;
    } catch (err) {
      console.error('Add admin user error:', err);
      throw err;
    }
  };

  const removeAdminUser = async (id: string) => {
    if (!isAdmin || !supabase) throw new Error('Not authorized');

    try {
      const { error } = await supabase
        .from('admin_users')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setAdminUsers(prev => prev.filter(user => user.id !== id));
    } catch (err) {
      console.error('Remove admin user error:', err);
      throw err;
    }
  };

  const refetch = async () => {
    await fetchSettings();
    await fetchAdminUsers();
  };

  useEffect(() => {
    checkAdminStatus();
  }, [user]);

  useEffect(() => {
    if (isAdmin) {
      fetchSettings();
      fetchAdminUsers();
    }
  }, [isAdmin]);

  return {
    settings,
    adminUsers,
    isAdmin,
    loading,
    updating,
    error,
    getSetting,
    updateSetting,
    addAdminUser,
    removeAdminUser,
    refetch
  };
}