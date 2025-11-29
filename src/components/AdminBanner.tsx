import { useEffect, useState } from 'react';
import { Construction, AlertTriangle, PartyPopper } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface BannerSettings {
  enabled: boolean;
  message: string;
  icon: 'construction' | 'alert' | 'celebrate';
}

export function AdminBanner() {
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
    <div className="fixed top-0 left-0 right-0 z-50 bg-[#00f0ff] border-b-2 border-black shadow-lg">
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
