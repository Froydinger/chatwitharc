import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassButton } from "@/components/ui/glass-button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { signInWithGoogle } from "@/integrations/auth";
import { Mail, Lock, Eye, EyeOff, X, Sparkles, Mic, ImagePlus, Globe, Code2, PenLine, Music, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GatedFeature, AuthGateDetail } from "@/hooks/useRequireAuth";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional contextual feature that triggered the modal */
  gatedFeature?: GatedFeature;
}

const FEATURE_COPY: Record<GatedFeature, { title: string; subtitle: string; icon: React.ComponentType<{ className?: string }> }> = {
  menu: { title: "Sign in to continue", subtitle: "Chats and settings need an account.", icon: Sparkles },
  music: { title: "Sign in for music", subtitle: "Lofi & YouTube, free with an account.", icon: Music },
  tools: { title: "Sign in to use tools", subtitle: "Search, images, code, canvas.", icon: Sparkles },
  personas: { title: "Sign in for personas", subtitle: "Chat with custom AI personalities.", icon: Sparkles },
  voice: { title: "Sign in for voice mode", subtitle: "Real-time speech with Arc.", icon: Mic },
  "image-gen": { title: "Sign in to make images", subtitle: "Generate & edit with GPT Image 2.", icon: ImagePlus },
  files: { title: "Sign in to attach files", subtitle: "PDFs, docs, images.", icon: Paperclip },
  research: { title: "Sign in for research", subtitle: "Cited sources from the web.", icon: Globe },
  code: { title: "Sign in to write code", subtitle: "Code and app generation.", icon: Code2 },
  canvas: { title: "Sign in for canvas", subtitle: "Long-form writing & layouts.", icon: PenLine },
  generic: { title: "Welcome to ArcAI", subtitle: "Sign in to unlock everything.", icon: Sparkles },
};

