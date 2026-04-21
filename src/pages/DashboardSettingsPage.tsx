import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ThemedLogo } from "@/components/ThemedLogo";
import { useAdminBanner } from "@/components/AdminBanner";

export function DashboardSettingsPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const isAdminBannerActive = useAdminBanner();

  const [isDesktopStandalone, setIsDesktopStandalone] = useState(false);
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    const isElectron = /electron/i.test(navigator.userAgent);
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsDesktopStandalone((isStandalone || isElectron) && !isMobileDevice);
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate("/", { replace: true });
  }, [loading, user, navigate]);

  if (loading) return null;

  return (
    <div
      className="min-h-screen overflow-y-auto scrollbar-hide relative z-10"
      style={{
        paddingTop: `calc(env(safe-area-inset-top, 0px) + ${isAdminBannerActive ? 'var(--admin-banner-height, 0px)' : '0px'} + ${isDesktopStandalone ? '30px' : '0px'})`,
      }}
    >
      <div className="w-full px-4 sm:px-6 pt-3 sm:pt-4 pb-6 sm:pb-10">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-6"
        >
          <Button variant="outline" size="icon" onClick={() => navigate("/dashboard")} className="rounded-full glass-shimmer">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <ThemedLogo className="h-8 w-8" />
          <h1 className="text-base sm:text-xl font-light text-foreground">Settings</h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <SettingsPanel />
        </motion.div>
      </div>
    </div>
  );
}
