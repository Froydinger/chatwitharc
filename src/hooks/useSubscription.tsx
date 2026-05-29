import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { paymentsAvailable, getStripeEnvironment } from '@/lib/stripe';

// ArcAI is free forever. ArcAi Boost ($7/mo) is an OPTIONAL upgrade that
// removes the two soft limits below.
export const FREE_DAILY_IMAGE_LIMIT = 10;       // per UTC day
export const FREE_VOICE_LIMIT_30D = 10;         // rolling 30 days

// Legacy exports kept so existing call sites don't break.
const FREE_DAILY_MESSAGE_LIMIT = Infinity;
const FREE_DAILY_VOICE_LIMIT = FREE_VOICE_LIMIT_30D;

const UNLIMITED_EMAILS = new Set([
  'j@froydinger.com',
  'lopezvivtorymma@gmail.com',
]);

const DAILY_IMAGE_KEY = 'arcai-daily-images';
const DAILY_DATE_KEY = 'arcai-daily-date';

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function rolloverIfNeeded() {
  const today = getTodayKey();
  if (localStorage.getItem(DAILY_DATE_KEY) !== today) {
    localStorage.setItem(DAILY_DATE_KEY, today);
    localStorage.setItem(DAILY_IMAGE_KEY, '0');
  }
}

function getDailyImageCount(): number {
  rolloverIfNeeded();
  return parseInt(localStorage.getItem(DAILY_IMAGE_KEY) || '0', 10);
}

function incrementDailyImageCount(): number {
  rolloverIfNeeded();
  const count = getDailyImageCount() + 1;
  localStorage.setItem(DAILY_IMAGE_KEY, String(count));
  return count;
}

interface SubscriptionState {
  // Boost entitlement
  hasBoost: boolean;
  loading: boolean;

  // Image quota (daily, client-side)
  dailyImagesUsed: number;
  canGenerateImage: boolean;
  remainingImages: number;

  // Voice quota (rolling 30 days, server-side)
  voiceConversations30d: number;
  canStartVoiceConversation: boolean;
  remainingVoiceConversations: number;

  // Always-true (kept for legacy call sites)
  isSubscribed: boolean;
  canSendMessage: boolean;
  canUseVoice: boolean;
  dailyMessagesUsed: number;
  dailyVoiceSessionsUsed: number;
  remainingMessages: number;
  remainingVoiceSessions: number;
  subscriptionEnd: string | null;
  paymentStatus: 'ok' | 'past_due' | 'none';

  // Actions
  checkSubscription: () => Promise<void>;
  refreshVoiceCount: () => Promise<void>;
  recordMessage: () => void;
  recordVoiceSession: () => void;
  recordVoiceConversation: () => Promise<void>;
  recordImageGeneration: () => void;
  openCheckout: () => void;
  openCustomerPortal: () => Promise<void>;

  // Constants
  FREE_DAILY_MESSAGE_LIMIT: number;
  FREE_DAILY_VOICE_LIMIT: number;
  FREE_DAILY_IMAGE_LIMIT: number;
  FREE_VOICE_LIMIT_30D: number;
}

