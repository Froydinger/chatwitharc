import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { UpdateNotification } from "@/components/UpdateNotification";
import { PageTransition } from "@/components/PageTransition";
import { FingerPopupContainer } from "@/components/FingerPopup";
import { BackgroundGradients } from "@/components/BackgroundGradients";
import { Index } from "./pages/Index";
import NotFound from "./pages/NotFound";
import { AdminPage } from "./pages/AdminPage";

const queryClient = new QueryClient();

// Detect if running as PWA or Electron on Mac
const isStandalonePWA = () => window.matchMedia('(display-mode: standalone)').matches;
const isElectron = () => /electron/i.test(navigator.userAgent);
const isMacOS = () => /mac/i.test(navigator.platform);
const needsMacTopPadding = () => (isStandalonePWA() || isElectron()) && isMacOS();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        {needsMacTopPadding() && <div className="arcai-drag-bar" />}
        <div className={needsMacTopPadding() ? "pt-7" : ""}>
          <BackgroundGradients />
          <Toaster />
          <Sonner />
          <FingerPopupContainer />
          <PWAInstallPrompt />
          <UpdateNotification />
          <BrowserRouter>
            <PageTransition>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/chat/:sessionId" element={<Index />} />
                <Route path="/admin" element={<AdminPage />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </PageTransition>
          </BrowserRouter>
        </div>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
