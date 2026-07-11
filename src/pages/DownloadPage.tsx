import { motion } from "framer-motion";
import { AlertCircle, ExternalLink, Monitor, Smartphone } from "lucide-react";
import { GlassButton } from "@/components/ui/glass-button";
import { BackgroundGradients } from "@/components/BackgroundGradients";
import { ThemedLogo } from "@/components/ThemedLogo";
import { AppleLogo } from "@/components/icons/AppleLogo";
import { WindowsLogo } from "@/components/icons/WindowsLogo";
import { Link } from "react-router-dom";

const APP_URL = "https://askarc.chat";

export function DownloadPage() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden text-foreground">
      <BackgroundGradients />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-3xl space-y-8"
        >
          <div className="flex flex-col items-center gap-6 text-center">
            <ThemedLogo className="h-24 w-24" />
            <div>
              <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
                <AlertCircle className="h-4 w-4" />
                Native apps coming soon
              </div>
              <h1 className="mb-3 text-4xl font-bold">Use ArcAI in your browser for now</h1>
              <p className="mx-auto max-w-2xl text-muted-foreground">
                The Mac and Windows apps are paused while we rebuild the desktop release pipeline. The web app is the
                current supported version and works on desktop, tablet, and mobile.
              </p>
            </div>
          </div>

          <div className="glass-panel rounded-2xl border border-border/40 p-8">
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Monitor className="h-7 w-7 text-primary" />
                </div>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Smartphone className="h-7 w-7 text-primary" />
                </div>
              </div>

              <div>
                <h2 className="mb-2 text-2xl font-semibold">Open the web app</h2>
                <p className="text-muted-foreground">
                  Use Chrome, Safari, Arc, Edge, or Brave. Sign in normally and your chats, settings, Boost access, and
                  memory are all there.
                </p>
              </div>

              <GlassButton asChild variant="default" size="lg" className="gap-2">
                <a href={APP_URL}>
                  Open ArcAI Web App
                  <ExternalLink className="h-5 w-5" />
                </a>
              </GlassButton>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="glass-panel rounded-2xl border border-border/40 p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <AppleLogo className="h-6 w-6 text-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold">Mac, iPhone, and iPad</h3>
                  <p className="text-sm text-muted-foreground">Safari or any modern browser</p>
                </div>
              </div>
              <ol className="space-y-3 text-sm text-muted-foreground">
                <li>1. Open askarc.chat in Safari or your browser.</li>
                <li>2. Sign in to your ArcAI account.</li>
                <li>3. On iPhone or iPad, tap Share, then Add to Home Screen.</li>
                <li>4. On Mac Safari, use File, then Add to Dock for an app-style shortcut.</li>
              </ol>
            </div>

            <div className="glass-panel rounded-2xl border border-border/40 p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <WindowsLogo className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold">Windows and Android</h3>
                  <p className="text-sm text-muted-foreground">Chrome, Edge, Brave, or Arc</p>
                </div>
              </div>
              <ol className="space-y-3 text-sm text-muted-foreground">
                <li>1. Open askarc.chat in your browser.</li>
                <li>2. Sign in to your ArcAI account.</li>
                <li>3. In Chrome or Edge, open the browser menu.</li>
                <li>4. Choose Install app, Add to desktop, or Add to Home screen.</li>
              </ol>
            </div>
          </div>

          <div className="glass-panel rounded-2xl border border-border/40 p-6 text-center">
            <h3 className="mb-2 text-lg font-semibold">Desktop downloads are paused</h3>
            <p className="text-sm text-muted-foreground">
              We are rebuilding the official Mac and Windows installers as ArcAI 5.1.0 before turning downloads back on.
              Until then, the browser app is the safest current release.
            </p>
          </div>

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
            <a href={APP_URL} className="transition-colors hover:text-primary">
              Open Web App
            </a>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
