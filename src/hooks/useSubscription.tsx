import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getPaddle, PADDLE_PRO_PRICE_ID } from '@/lib/paddle';

// Daily limits for free users
const FREE_DAILY_MESSAGE_LIMIT = 30;
const FREE_DAILY_VOICE_LIMIT = 3;
const FREE_DAILY_IMAGE_LIMIT = 5;

// localStorage keys for daily tracking
const DAILY_MSG_KEY = 'arcai-daily-messages';
const DAILY_VOICE_KEY = 'arcai-daily-voice';
const DAILY_IMAGE_KEY = 'arcai-daily-images';
const DAILY_DATE_KEY = 'arcai-daily-date';

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function getDailyCount(key: string): number {
  const dateKey = localStorage.getItem(DAILY_DATE_KEY);
  const today = getTodayKey();
  if (dateKey !== today) {
    localStorage.setItem(DAILY_DATE_KEY, today);
    localStorage.setItem(DAILY_MSG_KEY, '0');
    localStorage.setItem(DAILY_VOICE_KEY, '0');
    localStorage.setItem(DAILY_IMAGE_KEY, '0');
    return 0;
  }
  return parseInt(localStorage.getItem(key) || '0', 10);
}

function incrementDailyCount(key: string): number {
  const today = getTodayKey();
  if (localStorage.getItem(DAILY_DATE_KEY) !== today) {
    localStorage.setItem(DAILY_DATE_KEY, today);
    localStorage.setItem(DAILY_MSG_KEY, '0');
    localStorage.setItem(DAILY_VOICE_KEY, '0');
    localStorage.setItem(DAILY_IMAGE_KEY, '0');
  }
  const count = getDailyCount(key) + 1;
  localStorage.setItem(key, String(count));
  return count;
}

interface SubscriptionState {
  isSubscribed: boolean;
  subscriptionEnd: string | null;
  paymentStatus: 'ok' | 'past_due' | 'none';
  loading: boolean;
  dailyMessagesUsed: number;
  dailyVoiceSessionsUsed: number;
  dailyImagesUsed: number;
  canSendMessage: boolean;
  canUseVoice: boolean;
  canGenerateImage: boolean;
  remainingMessages: number;
  remainingVoiceSessions: number;
  remainingImages: number;
  checkSubscription: () => Promise<void>;
  recordMessage: () => void;
  recordVoiceSession: () => void;
  recordImageGeneration: () => void;
  openCheckout: () => Promise<void>;
  openCustomerPortal: () => Promise<void>;
  FREE_DAILY_MESSAGE_LIMIT: number;
  FREE_DAILY_VOICE_LIMIT: number;
  FREE_DAILY_IMAGE_LIMIT: number;
}

