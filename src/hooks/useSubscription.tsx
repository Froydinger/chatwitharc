import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const ARCAI_PRO_PRODUCT_ID = 'prod_U4U5QGmibWU8wD';
const ARCAI_PRO_PRICE_ID = 'price_1T6L7QAB32948AKDfYOiwbCy';

// Daily limits for free users
const FREE_DAILY_MESSAGE_LIMIT = 30;
const FREE_DAILY_VOICE_LIMIT = 3;

// localStorage keys for daily tracking
const DAILY_MSG_KEY = 'arcai-daily-messages';
const DAILY_VOICE_KEY = 'arcai-daily-voice';
const DAILY_DATE_KEY = 'arcai-daily-date';

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function getDailyCount(key: string): number {
  const dateKey = localStorage.getItem(DAILY_DATE_KEY);
  const today = getTodayKey();
  if (dateKey !== today) {
    // Reset counts for new day
    localStorage.setItem(DAILY_DATE_KEY, today);
    localStorage.setItem(DAILY_MSG_KEY, '0');
    localStorage.setItem(DAILY_VOICE_KEY, '0');
    return 0;
  }
  return parseInt(localStorage.getItem(key) || '0', 10);
}

function incrementDailyCount(key: string): number {
  // Ensure date is set
  const today = getTodayKey();
  if (localStorage.getItem(DAILY_DATE_KEY) !== today) {
    localStorage.setItem(DAILY_DATE_KEY, today);
    localStorage.setItem(DAILY_MSG_KEY, '0');
    localStorage.setItem(DAILY_VOICE_KEY, '0');
  }
  const count = getDailyCount(key) + 1;
  localStorage.setItem(key, String(count));
  return count;
}

interface SubscriptionState {
  isSubscribed: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
  loading: boolean;
  // Limits
  dailyMessagesUsed: number;
  dailyVoiceSessionsUsed: number;
  canSendMessage: boolean;
  canUseVoice: boolean;
  remainingMessages: number;
  remainingVoiceSessions: number;
  // Actions
  checkSubscription: () => Promise<void>;
  recordMessage: () => void;
  recordVoiceSession: () => void;
  openCheckout: () => Promise<void>;
  openCustomerPortal: () => Promise<void>;
  // Constants
  FREE_DAILY_MESSAGE_LIMIT: number;
  FREE_DAILY_VOICE_LIMIT: number;
}

const SubscriptionContext = createContext<SubscriptionState | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dailyMessagesUsed, setDailyMessagesUsed] = useState(() => getDailyCount(DAILY_MSG_KEY));
  const [dailyVoiceSessionsUsed, setDailyVoiceSessionsUsed] = useState(() => getDailyCount(DAILY_VOICE_KEY));

  // Admins and subscribers get unlimited access
  const hasUnlimitedAccess = isSubscribed || isAdmin;
  const canSendMessage = hasUnlimitedAccess || dailyMessagesUsed < FREE_DAILY_MESSAGE_LIMIT;
  const canUseVoice = hasUnlimitedAccess || dailyVoiceSessionsUsed < FREE_DAILY_VOICE_LIMIT;
  const remainingMessages = hasUnlimitedAccess ? Infinity : Math.max(0, FREE_DAILY_MESSAGE_LIMIT - dailyMessagesUsed);
  const remainingVoiceSessions = hasUnlimitedAccess ? Infinity : Math.max(0, FREE_DAILY_VOICE_LIMIT - dailyVoiceSessionsUsed);

  const checkSubscription = useCallback(async () => {
    if (!user || !supabase) {
      setIsSubscribed(false);
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    try {
      // Check admin status
      const { data: adminData } = await supabase.rpc('is_admin_user');
      setIsAdmin(!!adminData);

      // Check Stripe subscription
      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (error) throw error;

      setIsSubscribed(data?.subscribed || false);
      setProductId(data?.product_id || null);
      setSubscriptionEnd(data?.subscription_end || null);
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

  const openCheckout = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout');
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Failed to create checkout:', err);
    }
  }, []);

  const openCustomerPortal = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Failed to open customer portal:', err);
    }
  }, []);

  // Check subscription on mount and when user changes
  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  // Auto-refresh every minute
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(checkSubscription, 60000);
    return () => clearInterval(interval);
  }, [user, checkSubscription]);

  // Refresh daily counts on focus
  useEffect(() => {
    const handleFocus = () => {
      setDailyMessagesUsed(getDailyCount(DAILY_MSG_KEY));
      setDailyVoiceSessionsUsed(getDailyCount(DAILY_VOICE_KEY));
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  return (
    <SubscriptionContext.Provider value={{
      isSubscribed,
      productId,
      subscriptionEnd,
      loading,
      dailyMessagesUsed,
      dailyVoiceSessionsUsed,
      canSendMessage,
      canUseVoice,
      remainingMessages,
      remainingVoiceSessions,
      checkSubscription,
      recordMessage,
      recordVoiceSession,
      openCheckout,
      openCustomerPortal,
      FREE_DAILY_MESSAGE_LIMIT,
      FREE_DAILY_VOICE_LIMIT,
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

export { ARCAI_PRO_PRODUCT_ID, ARCAI_PRO_PRICE_ID };
