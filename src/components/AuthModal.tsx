import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassButton } from "@/components/ui/glass-button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Mail, Lock, Eye, EyeOff, X, Crown, Sparkles, Mic, ImagePlus, Globe, Code2, PenLine, Music, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GatedFeature, AuthGateDetail } from "@/hooks/useRequireAuth";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional contextual feature that triggered the modal */
  gatedFeature?: GatedFeature;
}

const FEATURE_COPY: Record<GatedFeature, { title: string; subtitle: string; icon: React.ComponentType<{ className?: string }> }> = {
  menu: { title: "Sign in to open this", subtitle: "Your chats and settings live behind a free account.", icon: Sparkles },
  music: { title: "Sign in to play music", subtitle: "Vibe with Arc's built-in lofi and YouTube player after signing in.", icon: Music },
  tools: { title: "Sign in to use tools", subtitle: "Web search, image gen, code, canvas and more.", icon: Sparkles },
  personas: { title: "Sign in to chat with personas", subtitle: "Talk to custom AI personalities once you're signed in.", icon: Sparkles },
  voice: { title: "Sign in for voice mode", subtitle: "Real-time speech-to-speech with Arc.", icon: Mic },
  "image-gen": { title: "Sign in to generate images", subtitle: "Create and edit images with Nano Banana 2.", icon: ImagePlus },
  files: { title: "Sign in to attach files", subtitle: "PDFs, docs, images and more.", icon: Paperclip },
  research: { title: "Sign in for live research", subtitle: "Cited sources from across the web.", icon: Globe },
  code: { title: "Sign in to write code", subtitle: "Pro-tier code & app generation.", icon: Code2 },
  canvas: { title: "Sign in to open the canvas", subtitle: "Long-form writing & layouts.", icon: PenLine },
  boost: { title: "Sign in, then go Boost", subtitle: "Create your account in one tap — we'll take you straight to Boost.", icon: Crown },
  generic: { title: "Welcome to ArcAI", subtitle: "Sign in to unlock everything.", icon: Sparkles },
};

