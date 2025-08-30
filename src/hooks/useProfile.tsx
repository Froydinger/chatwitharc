import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useProfile() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [updating, setUpdating] = useState(false);

  const updateProfile = useCallback(async (updates: {
    display_name?: string;
    context_info?: string;
  }) => {
    if (!user) return;

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          ...updates
        });

      if (error) throw error;

      toast({
        title: "Profile updated",
        description: "Your information has been saved successfully"
      });

      // Trigger a refetch of the profile
      window.location.reload();
    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive"
      });
    } finally {
      setUpdating(false);
    }
  }, [user, toast]);

  return {
    profile,
    updateProfile,
    updating
  };
}