export function AuthModal({ isOpen, onClose, gatedFeature }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [showEmailForm, setShowEmailForm] = useState(false);
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
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          toast({
            title: "Email sign-up is coming soon",
            description: "Use Google for now, or try again shortly.",
          });
          return;
        }
        toast({ title: "Account created!", description: "Welcome to ArcAI." });
        onClose();
      }
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "An error occurred", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) throw error;
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "An error occurred with Google sign in", variant: "destructive" });
      setLoading(false);
    }
  };


  const onSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    if (!loading) handleAuth();
  };

  return (
    <div className={isLight ? "light" : "dark"}>
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
              <motion.div animate={{ x: [0, 30, 0], y: [0, -20, 0], scale: [1, 1.1, 1] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} className={cn("absolute -top-20 -right-20 w-64 h-64 rounded-full blur-[80px]", t.blob1)} />
              <motion.div animate={{ x: [0, -20, 0], y: [0, 30, 0], scale: [1, 1.15, 1] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }} className={cn("absolute -bottom-20 -left-20 w-64 h-64 rounded-full blur-[80px]", t.blob2)} />
              <motion.div animate={{ x: [0, 15, 0], y: [0, -15, 0], scale: [1, 1.2, 1] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 2 }} className={cn("absolute top-1/2 right-0 w-48 h-48 rounded-full blur-[70px]", t.blob3)} />
            </div>

            {/* Main Glass Card */}
            <div className={cn("relative backdrop-blur-[40px] bg-gradient-to-br rounded-3xl border-0 shadow-2xl p-8", t.card, isLight ? "shadow-zinc-900/15" : "shadow-black/50")}>
              <motion.button
                whileHover={{ scale: 1.1, backgroundColor: isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.15)" }}
                whileTap={{ scale: 0.95 }}
                onClick={onClose}
                className={cn("absolute top-4 right-4 w-8 h-8 rounded-full border flex items-center justify-center transition-colors backdrop-blur-sm", t.surface, t.border, t.surfaceHover)}
                aria-label="Close"
              >
                <X className={cn("h-4 w-4", t.closeIcon)} />
              </motion.button>

              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-6">
                <>
                {/* Logo / contextual headline */}
                <div className="text-center">
                  <motion.div
                    animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 1] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className="flex justify-center mb-4"
                  >
                    <div className={cn("w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border flex items-center justify-center backdrop-blur-sm relative", t.border)}>
                      <img src="/arc-logo-ui.png" alt="ArcAI" className="h-10 w-10" />
                    </div>
                  </motion.div>
                  <h1 className={cn("text-2xl font-bold mb-2", t.textStrong)}>{copy.title}</h1>
                  <p className={cn("text-sm", t.textMuted)}>{copy.subtitle}</p>
                </div>

                {/* Free-account emphasis */}
                <div className={cn("flex items-center justify-center gap-2 text-[12px]", t.textMuted)}>
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span>
                    <span className={cn("font-semibold", t.textStrong)}>Free forever</span> — no card, no trial.
                  </span>
                </div>


                {/* Tab Switcher */}
                <div className={cn("flex p-1 rounded-full border", t.surface, t.border)}>
                  <button
                    type="button"
                    onClick={() => { setIsLogin(true); setShowEmailForm(false); }}
                    className={cn(
                      "flex-1 py-2 px-4 rounded-full text-sm font-medium transition-all duration-200",
                      isLogin ? t.tabActive : t.tabIdle,
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
                      !isLogin ? t.tabActive : t.tabIdle,
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
                      className={cn("w-full h-12 rounded-xl border text-base", t.border, t.borderHover, t.socialText)}
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

                </div>

                {/* Divider & Email Toggle */}
                <div className="flex items-center gap-4">
                  <div className={cn("flex-1 h-px bg-gradient-to-r from-transparent to-transparent", t.divider)} />
                  <button
                    type="button"
                    onClick={() => setShowEmailForm(!showEmailForm)}
                    className={cn("text-xs font-medium transition-colors whitespace-nowrap", t.textSubtle, isLight ? "hover:text-zinc-800" : "hover:text-white/70")}
                  >
                    {showEmailForm ? "Hide email form" : "Use email instead"}
                  </button>
                  <div className={cn("flex-1 h-px bg-gradient-to-r from-transparent to-transparent", t.divider)} />
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
                          <label htmlFor="email" className={cn("text-sm font-medium", isLight ? "text-zinc-700" : "text-white/80")}>Email</label>
                          <div className="relative group">
                            <Mail className={cn("absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors group-focus-within:text-blue-400", t.textFaint)} />
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
                                t.inputBg,
                                "backdrop-blur-sm",
                                t.inputPlaceholder,
                                "focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50",
                                "transition-all duration-200",
                                t.inputHover,
                                t.textStrong,
                              )}
                              style={{ color: t.inputColor, caretColor: t.inputColor, WebkitTextFillColor: t.inputColor }}
                              disabled={loading}
                              required
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label htmlFor="password" className={cn("text-sm font-medium", isLight ? "text-zinc-700" : "text-white/80")}>Password</label>
                          <div className="relative group">
                            <Lock className={cn("absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors group-focus-within:text-blue-400", t.textFaint)} />
                            <input
                              id="password"
                              name="password"
                              type={showPassword ? "text" : "password"}
                              placeholder="Enter your password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                            className={cn(
                              "w-full h-12 pl-10 pr-10 rounded-xl",
                              t.inputBg,
                              "backdrop-blur-sm",
                              t.inputPlaceholder,
                              "focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50",
                              "transition-all duration-200",
                              t.inputHover,
                              t.textStrong,
                            )}
                            style={{ color: t.inputColor, caretColor: t.inputColor, WebkitTextFillColor: t.inputColor }}
                              disabled={loading}
                              autoComplete={isLogin ? "current-password" : "new-password"}
                              required
                            />
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.95 }}
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className={cn("absolute right-3 top-1/2 -translate-y-1/2 transition-colors", t.textFaint, isLight ? "hover:text-zinc-700" : "hover:text-white/70")}
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
          -webkit-box-shadow: 0 0 0 30px ${t.autofillBg} inset !important;
          -webkit-text-fill-color: ${t.autofillText} !important;
          caret-color: ${t.autofillText} !important;
        }
      `}</style>
    </div>
  );
}
