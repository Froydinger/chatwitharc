import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Hook to check admin access status.
 * 
 * SECURITY NOTE: This hook provides UI-level admin checks for UX purposes only.
 * The actual security boundary is enforced server-side via:
 * - RLS policies using is_admin_user() SECURITY DEFINER function
 * - Edge function authentication checks
 * - Database-level access controls
 * 
 * Even if a user manipulates client state, they cannot access admin data
 * because all backend operations are protected by RLS.
 */
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
        // Use the server-side is_admin_user() RPC function for verification
        // This calls a SECURITY DEFINER function that checks admin_users table
        const { data, error } = await supabase.rpc('is_admin_user');

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