const SubscriptionContext = createContext<SubscriptionState | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasBoostSub, setHasBoostSub] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dailyImagesUsed, setDailyImagesUsed] = useState(() => getDailyImageCount());
  const [voiceConversations30d, setVoiceConversations30d] = useState(0);

  const emailUnlimited = !!user?.email && UNLIMITED_EMAILS.has(user.email.toLowerCase());
  const hasBoost = isAdmin || emailUnlimited || hasBoostSub;

  const canGenerateImage = hasBoost || dailyImagesUsed < FREE_DAILY_IMAGE_LIMIT;
  const remainingImages = hasBoost
    ? Infinity
    : Math.max(0, FREE_DAILY_IMAGE_LIMIT - dailyImagesUsed);

  const canStartVoiceConversation = hasBoost || voiceConversations30d < FREE_VOICE_LIMIT_30D;
  const remainingVoiceConversations = hasBoost
    ? Infinity
    : Math.max(0, FREE_VOICE_LIMIT_30D - voiceConversations30d);

  const refreshVoiceCount = useCallback(async () => {
    if (!user || !supabase) {
      setVoiceConversations30d(0);
      return;
    }
    try {
      const { data, error } = await supabase.rpc('count_voice_conversations_30d', {
        target_user_id: user.id,
      });
      if (!error && typeof data === 'number') setVoiceConversations30d(data);
    } catch (err) {
      console.error('[subscription] voice count failed', err);
    }
  }, [user]);

  const checkSubscription = useCallback(async () => {
    if (!user || !supabase) {
      setIsAdmin(false);
      setHasBoostSub(false);
      setLoading(false);
      return;
    }
    try {
      const [{ data: adminData }, { data: boostData }] = await Promise.all([
        supabase.rpc('is_admin_user'),
        supabase.rpc('user_has_boost', { check_user_id: user.id }),
      ]);
      setIsAdmin(!!adminData);
      setHasBoostSub(!!boostData);
    } catch (err) {
      console.error('[subscription] check failed', err);
    } finally {
      setLoading(false);
    }
    await refreshVoiceCount();
  }, [user, refreshVoiceCount]);

  const recordMessage = useCallback(() => { /* unlimited */ }, []);
  const recordVoiceSession = useCallback(() => { /* legacy no-op */ }, []);

  // Called when a voice session has had at least one user+assistant exchange.
  const recordVoiceConversation = useCallback(async () => {
    if (!user || !supabase || hasBoost) return;
    try {
      await supabase.rpc('record_voice_conversation', { target_user_id: user.id });
      setVoiceConversations30d((c) => c + 1);
    } catch (err) {
      console.error('[subscription] record voice convo failed', err);
    }
  }, [user, hasBoost]);

  const recordImageGeneration = useCallback(() => {
    if (!hasBoost) {
      const count = incrementDailyImageCount();
      setDailyImagesUsed(count);
    }
  }, [hasBoost]);

  // Opens the Boost upgrade modal (mounted globally in App.tsx).
  const openCheckout = useCallback(() => {
    window.dispatchEvent(new CustomEvent('open-upgrade-modal'));
  }, []);

  const openCustomerPortal = useCallback(async () => {
    if (!paymentsAvailable()) {
      window.alert('Billing portal is not configured yet.');
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('payments-portal', {
        body: {
          environment: getStripeEnvironment(),
          returnUrl: window.location.origin,
        },
      });
      if (error || !data?.url) throw new Error(error?.message || data?.error || 'Portal unavailable');
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('[subscription] portal failed', err);
      window.alert(err instanceof Error ? err.message : 'Could not open billing portal');
    }
  }, []);

  useEffect(() => { checkSubscription(); }, [checkSubscription]);

  useEffect(() => {
    const handleFocus = () => {
      setDailyImagesUsed(getDailyImageCount());
      refreshVoiceCount();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refreshVoiceCount]);

  // Realtime: re-check Boost when a subscription row changes
  useEffect(() => {
    if (!user || !supabase) return;
    const channel = supabase
      .channel(`boost-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${user.id}` },
        () => checkSubscription(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, checkSubscription]);

  return (
    <SubscriptionContext.Provider value={{
      hasBoost,
      loading,
      dailyImagesUsed,
      canGenerateImage,
      remainingImages,
      voiceConversations30d,
      canStartVoiceConversation,
      remainingVoiceConversations,

      // Legacy
      isSubscribed: hasBoost,
      canSendMessage: true,
      canUseVoice: canStartVoiceConversation,
      dailyMessagesUsed: 0,
      dailyVoiceSessionsUsed: voiceConversations30d,
      remainingMessages: Infinity,
      remainingVoiceSessions: remainingVoiceConversations,
      subscriptionEnd: null,
      paymentStatus: 'ok',

      checkSubscription,
      refreshVoiceCount,
      recordMessage,
      recordVoiceSession,
      recordVoiceConversation,
      recordImageGeneration,
      openCheckout,
      openCustomerPortal,
      FREE_DAILY_MESSAGE_LIMIT,
      FREE_DAILY_VOICE_LIMIT,
      FREE_DAILY_IMAGE_LIMIT,
      FREE_VOICE_LIMIT_30D,
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
