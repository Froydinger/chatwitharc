import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { SubscriptionProvider } from "@/hooks/useSubscription";
import { UpgradeModal } from "@/components/UpgradeModal";
import { BoostSync } from "@/components/BoostSync";
import { ImageQuotaProvider } from "@/hooks/useImageQuota";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { AdminBanner } from "@/components/AdminBanner";
import { PageTransition } from "@/components/PageTransition";
import { ScrollToTop } from "@/components/ScrollToTop";
import { RouteSEO } from "@/components/RouteSEO";
import { FingerPopupContainer } from "@/components/FingerPopup";
import { Starfield } from "@/components/Starfield";
import { useStarfieldStore } from "@/store/useStarfieldStore";

import { BackgroundGradients } from "@/components/BackgroundGradients";
import { BugReportModal } from "@/components/BugReportModal";
import { useBugReport } from "@/hooks/useBugReport";
import { useVisibilityHandler } from "@/hooks/useVisibilityHandler";
import { useTheme } from "@/hooks/useTheme";
import { useCustomFont } from "@/hooks/useCustomFont";
import { GlobalMusicPlayer } from "@/components/GlobalMusicPlayer";
import { GlobalAuthGate } from "@/components/GlobalAuthGate";
import { LiquidFilter } from "@/components/ui/liquid-filter";
import { useCorporateModeEnforcer } from "@/hooks/useCorporateMode";
import { useLocalModelPersistence } from "@/hooks/useLocalModelPersistence";
import { CorporateMemoryConsentGate } from "@/components/CorporateMemoryConsentModal";
import { Index } from "./pages/Index";
import NotFound from "./pages/NotFound";
import { AdminPage } from "./pages/AdminPage";
import { DownloadPage } from "./pages/DownloadPage";
import { PricingPage } from "./pages/PricingPage";
import { UpgradePage } from "./pages/UpgradePage";
import { AppsPage } from "./pages/AppsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DashboardSettingsPage } from "./pages/DashboardSettingsPage";
import UnsubscribePage from "./pages/UnsubscribePage";
import { SupportPage } from "./pages/SupportPage";
import { DocsPage } from "./pages/DocsPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import { SharedChatPage } from "./pages/SharedChatPage";
import { TasksPage } from "./pages/TasksPage";
import { SharedChatsPage } from "./pages/SharedChatsPage";
import { SharedChatRoomPage } from "./pages/SharedChatRoomPage";
import { LandingPage } from "./pages/LandingPage";
import CheckoutReturnPage from "./pages/CheckoutReturnPage";
import { BlogIndexPage } from "./pages/BlogIndexPage";
import { BlogPostPage } from "./pages/BlogPostPage";
import { useAuth } from "@/hooks/useAuth";
import { ThemedLogo } from "@/components/ThemedLogo";
import { motion } from "framer-motion";