const SubscriptionContext = createContext<SubscriptionState | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isComped, setIsComped] = useState(false);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'ok' | 'past_due' | 'none'>('none');
  const [loading, setLoading] = useState(true);
  const [dailyMessagesUsed, setDailyMessagesUsed] = useState(() => getDailyCount(DAILY_MSG_KEY));
  const [dailyVoiceSessionsUsed, setDailyVoiceSessionsUsed] = useState(() => getDailyCount(DAILY_VOICE_KEY));
  const [dailyImagesUsed, setDailyImagesUsed] = useState(() => getDailyCount(DAILY_IMAGE_KEY));

  const hasUnlimitedAccess = isSubscribed || isAdmin || isComped;
  const canSendMessage = hasUnlimitedAccess || dailyMessagesUsed < FREE_DAILY_MESSAGE_LIMIT;
  const canUseVoice = hasUnlimitedAccess || dailyVoiceSessionsUsed < FREE_DAILY_VOICE_LIMIT;
  const canGenerateImage = hasUnlimitedAccess || dailyImagesUsed < FREE_DAILY_IMAGE_LIMIT;
  const remainingMessages = hasUnlimitedAccess ? Infinity : Math.max(0, FREE_DAILY_MESSAGE_LIMIT - dailyMessagesUsed);
  const remainingVoiceSessions = hasUnlimitedAccess ? Infinity : Math.max(0, FREE_DAILY_VOICE_LIMIT - dailyVoiceSessionsUsed);
  const remainingImages = hasUnlimitedAccess ? Infinity : Math.max(0, FREE_DAILY_IMAGE_LIMIT - dailyImagesUsed);

  const checkSubscription = useCallback(async () => {
    if (!user || !supabase) {
      setIsSubscribed(false);
      setIsAdmin(false);
      setIsComped(false);
      setLoading(false);
      return;
    }

    try {
      // Admin check
      const { data: adminData } = await supabase.rpc('is_admin_user');
      setIsAdmin(!!adminData);

      // Comp check (by email)
      if (user.email) {
        const { data: compData } = await supabase
          .from('comped_users')
          .select('email')
          .ilike('email', user.email)
          .maybeSingle();
        setIsComped(!!compData);
      } else {
        setIsComped(false);
      }

      // Active Paddle subscription?
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('status, current_period_end')
        .eq('user_id', user.id)
        .maybeSingle();

      const status = subData?.status ?? null;
      const active = status === 'active' || status === 'trialing' || status === 'past_due';
      setIsSubscribed(active);
      setSubscriptionEnd(subData?.current_period_end ?? null);
      setPaymentStatus(status === 'past_due' ? 'past_due' : active ? 'ok' : 'none');
    } catch (err) {
      console.error('Failed to check subscription:', err);
      setIsSubscribed(false);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const recordMessage = useCallback(() => {
    if (!hasUnlimitedAccess) {
      const count = incrementDailyCount(DAILY_MSG_KEY);
      setDailyMessagesUsed(count);
    }
  }, [hasUnlimitedAccess]);

  const recordVoiceSession = useCallback(() => {
    if (!hasUnlimitedAccess) {
      const count = incrementDailyCount(DAILY_VOICE_KEY);
      setDailyVoiceSessionsUsed(count);
    }
  }, [hasUnlimitedAccess]);

  const recordImageGeneration = useCallback(() => {
    if (!hasUnlimitedAccess) {
      const count = incrementDailyCount(DAILY_IMAGE_KEY);
      setDailyImagesUsed(count);
    }
  }, [hasUnlimitedAccess]);

  const openCheckout = useCallback(async () => {
    if (!user) {
      window.dispatchEvent(new CustomEvent('open-upgrade-modal'));
      return;
    }
    const paddle = await getPaddle();
    if (!paddle) {
      console.error('[subscription] Paddle failed to initialize');
      return;
    }
    paddle.Checkout.open({
      items: [{ priceId: PADDLE_PRO_PRICE_ID, quantity: 1 }],
      customer: user.email ? { email: user.email } : undefined,
      customData: { user_id: user.id },
      settings: {
        displayMode: 'overlay',
        theme: 'dark',
        successUrl: `${window.location.origin}/?checkout=success`,
      },
    });
  }, [user]);

  const openCustomerPortal = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      const { data, error } = await supabase.functions.invoke('payments-portal');
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      console.error('Failed to open customer portal:', err);
    }
  }, [user]);

  useEffect(() => { checkSubscription(); }, [checkSubscription]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(checkSubscription, 60000);
    return () => clearInterval(interval);
  }, [user, checkSubscription]);

  useEffect(() => {
    const handleFocus = () => {
      setDailyMessagesUsed(getDailyCount(DAILY_MSG_KEY));
      setDailyVoiceSessionsUsed(getDailyCount(DAILY_VOICE_KEY));
      setDailyImagesUsed(getDailyCount(DAILY_IMAGE_KEY));
      checkSubscription();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [checkSubscription]);

  return (
    <SubscriptionContext.Provider value={{
      isSubscribed: hasUnlimitedAccess,
      subscriptionEnd,
      paymentStatus,
      loading,
      dailyMessagesUsed,
      dailyVoiceSessionsUsed,
      dailyImagesUsed,
      canSendMessage,
      canUseVoice,
      canGenerateImage,
      remainingMessages,
      remainingVoiceSessions,
      remainingImages,
      checkSubscription,
      recordMessage,
      recordVoiceSession,
      recordImageGeneration,
      openCheckout,
      openCustomerPortal,
      FREE_DAILY_MESSAGE_LIMIT,
      FREE_DAILY_VOICE_LIMIT,
      FREE_DAILY_IMAGE_LIMIT,
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
