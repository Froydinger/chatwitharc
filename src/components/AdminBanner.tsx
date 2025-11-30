import { useEffect, useState, useRef } from 'react';
import { Construction, AlertTriangle, PartyPopper } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface BannerSettings {
  enabled: boolean;
  message: string;
  icon: 'construction' | 'alert' | 'celebrate';
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
        setIsActive(enabled && hasMessage);
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
    icon: 'alert'
  });
  const [loading, setLoading] = useState(true);

  const fetchBannerSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('key, value')
        .in('key', ['banner_enabled', 'banner_message', 'banner_icon']);

      if (error) throw error;

      const settings = data?.reduce((acc, item) => {
        acc[item.key] = item.value;
        return acc;
      }, {} as Record<string, string>) || {};

      setBannerSettings({
        enabled: settings.banner_enabled === 'true',
        message: settings.banner_message || '',
        icon: (settings.banner_icon as 'construction' | 'alert' | 'celebrate') || 'alert'
      });
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
          filter: 'key=in.(banner_enabled,banner_message,banner_icon)'
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

  // Update CSS custom property when banner height changes
  useEffect(() => {
    if (bannerRef.current && bannerSettings.enabled && bannerSettings.message) {
      const height = bannerRef.current.offsetHeight;
      document.documentElement.style.setProperty('--admin-banner-height', `${height}px`);
    } else {
      document.documentElement.style.setProperty('--admin-banner-height', '0px');
    }
  }, [bannerSettings.enabled, bannerSettings.message, loading]);

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
    <div ref={bannerRef} className="fixed top-0 left-0 right-0 z-50 bg-[#00f0ff] border-b-2 border-black shadow-lg">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-center gap-3 text-black">
          {getIcon()}
          <p className="text-sm md:text-base font-semibold text-center">
            {bannerSettings.message}
          </p>
        </div>
      </div>
    </div>
  );
}
