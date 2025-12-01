import { useEffect, useState, useRef } from 'react';
import { Construction, AlertTriangle, PartyPopper, ChevronUp, ChevronDown } from 'lucide-react';
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
  const [bannerHeight, setBannerHeight] = useState(0);

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
        handleToggle();
      }, bannerSettings.timeout * 1000);

      return () => clearTimeout(timer);
    }
  }, [bannerSettings.enabled, bannerSettings.timeout, isDismissed]);

  const handleToggle = () => {
    const dismissedKey = `banner_dismissed_${bannerSettings.message}`;
    const newDismissedState = !isDismissed;
    localStorage.setItem(dismissedKey, newDismissedState.toString());
    setIsDismissed(newDismissedState);
  };

  // Update CSS custom property when banner height changes
  useEffect(() => {
    if (bannerRef.current && bannerSettings.enabled && bannerSettings.message && !isDismissed) {
      const height = bannerRef.current.offsetHeight;
      document.documentElement.style.setProperty('--admin-banner-height', `${height}px`);
      setBannerHeight(height);
    } else {
      document.documentElement.style.setProperty('--admin-banner-height', '0px');
      setBannerHeight(0);
    }
  }, [bannerSettings.enabled, bannerSettings.message, loading, isDismissed]);

  if (loading || !bannerSettings.enabled || !bannerSettings.message) {
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
    <>
      {!isDismissed && (
        <div
          ref={bannerRef}
          className="fixed top-0 left-0 right-0 z-50 border-b-2 border-black shadow-lg transition-all duration-300"
          style={{ backgroundColor: bannerSettings.color }}
        >
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-center gap-3 text-black">
              {getIcon()}
              <p className="text-sm md:text-base font-semibold text-center">
                {bannerSettings.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {bannerSettings.dismissible && (
        <button
          onClick={handleToggle}
          className={`fixed left-1/2 -translate-x-1/2 z-40 p-2 bg-[#00f0ff] hover:bg-[#00d4e6] text-black rounded-full shadow-lg transition-all duration-300 ${
            isDismissed ? 'opacity-50 scale-50' : 'opacity-100 scale-100 hover:scale-110'
          }`}
          style={{ top: isDismissed ? '28px' : `${bannerHeight}px` }}
          aria-label={isDismissed ? "Show banner" : "Hide banner"}
          title={isDismissed ? "Show banner" : "Hide banner"}
        >
          {isDismissed ? (
            <ChevronDown className="w-5 h-5" />
          ) : (
            <ChevronUp className="w-5 h-5" />
          )}
        </button>
      )}
    </>
  );
}
