import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

type Theme = 'dark' | 'light';

export function useTheme() {
  const { user } = useAuth();
  const [isLoaded, setIsLoaded] = useState(false);
  const [followSystem, setFollowSystem] = useState(() => {
    const saved = localStorage.getItem('followSystemTheme');
    // Default to true (follow system) if not explicitly set
    return saved === null ? true : saved === 'true';
  });

  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved as Theme;
    
    // Check system preference on first load
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  // Load theme from profile on mount
  useEffect(() => {
    if (!user || isLoaded) return;

    const loadTheme = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('theme_preference')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!error && data?.theme_preference) {
          if (data.theme_preference === 'system') {
            setFollowSystem(true);
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            setTheme(isDark ? 'dark' : 'light');
          } else {
            setFollowSystem(false);
            setTheme(data.theme_preference as Theme);
            localStorage.setItem('theme', data.theme_preference);
          }
        }
        setIsLoaded(true);
      } catch (err) {
        console.error('Failed to load theme:', err);
        setIsLoaded(true);
      }
    };

    loadTheme();
  }, [user, isLoaded]);

  // Listen for system theme changes
  useEffect(() => {
    if (!followSystem) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      const newTheme = e.matches ? 'dark' : 'light';
      setTheme(newTheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    
    // Set initial theme based on system preference
    const systemTheme = mediaQuery.matches ? 'dark' : 'light';
    setTheme(systemTheme);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [followSystem]);

  useEffect(() => {
    const root = document.documentElement;
    
    // Remove any existing theme classes
    root.classList.remove('light', 'dark');
    
    // Add the current theme class
    root.classList.add(theme);
    
    // Save to localStorage (only if not following system)
    if (!followSystem) {
      localStorage.setItem('theme', theme);
    }
  }, [theme, followSystem]);

  const toggleTheme = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);

    // Save to profile if user is logged in
    if (user) {
      try {
        await supabase
          .from('profiles')
          .update({ theme_preference: newTheme })
          .eq('user_id', user.id);
      } catch (err) {
        console.error('Failed to save theme to profile:', err);
      }
    }
  };

  const toggleFollowSystem = async (enabled: boolean) => {
    setFollowSystem(enabled);
    localStorage.setItem('followSystemTheme', enabled.toString());
    
    if (enabled) {
      // Immediately apply system theme
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(isDark ? 'dark' : 'light');
    }

    // Save to profile if user is logged in
    if (user) {
      try {
        await supabase
          .from('profiles')
          .update({ theme_preference: enabled ? 'system' : theme })
          .eq('user_id', user.id);
      } catch (err) {
        console.error('Failed to save theme preference to profile:', err);
      }
    }
  };

  return { theme, toggleTheme, followSystem, toggleFollowSystem };
}