import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// ArcAI is 100% free. Chats and voice are unlimited for everyone.
// Image generation is unlimited for admins, and rate-limited for everyone else.
const FREE_DAILY_IMAGE_LIMIT = 10;
const FREE_DAILY_MESSAGE_LIMIT = Infinity; // unlimited
const FREE_DAILY_VOICE_LIMIT = Infinity; // unlimited

// Hardcoded admin allowlist (case-insensitive) — these emails always get
// unlimited images even if their DB admin row hasn't been provisioned yet.
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dailyImagesUsed, setDailyImagesUsed] = useState(() => getDailyImageCount());

  const emailUnlimited = !!user?.email && UNLIMITED_EMAILS.has(user.email.toLowerCase());
  const hasUnlimitedImages = isAdmin || emailUnlimited;

  // App is free for everyone — treat all users as "subscribed" so feature gates
  // that previously required Pro (model family selector, etc.) are open to all.
  const isSubscribed = true;

  const canSendMessage = true;
  const canUseVoice = true;
  const canGenerateImage = hasUnlimitedImages || dailyImagesUsed < FREE_DAILY_IMAGE_LIMIT;

  const remainingMessages = Infinity;
  const remainingVoiceSessions = Infinity;
  const remainingImages = hasUnlimitedImages
    ? Infinity
    : Math.max(0, FREE_DAILY_IMAGE_LIMIT - dailyImagesUsed);

  const checkSubscription = useCallback(async () => {
    if (!user || !supabase) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    try {
      const { data: adminData } = await supabase.rpc('is_admin_user');
      setIsAdmin(!!adminData);
    } catch (err) {
      console.error('Failed to check admin status:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const recordMessage = useCallback(() => { /* unlimited */ }, []);
  const recordVoiceSession = useCallback(() => { /* unlimited */ }, []);

  const recordImageGeneration = useCallback(() => {
    if (!hasUnlimitedImages) {
      const count = incrementDailyImageCount();
      setDailyImagesUsed(count);
    }
  }, [hasUnlimitedImages]);

  // App is free — these are no-ops, retained so existing call sites don't break.
  const openCheckout = useCallback(async () => {
    console.info('[subscription] ArcAI is free — no checkout needed.');
  }, []);
  const openCustomerPortal = useCallback(async () => {
    console.info('[subscription] ArcAI is free — no billing portal.');
  }, []);

  useEffect(() => { checkSubscription(); }, [checkSubscription]);

  useEffect(() => {
    const handleFocus = () => {
      setDailyImagesUsed(getDailyImageCount());
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  return (
    <SubscriptionContext.Provider value={{
      isSubscribed,
      subscriptionEnd: null,
      paymentStatus: 'ok',
      loading,
      dailyMessagesUsed: 0,
      dailyVoiceSessionsUsed: 0,
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