const FullscreenLoader = () => {
  const [stage, setStage] = useState<'spin' | 'bloop'>('spin');

  useEffect(() => {
    // 1.0 second of spinning, then transition to concurrent bloop/fade
    const timer = setTimeout(() => {
      setStage('bloop');
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center bg-[#000000] z-[9999]"
      initial={{ opacity: 1 }}
      animate={{ opacity: stage === 'bloop' ? 0 : 1 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
    >
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-primary/20 filter blur-xl animate-pulse scale-150" />
        
        <motion.div
          className="h-20 w-20 relative z-10"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={
            stage === 'spin'
              ? { scale: 1, opacity: 1, rotate: 360 * 3 }
              : { scale: 0, opacity: 0, rotate: 360 * 3 }
          }
          transition={
            stage === 'spin'
              ? {
                  rotate: { duration: 1.0, ease: "easeOut" },
                  scale: { duration: 0.4, ease: "easeOut" },
                  opacity: { duration: 0.4, ease: "easeOut" }
                }
              : {
                  scale: { duration: 0.4, ease: [0.34, 1.56, 0.64, 1] },
                  opacity: { duration: 0.3 }
                }
          }
        >
          <ThemedLogo className="h-full w-full" alt="Loading" />
        </motion.div>
      </div>
    </motion.div>
  );
};

const FastLoader = () => {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#000000] z-50">
      <motion.div
        className="h-12 w-12"
        animate={{ rotate: 360 }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      >
        <div className="h-full w-full relative flex items-center justify-center">
          <ThemedLogo className="h-full w-full" alt="Loading" />
          <div className="absolute inset-0 rounded-full bg-primary/20 filter blur-xl animate-pulse" />
        </div>
      </motion.div>
    </div>
  );
};

/** Show marketing lander to signed-out/anonymous visitors, chat to real accounts only. */
const RootGate = () => {
  const { user, loading: authLoading, isAnonymous } = useAuth();
  const [showSessionLoader, setShowSessionLoader] = useState(() => {
    if (typeof window === 'undefined') return false;
    const shown = sessionStorage.getItem('arc:sessionLoaderShown') === 'true';
    return !shown;
  });

  const [timerFinished, setTimerFinished] = useState(false);

  useEffect(() => {
    if (!showSessionLoader) return;
    const timer = setTimeout(() => {
      setTimerFinished(true);
    }, 1500); // 1.5s total animation duration
    return () => clearTimeout(timer);
  }, [showSessionLoader]);

  useEffect(() => {
    if (showSessionLoader && timerFinished && !authLoading) {
      sessionStorage.setItem('arc:sessionLoaderShown', 'true');
      setShowSessionLoader(false);
    }
  }, [showSessionLoader, timerFinished, authLoading]);

  if (showSessionLoader) {
    return <FullscreenLoader />;
  }

  if (authLoading) return <FastLoader />;

  return user && !isAnonymous ? <Index /> : <LandingPage />;
};

const queryClient = new QueryClient();

// Detect PWA/Electron mode and add class to body
const detectStandaloneMode = () => {
  const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                (window.navigator as any).standalone === true;
  const isElectron = /electron/i.test(navigator.userAgent);
  
  if (isPWA || isElectron) {
    document.body.classList.add('standalone-app');
  } else {
    document.body.classList.remove('standalone-app');
  }
};

const ThemeManager = () => {
  useTheme();
  return null;
};

const App = () => {
  const { isOpen, errorMessage, errorStack, closeBugReport } = useBugReport();
  const showStarfield = useStarfieldStore((s) => s.showStarfield);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  
  useVisibilityHandler();
  useCorporateModeEnforcer();
  useLocalModelPersistence();
  useCustomFont();

  const [upgradePriceId, setUpgradePriceId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const customEvent = e as CustomEvent;
      setUpgradePriceId(customEvent.detail?.priceId);
      setUpgradeOpen(true);
    };
    window.addEventListener('open-upgrade-modal', handleOpen);
    return () => window.removeEventListener('open-upgrade-modal', handleOpen);
  }, []);

  // Detect standalone mode on mount
  useEffect(() => {
    detectStandaloneMode();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SubscriptionProvider>
          <ImageQuotaProvider>
            <TooltipProvider>
              <div className="arcai-drag-bar" />
              <LiquidFilter />
              <BackgroundGradients />
              {showStarfield && <Starfield />}
              <Toaster />
              <Sonner />
              <FingerPopupContainer />
              <PWAInstallPrompt />
              <AdminBanner />
              <BugReportModal
                isOpen={isOpen}
                onClose={closeBugReport}
                errorMessage={errorMessage}
                errorStack={errorStack}
              />
              <UpgradeModal 
                isOpen={upgradeOpen} 
                onClose={() => setUpgradeOpen(false)} 
                priceId={upgradePriceId}
              />
              <BoostSync />
              <BrowserRouter>
                <ThemeManager />
                <ScrollToTop />
                <RouteSEO />
                <PageTransition>
                  <Routes>
                    <Route path="/" element={<RootGate />} />
                    <Route path="/welcome" element={<LandingPage />} />
                    <Route path="/blog" element={<BlogIndexPage />} />
                    <Route path="/blog/:slug" element={<BlogPostPage />} />
                    <Route path="/chat/:sessionId" element={<Index />} />
                    <Route path="/share/:sessionId" element={<SharedChatPage />} />
                    <Route path="/downloads" element={<DownloadPage />} />
                    <Route path="/pricing" element={<PricingPage />} />
                    <Route path="/upgrade" element={<UpgradePage />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/dashboard/settings" element={<DashboardSettingsPage />} />
                    <Route path="/apps" element={<AppsPage />} />
                    <Route path="/apps/:projectId" element={<AppsPage />} />
                    <Route path="/build" element={<AppsPage />} />
                    <Route path="/admin" element={<AdminPage />} />
                    <Route path="/unsubscribe" element={<UnsubscribePage />} />
                    <Route path="/support" element={<SupportPage />} />
                    <Route path="/docs" element={<DocsPage />} />
                    <Route path="/tasks" element={<TasksPage />} />
                    <Route path="/shared" element={<SharedChatsPage />} />
                    <Route path="/shared/:chatId" element={<SharedChatRoomPage />} />
                    <Route path="/checkout/return" element={<CheckoutReturnPage />} />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="/terms" element={<TermsPage />} />
                    <Route path="/privacy" element={<PrivacyPolicyPage />} />
                    <Route path="/refund-policy" element={<Navigate to="/terms" replace />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </PageTransition>
              </BrowserRouter>
              <GlobalMusicPlayer />
              <CorporateMemoryConsentGate />
              <GlobalAuthGate />
            </TooltipProvider>
          </ImageQuotaProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
