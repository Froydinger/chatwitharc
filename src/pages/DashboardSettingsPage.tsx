import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Monitor, Moon, Sun } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ThemedLogo } from "@/components/ThemedLogo";
import { useAdminBanner } from "@/components/AdminBanner";
import { shouldReserveDesktopTrafficLightSpace } from "@/utils/platform";
import { useAccentStore } from "@/store/useAccentStore";

export function DashboardSettingsPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const isAdminBannerActive = useAdminBanner();
  const themeMode = useAccentStore((s) => s.themeMode);
  const cycleThemeMode = useAccentStore((s) => s.cycleThemeMode);
  const ThemeIcon = themeMode === "light" ? Sun : themeMode === "system" ? Monitor : Moon;
  const themeLabel = themeMode === "light" ? "Light" : themeMode === "system" ? "System" : "Dark";

  const [isDesktopStandalone, setIsDesktopStandalone] = useState(false);
  useEffect(() => {
    setIsDesktopStandalone(shouldReserveDesktopTrafficLightSpace());
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate("/", { replace: true });
  }, [loading, user, navigate]);

  if (loading) return null;

  return (
    <div
      className="relative z-10 min-h-screen overflow-y-auto bg-background text-foreground touch-pan-y"
      style={{
        paddingTop: `calc(env(safe-area-inset-top, 0px) + ${isAdminBannerActive ? 'var(--admin-banner-height, 0px)' : '0px'} + ${isDesktopStandalone ? 'var(--arcai-desktop-titlebar-safe-area, 30px)' : '0px'})`,
      }}
    >
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-36 top-[-180px] h-[480px] w-[480px] rounded-full bg-primary/[0.09] blur-[120px]" />
        <div className="absolute -right-40 bottom-[-220px] h-[560px] w-[560px] rounded-full bg-violet-500/[0.07] blur-[140px]" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/[0.035] to-transparent" />
      </div>

      <div className="relative mx-auto w-full max-w-[1440px] px-4 pb-8 sm:px-7 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-4 pb-6 pt-5 sm:pt-8"
        >
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => navigate("/dashboard")} className="h-9 w-9 rounded-full border-white/[0.09] bg-white/[0.04] shadow-[0_0_18px_rgba(168,85,247,0.08)] hover:bg-primary/10 hover:text-primary" aria-label="Back to dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.055] shadow-[0_0_28px_rgba(168,85,247,0.16)]">
                <ThemedLogo className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">ArcAI</p>
                <p className="text-[11px] text-muted-foreground">Settings</p>
              </div>
            </div>
          </div>
          <button type="button" onClick={cycleThemeMode} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.04] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground" aria-label={`Theme: ${themeLabel}`} title={`Theme: ${themeLabel}`}>
            <motion.span key={themeMode} initial={{ rotate: -90, opacity: 0, scale: 0.7 }} animate={{ rotate: 0, opacity: 1, scale: 1 }} transition={{ type: "spring", damping: 14, stiffness: 320 }} className="inline-flex">
              <ThemeIcon className="h-4 w-4" />
            </motion.span>
          </button>
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
