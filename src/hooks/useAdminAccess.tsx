import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useAdminAccess() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdminAccess = async () => {
      if (!user || !supabase || !isSupabaseConfigured) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('admin_users')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error checking admin access:', error);
          setIsAdmin(false);
        } else {
          setIsAdmin(!!data);
        }
      } catch (err) {
        console.error('Error checking admin access:', err);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdminAccess();
  }, [user]);

  return { isAdmin, loading };
}