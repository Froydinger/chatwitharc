import { useEffect, useState, useRef } from 'react';
import { Construction, AlertTriangle, PartyPopper, X, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface BannerSettings {
  enabled: boolean;
  message: string;
  icon: 'construction' | 'alert' | 'celebrate';
  dismissible: boolean;
  timeout: number;
  color: string;
}

// Hook to check if admin banner is active
export function useAdminBanner() {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const checkBanner = async () => {
      try {
        const { data, error } = await supabase
          .from('admin_settings')
          .select('key, value')
          .in('key', ['banner_enabled', 'banner_message']);

        if (error) throw error;

        const settings = data?.reduce((acc, item) => {
          acc[item.key] = item.value;
          return acc;
        }, {} as Record<string, string>) || {};

        const enabled = settings.banner_enabled === 'true';
        const hasMessage = !!settings.banner_message;

        // Check if user dismissed it (if dismissible)
        const dismissedKey = `banner_dismissed_${settings.banner_message}`;
        const isDismissed = localStorage.getItem(dismissedKey) === 'true';

        setIsActive(enabled && hasMessage && !isDismissed);
      } catch (err) {
        console.error('Error checking banner:', err);
        setIsActive(false);
      }
    };

    checkBanner();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('admin-banner-check')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_settings',
          filter: 'key=in.(banner_enabled,banner_message)'
        },
        () => {
          checkBanner();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return isActive;
}

export function AdminBanner() {
  const bannerRef = useRef<HTMLDivElement>(null);
  const [bannerSettings, setBannerSettings] = useState<BannerSettings>({
    enabled: false,
    message: '',
    icon: 'alert',
    dismissible: false,
    timeout: 0,
    color: '#00f0ff'
  });
  const [loading, setLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  const fetchBannerSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('key, value')
        .in('key', ['banner_enabled', 'banner_message', 'banner_icon', 'banner_dismissible', 'banner_timeout', 'banner_color']);

      if (error) throw error;

      const settings = data?.reduce((acc, item) => {
        acc[item.key] = item.value;
        return acc;
      }, {} as Record<string, string>) || {};

      const newSettings = {
        enabled: settings.banner_enabled === 'true',
        message: settings.banner_message || '',
        icon: (settings.banner_icon as 'construction' | 'alert' | 'celebrate') || 'alert',
        dismissible: settings.banner_dismissible === 'true',
        timeout: parseInt(settings.banner_timeout || '0', 10),
        color: settings.banner_color || '#00f0ff'
      };

      setBannerSettings(newSettings);

      // Check localStorage for dismissed state
      const dismissedKey = `banner_dismissed_${newSettings.message}`;
      const wasDismissed = localStorage.getItem(dismissedKey) === 'true';
      setIsDismissed(wasDismissed);
    } catch (err) {
      console.error('Error fetching banner settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBannerSettings();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('admin-banner-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_settings',
          filter: 'key=in.(banner_enabled,banner_message,banner_icon,banner_dismissible,banner_timeout,banner_color)'
        },
        () => {
          fetchBannerSettings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-timeout effect
  useEffect(() => {
    if (bannerSettings.enabled && bannerSettings.timeout > 0 && !isDismissed) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, bannerSettings.timeout * 1000);

      return () => clearTimeout(timer);
    }
  }, [bannerSettings.enabled, bannerSettings.timeout, isDismissed]);

  const handleDismiss = () => {
    const dismissedKey = `banner_dismissed_${bannerSettings.message}`;
    localStorage.setItem(dismissedKey, 'true');
    setIsDismissed(true);
  };

  // Update CSS custom property when banner height changes
  useEffect(() => {
    if (bannerRef.current && bannerSettings.enabled && bannerSettings.message && !isDismissed) {
      const height = bannerRef.current.offsetHeight;
      document.documentElement.style.setProperty('--admin-banner-height', `${height}px`);
    } else {
      document.documentElement.style.setProperty('--admin-banner-height', '0px');
    }
  }, [bannerSettings.enabled, bannerSettings.message, loading, isDismissed]);

  if (loading || !bannerSettings.enabled || !bannerSettings.message || isDismissed) {
    return null;
  }

  const getIcon = () => {
    switch (bannerSettings.icon) {
      case 'construction':
        return <Construction className="w-5 h-5 flex-shrink-0" />;
      case 'celebrate':
        return <PartyPopper className="w-5 h-5 flex-shrink-0" />;
      case 'alert':
      default:
        return <AlertTriangle className="w-5 h-5 flex-shrink-0" />;
    }
  };

  return (
    <div
      ref={bannerRef}
      className="fixed top-0 left-0 right-0 z-50 border-b-2 border-black shadow-lg"
      style={{ backgroundColor: bannerSettings.color }}
    >
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-center gap-3 text-black relative">
          {getIcon()}
          <p className="text-sm md:text-base font-semibold text-center">
            {bannerSettings.message}
          </p>
          {bannerSettings.dismissible && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-1">
              <button
                onClick={handleDismiss}
                className="p-1 hover:bg-black/10 rounded transition-colors relative z-40"
                aria-label="Hide banner"
                title="Hide banner"
              >
                <ChevronUp className="w-5 h-5" />
              </button>
              <button
                onClick={handleDismiss}
                className="p-1 hover:bg-black/10 rounded transition-colors"
                aria-label="Dismiss banner"
                title="Dismiss banner"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
