import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Download, CheckCircle, AlertCircle } from "lucide-react";
import { GlassButton } from "@/components/ui/glass-button";
import { BackgroundGradients } from "@/components/BackgroundGradients";
import { ThemedLogo } from "@/components/ThemedLogo";
import { Link } from "react-router-dom";

const DOWNLOAD_URL = "https://froydinger.com/wp-content/uploads/2025/11/ArcAi-for-Mac-1.0.2.zip";
const VERSION = "1.0.2";

export function DownloadPage() {
  const [downloadStarted, setDownloadStarted] = useState(false);

  useEffect(() => {
    // Auto-trigger download after 1 second
    const timer = setTimeout(() => {
      window.location.href = DOWNLOAD_URL;
      setDownloadStarted(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  const handleManualDownload = () => {
    window.location.href = DOWNLOAD_URL;
    setDownloadStarted(true);
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
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
              <h1 className="text-4xl font-bold mb-2">Download ArcAi for Mac</h1>
              <p className="text-muted-foreground">Version {VERSION}</p>
            </div>
          </div>

          {/* Download Status Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="glass-panel rounded-2xl p-8 border border-border/40"
          >
            <div className="flex flex-col items-center gap-6 text-center">
              {downloadStarted ? (
                <CheckCircle className="h-12 w-12 text-primary" />
              ) : (
                <Download className="h-12 w-12 text-primary animate-bounce" />
              )}
              
              <div>
                <h2 className="text-xl font-semibold mb-2">
                  {downloadStarted ? "Download Started!" : "Starting Download..."}
                </h2>
                <p className="text-muted-foreground mb-6">
                  {downloadStarted
                    ? "Your download has started. If it doesn't, click the button below."
                    : "Your download should start automatically..."}
                </p>
              </div>

              <GlassButton
                variant="default"
                size="lg"
                onClick={handleManualDownload}
                className="gap-2"
              >
                <Download className="h-5 w-5" />
                Download Now
              </GlassButton>
            </div>
          </motion.div>

          {/* Installation Instructions */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="glass-panel rounded-2xl p-8 border border-border/40"
          >
            <div className="flex items-start gap-3 mb-4">
              <CheckCircle className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold mb-4">Installation Instructions</h3>
                <ol className="space-y-3 text-muted-foreground list-decimal list-inside">
                  <li>Unzip the downloaded file</li>
                  <li>Drag ArcAi to your Applications folder</li>
                  <li>Right-click ArcAi and select "Open" for first launch</li>
                  <li>Click "Open" when macOS asks for confirmation</li>
                </ol>
              </div>
            </div>
          </motion.div>

          {/* Update Information */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.6 }}
            className="glass-panel rounded-2xl p-8 border border-border/40"
          >
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold mb-4">Updates</h3>
                <div className="space-y-3 text-muted-foreground">
                  <p>ArcAi updates automatically in most cases.</p>
                  <p>If you experience issues after an update:</p>
                  <ol className="space-y-2 list-decimal list-inside ml-4">
                    <li>Drag ArcAi from Applications to Trash</li>
                    <li>Visit chatwitharc.com/downloads for the latest version</li>
                    <li>Reinstall following the instructions above</li>
                  </ol>
                </div>
              </div>
            </div>
          </motion.div>

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