export function AuthModal({ isOpen, onClose, gatedFeature }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const feature = gatedFeature ?? "generic";
  const copy = FEATURE_COPY[feature];
  const FeatureIcon = copy.icon;

  // Reactive light/dark detection so the modal can render a true light-mode
  // variant instead of always wrapping itself in `.dark`.
  const [isLight, setIsLight] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("light"),
  );
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const update = () => setIsLight(root.classList.contains("light"));
    update();
    const obs = new MutationObserver(update);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // Themed class tokens for the modal surface.
  const t = isLight
    ? {
        card: "from-white/95 via-white/92 to-white/95",
        textStrong: "text-zinc-900",
        textMuted: "text-zinc-600",
        textSubtle: "text-zinc-500",
        textFaint: "text-zinc-400",
        surface: "bg-zinc-900/[0.04]",
        surfaceHover: "hover:bg-zinc-900/[0.08]",
        border: "border-zinc-900/10",
        borderHover: "hover:border-zinc-900/20",
        divider: "via-zinc-900/15",
        closeIcon: "text-zinc-700",
        badgeRing: "border-white",
        tabActive: "bg-zinc-900/[0.08] text-zinc-900 shadow-[0_0_12px_rgba(0,0,0,0.04)]",
        tabIdle: "text-zinc-500 hover:text-zinc-800",
        socialText: "!text-zinc-900",
        inputBg: "bg-zinc-900/[0.04] border border-zinc-900/10",
        inputHover: "hover:bg-zinc-900/[0.07] hover:border-zinc-900/20",
        inputPlaceholder: "placeholder:text-zinc-400",
        inputColor: "#18181b",
        autofillBg: "rgb(255, 255, 255)",
        autofillText: "#18181b",
        blob1: "bg-blue-500/15",
        blob2: "bg-purple-500/15",
        blob3: "bg-cyan-400/10",
      }
    : {
        card: "from-black/85 via-black/80 to-black/85",
        textStrong: "text-white",
        textMuted: "text-white/60",
        textSubtle: "text-white/40",
        textFaint: "text-white/40",
        surface: "bg-white/5",
        surfaceHover: "hover:bg-white/10",
        border: "border-white/10",
        borderHover: "hover:border-white/20",
        divider: "via-white/20",
        closeIcon: "text-white/70",
        badgeRing: "border-black",
        tabActive: "bg-white/10 text-white shadow-[0_0_12px_rgba(255,255,255,0.06)]",
        tabIdle: "text-white/50 hover:text-white/70",
        socialText: "!text-white",
        inputBg: "bg-white/5 border border-white/10",
        inputHover: "hover:bg-white/[0.07] hover:border-white/20",
        inputPlaceholder: "placeholder:text-white/40",
        inputColor: "#fff",
        autofillBg: "rgb(0, 0, 0)",
        autofillText: "#fff",
        blob1: "bg-blue-500/30",
        blob2: "bg-purple-500/25",
        blob3: "bg-cyan-400/20",
      };

  // If user opens via the "Boost" CTA, queue the upgrade modal to open
  // automatically right after auth completes.
  useEffect(() => {
    if (!isOpen) return;
    if (feature === "boost") {
      sessionStorage.setItem("arcai-post-auth-action", "open-upgrade");
    }
  }, [isOpen, feature]);

  // After auth state flips to a real user, fire the queued post-auth action.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      const queued = sessionStorage.getItem("arcai-post-auth-action");
      if (queued === "open-upgrade") {
        sessionStorage.removeItem("arcai-post-auth-action");
        setTimeout(
          () => window.dispatchEvent(new CustomEvent("open-upgrade-modal")),
          400,
        );
      }
    };
    window.addEventListener("arcai-auth-completed", handler);
    return () => window.removeEventListener("arcai-auth-completed", handler);
  }, []);

  const handleAuth = async () => {
    if (!supabase || !isSupabaseConfigured) {
      toast({ title: "Error", description: "Authentication is not available.", variant: "destructive" });
      return;
    }
    if (!email || !password) {
      toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: "Welcome back!", description: "You've been signed in successfully" });
        onClose();
      } else {
        const redirectUrl = 'https://askarc.chat/';
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: redirectUrl },
        });
        if (error) throw error;
        // Don't close modal — show email confirmation state
        setShowEmailConfirmation(true);
      }
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "An error occurred", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    try {
      const { error } = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
        extraParams: { prompt: "select_account" },
      });
      if (error) throw error;
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "An error occurred with Google sign in", variant: "destructive" });
      setLoading(false);
    }
  };

  const handleAppleAuth = async () => {
    setLoading(true);
    try {
      const { error } = await lovable.auth.signInWithOAuth("apple", {
        redirect_uri: window.location.origin,
      });
      if (error) throw error;
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "An error occurred with Apple sign in", variant: "destructive" });
      setLoading(false);
    }
  };

  const onSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    if (!loading) handleAuth();
  };

  return (
    <div className="dark">
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent 
          className="sm:max-w-md p-0 bg-transparent border-0 shadow-none overflow-visible" 
          hideCloseButton
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full"
          >
            {/* Animated Liquid Blobs */}
            <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
              <motion.div animate={{ x: [0, 30, 0], y: [0, -20, 0], scale: [1, 1.1, 1] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-blue-500/30 blur-[80px]" />
              <motion.div animate={{ x: [0, -20, 0], y: [0, 30, 0], scale: [1, 1.15, 1] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }} className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-purple-500/25 blur-[80px]" />
              <motion.div animate={{ x: [0, 15, 0], y: [0, -15, 0], scale: [1, 1.2, 1] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 2 }} className="absolute top-1/2 right-0 w-48 h-48 rounded-full bg-cyan-400/20 blur-[70px]" />
            </div>

            {/* Main Glass Card */}
            <div className="relative backdrop-blur-[40px] bg-gradient-to-br from-black/85 via-black/80 to-black/85 rounded-3xl border-0 shadow-2xl shadow-black/50 p-8">
              <motion.button
                whileHover={{ scale: 1.1, backgroundColor: "rgba(255, 255, 255, 0.15)" }}
                whileTap={{ scale: 0.95 }}
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors backdrop-blur-sm"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-white/70" />
              </motion.button>

              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-6">
                {showEmailConfirmation ? (
                  /* Email Confirmation Screen */
                  <div className="text-center py-4 space-y-5">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", duration: 0.5 }}
                      className="flex justify-center"
                    >
                      <div className="w-20 h-20 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                        <Mail className="w-10 h-10 text-primary" />
                      </div>
                    </motion.div>
                    <div>
                      <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
                      <p className="text-white/60 text-sm leading-relaxed">
                        We sent a confirmation link to<br />
                        <span className="text-white font-medium">{email}</span>
                      </p>
                    </div>
                    <p className="text-white/40 text-xs">
                      Click the link in your email to activate your account, then come back here to sign in.
                    </p>
                    <button
                      onClick={() => {
                        setShowEmailConfirmation(false);
                        setIsLogin(true);
                        setEmail("");
                        setPassword("");
                        onClose();
                      }}
                      className="w-full py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors"
                    >
                      Got it
                    </button>
                  </div>
                ) : (
                <>
                {/* Logo / contextual headline */}
                <div className="text-center">
                  <motion.div
                    animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 1] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className="flex justify-center mb-4"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center backdrop-blur-sm relative">
                      <img src="/arc-logo-ui.png" alt="ArcAI" className="h-10 w-10" />
                      {feature !== "generic" && (
                        <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary/90 border-2 border-black flex items-center justify-center">
                          <FeatureIcon className="h-3.5 w-3.5 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                  </motion.div>
                  <h1 className="text-2xl font-bold text-white mb-2">{copy.title}</h1>
                  <p className="text-white/60 text-sm">{copy.subtitle}</p>
                </div>

                {/* Boost CTA card */}
                <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-xl bg-primary/25 border border-primary/40 flex items-center justify-center shrink-0">
                      <Crown className="h-4 w-4 text-primary-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-white">Unlock everything with Boost</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground">$7/mo</span>
                      </div>
                      <p className="text-[11px] text-white/70 leading-snug">
                        Personas · Voice mode · Image gen · Research · Code & Canvas · Music · File uploads · Memory · Chat history search
                      </p>
                    </div>
                  </div>
                </div>


                {/* Tab Switcher */}
                <div className="flex p-1 rounded-full bg-white/5 border border-white/10">
                  <button
                    type="button"
                    onClick={() => { setIsLogin(true); setShowEmailForm(false); }}
                    className={cn(
                      "flex-1 py-2 px-4 rounded-full text-sm font-medium transition-all duration-200",
                      isLogin ? "bg-white/10 text-white shadow-[0_0_12px_rgba(255,255,255,0.06)]" : "text-white/50 hover:text-white/70"
                    )}
                    disabled={loading}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsLogin(false); setShowEmailForm(false); }}
                    className={cn(
                      "flex-1 py-2 px-4 rounded-full text-sm font-medium transition-all duration-200",
                      !isLogin ? "bg-white/10 text-white shadow-[0_0_12px_rgba(255,255,255,0.06)]" : "text-white/50 hover:text-white/70"
                    )}
                    disabled={loading}
                  >
                    Sign Up
                  </button>
                </div>

                {/* Social Buttons */}
                <div className="space-y-3">
                  <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                    <GlassButton
                      variant="ghost"
                      onClick={handleGoogleAuth}
                      disabled={loading}
                      className="w-full h-12 rounded-xl border border-white/10 hover:border-white/20 text-base !text-white"
                      type="button"
                    >
                      <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      Continue with Google
                    </GlassButton>
                  </motion.div>

                  <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                    <GlassButton
                      variant="ghost"
                      onClick={handleAppleAuth}
                      disabled={loading}
                      className="w-full h-12 rounded-xl border border-white/10 hover:border-white/20 text-base !text-white"
                      type="button"
                    >
                      <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                      </svg>
                      Continue with Apple
                    </GlassButton>
                  </motion.div>
                </div>

                {/* Divider & Email Toggle */}
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  <button
                    type="button"
                    onClick={() => setShowEmailForm(!showEmailForm)}
                    className="text-xs text-white/40 hover:text-white/70 font-medium transition-colors whitespace-nowrap"
                  >
                    {showEmailForm ? "Hide email form" : "Use email instead"}
                  </button>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </div>

                {/* Email Form (collapsed by default) */}
                <AnimatePresence>
                  {showEmailForm && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <form onSubmit={onSubmit} className="space-y-4 px-1 pt-1 pb-1">
                        <div className="space-y-2">
                          <label htmlFor="email" className="text-sm font-medium text-white/80">Email</label>
                          <div className="relative group">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 transition-colors group-focus-within:text-blue-400" />
                            <input
                              id="email"
                              name="email"
                              type="email"
                              inputMode="email"
                              autoCapitalize="none"
                              autoCorrect="off"
                              spellCheck={false}
                              autoComplete={isLogin ? "username" : "email"}
                              placeholder="Enter your email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className={cn(
                                "w-full h-12 pl-10 pr-4 rounded-xl",
                                "bg-white/5 border border-white/10",
                                "backdrop-blur-sm placeholder:text-white/40",
                                "focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50",
                                "transition-all duration-200",
                                "hover:bg-white/[0.07] hover:border-white/20",
                                "text-white"
                              )}
                              style={{ color: "#fff", caretColor: "#fff", WebkitTextFillColor: "#fff" }}
                              disabled={loading}
                              required
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label htmlFor="password" className="text-sm font-medium text-white/80">Password</label>
                          <div className="relative group">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 transition-colors group-focus-within:text-blue-400" />
                            <input
                              id="password"
                              name="password"
                              type={showPassword ? "text" : "password"}
                              placeholder="Enter your password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                            className={cn(
                              "w-full h-12 pl-10 pr-10 rounded-xl",
                              "bg-white/5 border border-white/10",
                              "backdrop-blur-sm placeholder:text-white/40",
                              "focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50",
                              "transition-all duration-200",
                              "hover:bg-white/[0.07] hover:border-white/20",
                              "text-white"
                            )}
                            style={{ color: "#fff", caretColor: "#fff", WebkitTextFillColor: "#fff" }}
                              disabled={loading}
                              autoComplete={isLogin ? "current-password" : "new-password"}
                              required
                            />
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.95 }}
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                              tabIndex={-1}
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </motion.button>
                          </div>
                        </div>

                        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                          <GlassButton
                            variant="glow"
                            type="submit"
                            disabled={loading}
                            onClick={(e) => {
                              // iOS HapticOverlay (native checkbox) can swallow the
                              // submit default action, so trigger handleAuth directly.
                              e.preventDefault();
                              if (!loading) handleAuth();
                            }}
                            className="w-full h-12 rounded-xl text-base font-medium"
                          >
                            {loading ? "Loading..." : isLogin ? "Sign In" : "Sign Up"}
                          </GlassButton>
                        </motion.div>
                      </form>
                    </motion.div>
                  )}
                </AnimatePresence>
                </>
                )}
              </motion.div>
            </div>
          </motion.div>
        </DialogContent>
      </Dialog>
      <style>{`
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 30px rgb(0, 0, 0) inset !important;
          -webkit-text-fill-color: white !important;
          caret-color: white !important;
        }
      `}</style>
    </div>
  );
}
