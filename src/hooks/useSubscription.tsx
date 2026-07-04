import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { paymentsAvailable, getStripeEnvironment } from '@/lib/stripe';

// ArcAI limits
export const FREE_DAILY_IMAGE_LIMIT = 10;
export const BOOST_DAILY_IMAGE_LIMIT = 30;
export const FREE_DAILY_SMARTER_CHAT_LIMIT = 20;

export const FREE_VOICE_LIMIT_30D = 10;

// Legacy exports kept so existing call sites don't break.
const FREE_DAILY_MESSAGE_LIMIT = Infinity;
const FREE_DAILY_VOICE_LIMIT = FREE_VOICE_LIMIT_30D;

const UNLIMITED_EMAILS = new Set([
  'j@froydinger.com',
  'lopezvivtorymma@gmail.com',
]);

const DAILY_IMAGE_KEY = 'arcai-daily-images';
const DAILY_SMARTER_CHAT_KEY = 'arcai-daily-smarter-chats';
const DAILY_DATE_KEY = 'arcai-daily-date';

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function rolloverIfNeeded() {
  const today = getTodayKey();
  if (localStorage.getItem(DAILY_DATE_KEY) !== today) {
    localStorage.setItem(DAILY_DATE_KEY, today);
    localStorage.setItem(DAILY_IMAGE_KEY, '0');
    localStorage.setItem(DAILY_SMARTER_CHAT_KEY, '0');
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

function getDailySmarterChatCount(): number {
  rolloverIfNeeded();
  return parseInt(localStorage.getItem(DAILY_SMARTER_CHAT_KEY) || '0', 10);
}

function incrementDailySmarterChatCount(): number {
  rolloverIfNeeded();
  const count = getDailySmarterChatCount() + 1;
  localStorage.setItem(DAILY_SMARTER_CHAT_KEY, String(count));
  return count;
}

interface SubscriptionState {
  // Boost entitlement
  hasBoost: boolean;
  isAdmin: boolean;
  loading: boolean;

  // Image quota (daily, client-side & server-side matched)
  dailyImagesUsed: number;
  canGenerateImage: boolean;
  remainingImages: number;
  imageLimit: number;

  // Smarter Chat quota (daily, client-side & server-side matched)
  dailySmarterChatsUsed: number;
  canSendSmarterChat: boolean;
  remainingSmarterChats: number;
  smarterChatLimit: number;

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
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string | null;

  // Actions
  checkSubscription: () => Promise<void>;
  refreshVoiceCount: () => Promise<void>;
  recordMessage: () => void;
  recordVoiceSession: () => void;
  recordVoiceConversation: () => Promise<void>;
  recordImageGeneration: () => void;
  recordSmarterChat: () => void;
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
  const [dailySmarterChatsUsed, setDailySmarterChatsUsed] = useState(() => getDailySmarterChatCount());
  const [voiceConversations30d, setVoiceConversations30d] = useState(0);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState<boolean>(false);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<string | null>(null);

  const emailUnlimited = !!user?.email && UNLIMITED_EMAILS.has(user.email.toLowerCase());
  const hasBoost = isAdmin || emailUnlimited || hasBoostSub;

  // Image quota logic
  // Admin: unlimited
  // Boost: 30
  // Free: 10
  const imageLimit = isAdmin ? Infinity : (hasBoost ? BOOST_DAILY_IMAGE_LIMIT : FREE_DAILY_IMAGE_LIMIT);
  const canGenerateImage = isAdmin || dailyImagesUsed < imageLimit;
  const remainingImages = isAdmin ? Infinity : Math.max(0, imageLimit - dailyImagesUsed);

  // Smarter Chat quota logic
  // Admin: unlimited
  // Boost: unlimited
  // Free: 0 (completely gated!)
  const smarterChatLimit = hasBoost ? Infinity : 0;
  const canSendSmarterChat = hasBoost;
  const remainingSmarterChats = hasBoost ? Infinity : 0;

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
      setCancelAtPeriodEnd(false);
      setCurrentPeriodEnd(null);
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

      // Fetch active subscription details
      const { data: subDetails } = await supabase
        .from('subscriptions')
        .select('cancel_at_period_end, current_period_end')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subDetails) {
        setCancelAtPeriodEnd(!!subDetails.cancel_at_period_end);
        setCurrentPeriodEnd(subDetails.current_period_end);
      } else {
        setCancelAtPeriodEnd(false);
        setCurrentPeriodEnd(null);
      }
    } catch (err) {
      console.error('[subscription] check failed', err);
    } finally {
      setLoading(false);
    }
    await refreshVoiceCount();
  }, [user, refreshVoiceCount]);

  const recordMessage = useCallback(() => { /* unlimited */ }, []);
  const recordVoiceSession = useCallback(() => { /* legacy no-op */ }, []);

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
    if (!isAdmin) {
      const count = incrementDailyImageCount();
      setDailyImagesUsed(count);
    }
  }, [isAdmin]);

  const recordSmarterChat = useCallback(() => {
    if (!hasBoost) {
      const count = incrementDailySmarterChatCount();
      setDailySmarterChatsUsed(count);
    }
  }, [hasBoost]);

  // Opens the Boost upgrade modal (mounted globally in App.tsx).
  const openCheckout = useCallback((priceId?: string | any) => {
    const cleanPriceId = typeof priceId === 'string' ? priceId : undefined;
    window.dispatchEvent(new CustomEvent('open-upgrade-modal', { detail: { priceId: cleanPriceId } }));
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
      window.location.href = data.url;
    } catch (err) {
      console.error('[subscription] portal failed', err);
      window.alert(err instanceof Error ? err.message : 'Could not open billing portal');
    }
  }, []);

  useEffect(() => { checkSubscription(); }, [checkSubscription]);

  useEffect(() => {
    const handleFocus = () => {
      setDailyImagesUsed(getDailyImageCount());
      setDailySmarterChatsUsed(getDailySmarterChatCount());
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
      isAdmin,
      loading,
      dailyImagesUsed,
      canGenerateImage,
      remainingImages,
      imageLimit,
      dailySmarterChatsUsed,
      canSendSmarterChat,
      remainingSmarterChats,
      smarterChatLimit,
      voiceConversations30d,
      canStartVoiceConversation,
      remainingVoiceConversations,
      cancelAtPeriodEnd,
      currentPeriodEnd,

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
      recordSmarterChat,
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
