import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, CheckCircle, AlertCircle, Monitor } from "lucide-react";
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
          {/* Header */}
          <div className="flex flex-col items-center gap-6 text-center">
            <ThemedLogo className="h-24 w-24" />
            <div>
              <h1 className="text-4xl font-bold mb-2">Download ArcAi</h1>
              <p className="text-muted-foreground">
                {selectedPlatform
                  ? `${selectedPlatform === "mac" ? "macOS" : "Windows"} • Version ${currentInfo.version}`
                  : "Choose your platform to get started"}
              </p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {/* Platform Selection */}
            {!selectedPlatform && (
              <motion.div
                key="select"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
              >
                {/* Mac Card */}
                <button
                  onClick={() => handleSelectPlatform("mac")}
                  disabled={loading}
                  className="glass-panel rounded-2xl p-8 border border-border/40 hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer text-left group"
                >
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <AppleLogo className="h-8 w-8 text-foreground" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold mb-1">macOS</h2>
                      <p className="text-sm text-muted-foreground">
                        v{mac.version} • .dmg
                      </p>
                    </div>
                    <GlassButton variant="default" size="sm" className="gap-2 pointer-events-none">
                      <Download className="h-4 w-4" />
                      Download for Mac
                    </GlassButton>
                  </div>
                </button>

                {/* Windows Card */}
                <button
                  onClick={() => handleSelectPlatform("windows")}
                  disabled={loading}
                  className="glass-panel rounded-2xl p-8 border border-yellow-500/40 hover:border-yellow-500/60 hover:bg-yellow-500/5 transition-all cursor-pointer text-left group relative overflow-hidden"
                >
                  {/* Beta ribbon */}
                  <div className="absolute top-3 right-[-30px] rotate-45 bg-yellow-500 text-black text-[10px] font-black uppercase tracking-widest px-8 py-0.5 shadow-md">
                    Beta
                  </div>
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-yellow-500/10 flex items-center justify-center group-hover:bg-yellow-500/20 transition-colors relative">
                      <WindowsLogo className="h-8 w-8" />
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <h2 className="text-xl font-semibold">Windows</h2>
                        <span className="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-500 text-[10px] font-bold uppercase tracking-wider border border-yellow-500/30">Beta</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        v{windows.version} • .exe
                      </p>
                    </div>
                    <GlassButton variant="default" size="sm" className="gap-2 pointer-events-none">
                      <Download className="h-4 w-4" />
                      Download for Windows
                    </GlassButton>
                    <p className="text-[11px] text-yellow-500/70 font-medium">⚠️ Beta — may not work as expected</p>
                  </div>
                </button>
              </motion.div>
            )}

            {/* Download Confirmation */}
            {selectedPlatform && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* Download Card */}
                <div className="glass-panel rounded-2xl p-8 border border-border/40">
                  <div className="flex flex-col items-center gap-6 text-center">
                    {downloadStarted ? (
                      <CheckCircle className="h-12 w-12 text-primary" />
                    ) : (
                      <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                        {selectedPlatform === "mac" ? (
                          <AppleLogo className="h-8 w-8 text-foreground" />
                        ) : (
                          <WindowsLogo className="h-8 w-8" />
                        )}
                      </div>
                    )}

                    <div>
                      <h2 className="text-xl font-semibold mb-2">
                        {downloadStarted
                          ? "Download Started!"
                          : `ArcAi for ${selectedPlatform === "mac" ? "macOS" : "Windows"}`}
                      </h2>
                      <p className="text-muted-foreground mb-6">
                        {downloadStarted
                          ? "Your download has started. If it doesn't, click the button below."
                          : `Version ${currentInfo.version} — Ready to download`}
                      </p>
                    </div>

                    <GlassButton
                      variant="default"
                      size="lg"
                      onClick={handleDownload}
                      className="gap-2"
                    >
                      <Download className="h-5 w-5" />
                      {downloadStarted ? "Download Again" : "Download Now"}
                    </GlassButton>

                    <button
                      onClick={handleBack}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      ← Choose a different platform
                    </button>
                  </div>
                </div>

                {/* Installation Instructions */}
                <div className="glass-panel rounded-2xl p-8 border border-border/40">
                  <div className="flex items-start gap-3 mb-4">
                    <CheckCircle className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Installation Instructions</h3>
                      {selectedPlatform === "mac" ? (
                        <ol className="space-y-3 text-muted-foreground list-decimal list-inside">
                          <li>Open the downloaded .dmg file</li>
                          <li>Drag ArcAi to your Applications folder</li>
                          <li>Right-click ArcAi and select "Open" for first launch</li>
                          <li>Click "Open" when macOS asks for confirmation</li>
                        </ol>
                      ) : (
                        <ol className="space-y-3 text-muted-foreground list-decimal list-inside">
                          <li>Run the downloaded .exe installer</li>
                          <li>Follow the installation wizard prompts</li>
                          <li>If Windows SmartScreen appears, click "More info" then "Run anyway"</li>
                          <li>Launch ArcAi from the Start menu or desktop shortcut</li>
                        </ol>
                      )}
                    </div>
                  </div>
                </div>

                {/* Updates */}
                <div className="glass-panel rounded-2xl p-8 border border-border/40">
                  <div className="flex items-start gap-3 mb-4">
                    <AlertCircle className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Updates</h3>
                      <div className="space-y-3 text-muted-foreground">
                        <p>ArcAi updates automatically in most cases.</p>
                        <p>If you experience issues after an update:</p>
                        <ol className="space-y-2 list-decimal list-inside ml-4">
                          {selectedPlatform === "mac" ? (
                            <>
                              <li>Drag ArcAi from Applications to Trash</li>
                              <li>Visit chatwitharc.com/download for the latest version</li>
                              <li>Reinstall following the instructions above</li>
                            </>
                          ) : (
                            <>
                              <li>Uninstall ArcAi from Windows Settings → Apps</li>
                              <li>Visit chatwitharc.com/download for the latest version</li>
                              <li>Reinstall following the instructions above</li>
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

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.8 }}
            className="flex justify-center gap-4 text-sm text-muted-foreground"
          >
            <Link to="/" className="hover:text-primary transition-colors">
              Return to ArcAi
            </Link>
            <span>•</span>
            <a
              href="https://chatwitharc.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
            >
              Visit Main Site
            </a>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
