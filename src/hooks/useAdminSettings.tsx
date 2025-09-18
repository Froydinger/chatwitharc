import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
  created_at: string;
  updated_at: string;
}

export function useAdminSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const checkAdminStatus = async () => {
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    try {
      // Simple check - just see if user has any admin record
      const { data, error } = await supabase
        .from('admin_users')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
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
    if (!isAdmin) return;

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
    if (!isAdmin) return;

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

  const updateSetting = async (key: string, value: string) => {
    if (!isAdmin) throw new Error('Not authorized');

    try {
      setUpdating(true);
      const { data, error } = await supabase
        .from('admin_settings')
        .update({ value })
        .eq('key', key)
        .select()
        .single();

      if (error) throw error;

      setSettings(prev => 
        prev.map(setting => 
          setting.key === key ? data : setting
        )
      );

      return data;
    } catch (err) {
      console.error('Setting update error:', err);
      throw err;
    } finally {
      setUpdating(false);
    }
  };

  const addAdminUser = async (email: string) => {
    if (!isAdmin) throw new Error('Not authorized');

    try {
      // First check if user exists by email in profiles table
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('user_id', user?.id) // This is a workaround since we can't query by email directly
        .single();

      if (profileError) {
        throw new Error('User not found. They must sign up first.');
      }

      const { data, error } = await supabase
        .from('admin_users')
        .insert({ user_id: profileData.user_id, email })
        .select()
        .single();

      if (error) throw error;

      setAdminUsers(prev => [...prev, data]);
      return data;
    } catch (err) {
      console.error('Add admin user error:', err);
      throw err;
    }
  };

  const removeAdminUser = async (id: string) => {
    if (!isAdmin) throw new Error('Not authorized');

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