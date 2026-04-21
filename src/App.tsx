import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { UpgradeModal } from "@/components/UpgradeModal";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { SubscriptionProvider } from "@/hooks/useSubscription";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { UpdateNotification } from "@/components/UpdateNotification";
import { AdminBanner } from "@/components/AdminBanner";
import { PageTransition } from "@/components/PageTransition";
import { ScrollToTop } from "@/components/ScrollToTop";
import { FingerPopupContainer } from "@/components/FingerPopup";
import { Starfield } from "@/components/Starfield";
import { useStarfieldStore } from "@/store/useStarfieldStore";
import { BackgroundGradients } from "@/components/BackgroundGradients";
import { BugReportModal } from "@/components/BugReportModal";
import { useBugReport } from "@/hooks/useBugReport";
import { useVisibilityHandler } from "@/hooks/useVisibilityHandler";
import { GlobalMusicPlayer } from "@/components/GlobalMusicPlayer";
import { useCorporateModeEnforcer } from "@/hooks/useCorporateMode";
import { useLocalModelPersistence } from "@/hooks/useLocalModelPersistence";
import { CorporateMemoryConsentGate } from "@/components/CorporateMemoryConsentModal";
import { Index } from "./pages/Index";
import NotFound from "./pages/NotFound";
import { AdminPage } from "./pages/AdminPage";
import { DownloadPage } from "./pages/DownloadPage";
import { PricingPage } from "./pages/PricingPage";
import { AppsPage } from "./pages/AppsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DashboardSettingsPage } from "./pages/DashboardSettingsPage";
import UnsubscribePage from "./pages/UnsubscribePage";
import { SupportPage } from "./pages/SupportPage";

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

const App = () => {
  const { isOpen, errorMessage, errorStack, closeBugReport } = useBugReport();
  const showStarfield = useStarfieldStore((s) => s.showStarfield);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  useVisibilityHandler();
  useCorporateModeEnforcer();
  useLocalModelPersistence();

  // Detect standalone mode on mount
  useEffect(() => {
    detectStandaloneMode();
  }, []);

  // Global listener for upgrade modal events
  useEffect(() => {
    const handler = () => setShowUpgradeModal(true);
    window.addEventListener('open-upgrade-modal', handler);
    return () => window.removeEventListener('open-upgrade-modal', handler);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SubscriptionProvider>
        <TooltipProvider>
          <div className="arcai-drag-bar" />
          <BackgroundGradients />
          {showStarfield && <Starfield />}
            <Toaster />
            <Sonner />
            <FingerPopupContainer />
            <PWAInstallPrompt />
            <UpdateNotification />
            <AdminBanner />
            <BugReportModal
              isOpen={isOpen}
              onClose={closeBugReport}
              errorMessage={errorMessage}
              errorStack={errorStack}
            />
            <BrowserRouter>
              <ScrollToTop />
              <PageTransition>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/chat/:sessionId" element={<Index />} />
                  <Route path="/downloads" element={<DownloadPage />} />
                  <Route path="/pricing" element={<PricingPage />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/dashboard/settings" element={<DashboardSettingsPage />} />
                  <Route path="/apps" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/apps/:projectId" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/unsubscribe" element={<UnsubscribePage />} />
                  <Route path="/support" element={<SupportPage />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </PageTransition>
            </BrowserRouter>
            <GlobalMusicPlayer />
            <CorporateMemoryConsentGate />
            <UpgradeModal
              isOpen={showUpgradeModal}
              onClose={() => setShowUpgradeModal(false)}
            />
        </TooltipProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
