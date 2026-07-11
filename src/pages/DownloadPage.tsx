import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle, Download } from "lucide-react";
import { GlassButton } from "@/components/ui/glass-button";
import { BackgroundGradients } from "@/components/BackgroundGradients";
import { ThemedLogo } from "@/components/ThemedLogo";
import { AppleLogo } from "@/components/icons/AppleLogo";
import { WindowsLogo } from "@/components/icons/WindowsLogo";
import { Link } from "react-router-dom";
import { useDownloadInfo } from "@/hooks/useDownloadInfo";

type Platform = "mac" | "windows" | null;

export function DownloadPage() {
  const { mac, windows, loading } = useDownloadInfo();
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>(null);
  const [downloadStarted, setDownloadStarted] = useState(false);

  const handleSelectPlatform = (platform: Platform) => {
    setSelectedPlatform(platform);
    setDownloadStarted(false);
  };

  const handleDownload = () => {
    if (!selectedPlatform) return;
    const info = selectedPlatform === "mac" ? mac : windows;
    window.location.href = info.url;
    setDownloadStarted(true);
  };

  const handleBack = () => {
    setSelectedPlatform(null);
    setDownloadStarted(false);
  };

  const currentInfo = selectedPlatform === "mac" ? mac : windows;

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-foreground">
      <BackgroundGradients />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-2xl space-y-8"
        >
          <div className="flex flex-col items-center gap-6 text-center">
            <ThemedLogo className="h-24 w-24" />
            <div>
              <h1 className="mb-2 text-4xl font-bold">Download ArcAI</h1>
              <p className="text-muted-foreground">
                {selectedPlatform
                  ? `${selectedPlatform === "mac" ? "macOS" : "Windows"} • Version ${currentInfo.version}`
                  : "Choose your platform to get started"}
              </p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {!selectedPlatform && (
              <motion.div
                key="select"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2"
              >
                <button
                  onClick={() => handleSelectPlatform("mac")}
                  disabled={loading}
                  className="glass-panel group cursor-pointer rounded-2xl border border-border/40 p-8 text-left transition-all hover:border-primary/50 hover:bg-primary/5 disabled:cursor-wait disabled:opacity-60"
                >
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 transition-colors group-hover:bg-primary/20">
                      <AppleLogo className="h-8 w-8 text-foreground" />
                    </div>
                    <div>
                      <h2 className="mb-1 text-xl font-semibold">macOS</h2>
                      <p className="text-sm text-muted-foreground">v{mac.version} • .dmg</p>
                    </div>
                    <GlassButton variant="default" size="sm" className="pointer-events-none gap-2">
                      <Download className="h-4 w-4" />
                      Download for Mac
                    </GlassButton>
                  </div>
                </button>

                <button
                  onClick={() => handleSelectPlatform("windows")}
                  disabled={loading}
                  className="glass-panel group relative cursor-pointer overflow-hidden rounded-2xl border border-yellow-500/40 p-8 text-left transition-all hover:border-yellow-500/60 hover:bg-yellow-500/5 disabled:cursor-wait disabled:opacity-60"
                >
                  <div className="absolute right-[-30px] top-3 rotate-45 bg-yellow-500 px-8 py-0.5 text-[10px] font-black uppercase tracking-widest text-black shadow-md">
                    Beta
                  </div>
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-yellow-500/10 transition-colors group-hover:bg-yellow-500/20">
                      <WindowsLogo className="h-8 w-8" />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-center gap-2">
                        <h2 className="text-xl font-semibold">Windows</h2>
                        <span className="rounded-full border border-yellow-500/30 bg-yellow-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-yellow-500">
                          Beta
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">v{windows.version} • .exe</p>
                    </div>
                    <GlassButton variant="default" size="sm" className="pointer-events-none gap-2">
                      <Download className="h-4 w-4" />
                      Download for Windows
                    </GlassButton>
                    <p className="text-[11px] font-medium text-yellow-500/70">
                      Beta build. Use the web app if it acts weird.
                    </p>
                  </div>
                </button>
              </motion.div>
            )}

            {selectedPlatform && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <div className="glass-panel rounded-2xl border border-border/40 p-8">
                  <div className="flex flex-col items-center gap-6 text-center">
                    {downloadStarted ? (
                      <CheckCircle className="h-12 w-12 text-primary" />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                        {selectedPlatform === "mac" ? (
                          <AppleLogo className="h-8 w-8 text-foreground" />
                        ) : (
                          <WindowsLogo className="h-8 w-8" />
                        )}
                      </div>
                    )}

                    <div>
                      <div className="mb-2 flex items-center justify-center gap-2">
                        <h2 className="text-xl font-semibold">
                          {downloadStarted
                            ? "Download Started!"
                            : `ArcAI for ${selectedPlatform === "mac" ? "macOS" : "Windows"}`}
                        </h2>
                        {selectedPlatform === "windows" && !downloadStarted && (
                          <span className="rounded-full border border-yellow-500/30 bg-yellow-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-yellow-500">
                            Beta
                          </span>
                        )}
                      </div>
                      <p className="mb-4 text-muted-foreground">
                        {downloadStarted
                          ? "Your download has started. If it doesn't, click the button below."
                          : `Version ${currentInfo.version} — ready to download`}
                      </p>
                      {selectedPlatform === "windows" && (
                        <div className="mx-auto mb-4 max-w-sm rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-center text-sm font-medium text-yellow-500">
                          Windows is still beta. The web app is the safer daily driver.
                        </div>
                      )}
                    </div>

                    <GlassButton variant="default" size="lg" onClick={handleDownload} className="gap-2">
                      <Download className="h-5 w-5" />
                      {downloadStarted ? "Download Again" : "Download Now"}
                    </GlassButton>

                    <button
                      onClick={handleBack}
                      className="text-sm text-muted-foreground transition-colors hover:text-primary"
                    >
                      Choose a different platform
                    </button>
                  </div>
                </div>

                <div className="glass-panel rounded-2xl border border-border/40 p-8">
                  <div className="mb-4 flex items-start gap-3">
                    <CheckCircle className="mt-1 h-6 w-6 flex-shrink-0 text-primary" />
                    <div>
                      <h3 className="mb-4 text-lg font-semibold">Installation Instructions</h3>
                      {selectedPlatform === "mac" ? (
                        <ol className="list-inside list-decimal space-y-3 text-muted-foreground">
                          <li>Open the downloaded .dmg file.</li>
                          <li>Drag ArcAI to your Applications folder.</li>
                          <li>Right-click ArcAI and choose Open for first launch.</li>
                          <li>Click Open when macOS asks for confirmation.</li>
                        </ol>
                      ) : (
                        <ol className="list-inside list-decimal space-y-3 text-muted-foreground">
                          <li>Run the downloaded .exe installer.</li>
                          <li>Follow the installation prompts.</li>
                          <li>If Windows SmartScreen appears, click More info, then Run anyway.</li>
                          <li>Launch ArcAI from the Start menu or desktop shortcut.</li>
                        </ol>
                      )}
                    </div>
                  </div>
                </div>

                <div className="glass-panel rounded-2xl border border-border/40 p-8">
                  <div className="mb-4 flex items-start gap-3">
                    <AlertCircle className="mt-1 h-6 w-6 flex-shrink-0 text-primary" />
                    <div>
                      <h3 className="mb-4 text-lg font-semibold">Updates</h3>
                      <div className="space-y-3 text-muted-foreground">
                        <p>Use Check for Updates in the ArcAI desktop menu, or return here for the latest build.</p>
                        <p>If you experience issues after updating:</p>
                        <ol className="ml-4 list-inside list-decimal space-y-2">
                          {selectedPlatform === "mac" ? (
                            <>
                              <li>Quit ArcAI completely.</li>
                              <li>Replace the old app in Applications with the newest download.</li>
                              <li>Right-click ArcAI and choose Open once after reinstalling.</li>
                            </>
                          ) : (
                            <>
                              <li>Uninstall ArcAI from Windows Settings, then Apps.</li>
                              <li>Download the newest installer from this page.</li>
                              <li>Install again from the fresh download.</li>
                            </>
                          )}
                        </ol>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.8 }}
            className="flex justify-center gap-4 text-sm text-muted-foreground"
          >
            <Link to="/" className="transition-colors hover:text-primary">
              Return to ArcAI
            </Link>
            <span>•</span>
            <a href="https://askarc.chat" className="transition-colors hover:text-primary">
              Open Web App
            </a>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
