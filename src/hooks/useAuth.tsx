import { useState, useEffect, createContext, useContext } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  context_info: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  needsOnboarding: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  needsOnboarding: false
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        // If profile doesn't exist, create it
        if (error.code === 'PGRST116') {
          await createProfile(userId);
          return;
        }
        return;
      }

      setProfile(data);
      
      // Check if user needs onboarding (no display name set)
      if (data && !data.display_name) {
        setNeedsOnboarding(true);
      } else {
        setNeedsOnboarding(false);
      }
    } catch (error) {
      console.error('Profile fetch error:', error);
      // Fallback: try to create profile if fetch fails
      await createProfile(userId);
    }
  };

  const createProfile = async (userId: string) => {
    try {
      // Get current user to extract metadata
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const displayName = user.user_metadata?.full_name || 
                         user.user_metadata?.name || 
                         user.email?.split('@')[0] || 
                         'New User';

      const { data, error } = await supabase
        .from('profiles')
        .insert({
          user_id: userId,
          display_name: displayName
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating profile:', error);
        return;
      }

      setProfile(data);
      setNeedsOnboarding(false);
    } catch (error) {
      console.error('Profile creation error:', error);
    }
  };

  useEffect(() => {
    let mounted = true;
    let subscription: any = null;

    // Timeout to ensure we don't hang forever
    const timeout = setTimeout(() => {
      if (mounted) {
        console.warn('Auth initialization timed out, continuing anyway');
        setLoading(false);
      }
    }, 5000);

    const initAuth = async () => {
      try {
        // Set up auth state listener
        const { data } = supabase.auth.onAuthStateChange(
          (event, session) => {
            if (!mounted) return;

            setSession(session);
            setUser(session?.user ?? null);

            if (session?.user) {
              // Defer profile fetch to avoid deadlock
              setTimeout(() => {
                if (mounted) {
                  fetchProfile(session.user.id);
                }
              }, 0);
            } else {
              setProfile(null);
              setNeedsOnboarding(false);
            }

            setLoading(false);
          }
        );

        subscription = data.subscription;

        // Check for existing session
        const { data: { session } } = await supabase.auth.getSession();

        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(() => {
            if (mounted) {
              fetchProfile(session.user.id);
            }
          }, 0);
        }

        setLoading(false);
        clearTimeout(timeout);
      } catch (error) {
        console.error('Auth initialization error:', error);
        if (mounted) {
          setLoading(false);
          clearTimeout(timeout);
        }
      }
    };

    initAuth();

    return () => {
      mounted = false;
      clearTimeout(timeout);
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      loading,
      needsOnboarding
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};