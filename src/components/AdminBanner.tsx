import { useEffect, useState, useRef } from 'react';
import { Construction, AlertTriangle, PartyPopper, ChevronUp, ChevronDown } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';

interface BannerSettings {
  enabled: boolean;
  message: string;
  icon: 'construction' | 'alert' | 'celebrate';
  dismissible: boolean;
  timeout: number;
  color: string;
  link?: string;
}

// -----------------------------------------------------------------------------
// Shared banner cache + lightweight pub/sub.
// Previously, every component using `useAdminBanner` (and the AdminBanner itself)
// opened its own Supabase realtime channel + ran its own query on every mount.
// On a single page that meant 3-5 persistent WebSocket subscriptions and
// duplicate DB reads per user — a recurring monthly Cloud cost for a banner
// that almost never changes. We now:
//   • Fetch ONCE on app load, then refresh only when the tab regains focus.
//   • Share the result across every subscriber via a module-level store.
//   • No realtime channels, no polling timers.
// -----------------------------------------------------------------------------

const BANNER_KEYS = [
  'banner_enabled',
  'banner_message',
  'banner_icon',
  'banner_dismissible',
  'banner_timeout',
  'banner_color',
  'banner_link',
] as const;

const EMPTY_SETTINGS: BannerSettings = {
  enabled: false,
  message: '',
  icon: 'alert',
  dismissible: false,
  timeout: 0,
  color: '#00f0ff',
  link: '',
};

let cachedSettings: BannerSettings = EMPTY_SETTINGS;
let cachedRawMessage = '';
let inFlight: Promise<void> | null = null;
let lastFetchedAt = 0;
const subscribers = new Set<() => void>();

async function fetchSettingsOnce(force = false): Promise<void> {
  if (!supabase || !isSupabaseConfigured) return;
  // Throttle: don't re-query more than once every 60s unless forced.
  if (!force && Date.now() - lastFetchedAt < 60_000) return;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('key, value')
        .in('key', BANNER_KEYS as unknown as string[]);

      if (error) throw error;

      const settings = data?.reduce((acc, item) => {
        acc[item.key] = item.value;
        return acc;
      }, {} as Record<string, string>) || {};

      cachedSettings = {
        enabled: settings.banner_enabled === 'true',
        message: settings.banner_message || '',
        icon: (settings.banner_icon as 'construction' | 'alert' | 'celebrate') || 'alert',
        dismissible: settings.banner_dismissible === 'true',
        timeout: parseInt(settings.banner_timeout || '0', 10),
        color: settings.banner_color || '#00f0ff',
        link: settings.banner_link || '',
      };
      cachedRawMessage = cachedSettings.message;
      lastFetchedAt = Date.now();
      subscribers.forEach((cb) => cb());
    } catch (err) {
      console.error('Error fetching banner settings:', err);
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

// Refresh when the tab regains focus — cheap, replaces realtime.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchSettingsOnce();
    }
  });
}

function useBannerSettings() {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((n) => n + 1);
    subscribers.add(cb);
    fetchSettingsOnce();
    return () => {
      subscribers.delete(cb);
    };
  }, []);
  return cachedSettings;
}

// Hook to check if admin banner is active (used for layout offsets).
export function useAdminBanner() {
  const settings = useBannerSettings();
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (!settings.dismissible) {
      setIsDismissed(false);
      return;
    }
    const dismissedKey = `banner_dismissed_${settings.message}`;
    setIsDismissed(localStorage.getItem(dismissedKey) === 'true');
  }, [settings.message, settings.dismissible]);

  return settings.enabled && !!settings.message && (!settings.dismissible || !isDismissed);
}

export function AdminBanner() {
  const bannerRef = useRef<HTMLDivElement>(null);
  const bannerSettings = useBannerSettings();
  const [isDismissed, setIsDismissed] = useState(false);
  const [bannerHeight, setBannerHeight] = useState(0);

  useEffect(() => {
    if (!bannerSettings.dismissible) {
      setIsDismissed(false);
      return;
    }
    const dismissedKey = `banner_dismissed_${bannerSettings.message}`;
    setIsDismissed(localStorage.getItem(dismissedKey) === 'true');
  }, [bannerSettings.message, bannerSettings.dismissible]);

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
  }, [bannerSettings.enabled, bannerSettings.message, isDismissed]);

  if (!bannerSettings.enabled || !bannerSettings.message) {
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

  const renderContent = () => (
    <>
      {getIcon()}
      <p className="text-sm md:text-base font-semibold text-center">
        {bannerSettings.message}
      </p>
    </>
  );

  return (
    <>
      {!isDismissed && (
        <div
          ref={bannerRef}
          className="fixed top-0 left-0 right-0 z-50 border-b-2 border-black shadow-lg transition-all duration-300"
          style={{ backgroundColor: bannerSettings.color }}
        >
          <div className="container mx-auto px-4 py-3">
            {bannerSettings.link ? (
              <a
                href={bannerSettings.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-3 text-black hover:opacity-90 hover:underline cursor-pointer"
              >
                {renderContent()}
              </a>
            ) : (
              <div className="flex items-center justify-center gap-3 text-black">
                {renderContent()}
              </div>
            )}
          </div>
        </div>
      )}

      {bannerSettings.dismissible && (
        <button
          onClick={handleToggle}
          className={`fixed left-1/2 -translate-x-1/2 z-30 p-2 text-black rounded-full shadow-lg transition-all duration-300 ${
            isDismissed ? 'opacity-50 scale-50' : 'opacity-100 scale-100 hover:scale-110'
          }`}
          style={{
            top: isDismissed ? 'calc(6px + env(safe-area-inset-top, 0px))' : `${bannerHeight}px`,
            backgroundColor: bannerSettings.color
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.filter = 'brightness(0.9)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = 'brightness(1)';
          }}
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
