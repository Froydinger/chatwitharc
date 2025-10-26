import { useState, useEffect } from 'react';

type Theme = 'dark' | 'light';

export function useTheme() {
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

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'dark' ? 'light' : 'dark');
  };

  const toggleFollowSystem = (enabled: boolean) => {
    setFollowSystem(enabled);
    localStorage.setItem('followSystemTheme', enabled.toString());
    
    if (enabled) {
      // Immediately apply system theme
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(isDark ? 'dark' : 'light');
    }
  };

  return { theme, toggleTheme, followSystem, toggleFollowSystem };
}