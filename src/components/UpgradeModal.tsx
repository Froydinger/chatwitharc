import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, MessageCircle, Mic, Headphones, Sparkles, X, ArrowLeft, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { EmbeddedCheckoutForm } from "@/components/EmbeddedCheckout";
import { useAuth } from "@/hooks/useAuth";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
}

export function UpgradeModal({ isOpen, onClose, userName }: UpgradeModalProps) {
  const [step, setStep] = useState<'info' | 'auth' | 'checkout'>('info');
  const [isLogin, setIsLogin] = useState(false); // default to sign-up for new users
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Auto-advance to checkout when user authenticates during auth step
  useEffect(() => {
    if (user && step === 'auth') {
      setStep('checkout');
    }
  }, [user, step]);

  const handleClose = () => {
    setStep('info');
    setEmail("");
    setPassword("");
    onClose();
  };

  const handleUpgradeClick = () => {
    if (user) {
      setStep('checkout');
    } else {
      setStep('auth');
    }
  };

  const handleBack = () => {
    if (step === 'checkout' && !user) {
      setStep('auth');
    } else if (step === 'checkout' || step === 'auth') {
      setStep('info');
    }
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
        toast({ title: "Welcome back!", description: "Proceeding to checkout..." });
      } else {
        const redirectUrl = `${window.location.origin}/`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectUrl },
        });
        if (error) throw error;
        toast({ title: "Account created!", description: "Proceeding to checkout..." });
      }
      // useEffect will auto-advance to checkout
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "An error occurred", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    if (!supabase || !isSupabaseConfigured) {
      toast({ title: "Error", description: "Authentication is not available.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl },
      });
      if (error) throw error;
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "An error occurred", variant: "destructive" });
      setLoading(false);
    }
  };

  const onSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    if (!loading) handleAuth();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className={step === 'checkout' ? "w-full max-w-lg max-h-[90vh] overflow-y-auto" : "w-full max-w-md"}
          >
            <GlassCard variant="bubble" glow className="p-8 relative overflow-hidden border border-cyan-500/30 animate-[neon-pulse_2s_ease-in-out_infinite]">
              {/* Gradient accent */}
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-purple-500" />
              
              {/* Close button */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>

              {step === 'checkout' ? (
                <div className="space-y-4">
                  <button
                    onClick={handleBack}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                  <EmbeddedCheckoutForm />
                </div>
              ) : step === 'auth' ? (
                <div className="space-y-5">
                  <button
                    onClick={handleBack}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>

                  {/* Header */}
                  <div className="text-center space-y-1">
                    <h2 className="text-xl font-bold text-foreground">Create an account to subscribe</h2>
                    <p className="text-sm text-muted-foreground">Quick sign-up, then straight to checkout</p>
                  </div>

                  {/* Tab Switcher */}
                  <div className="flex p-1 rounded-full bg-white/5 border border-white/10">
                    <button
                      type="button"
                      onClick={() => setIsLogin(false)}
                      className={cn(
                        "flex-1 py-2 px-4 rounded-full text-sm font-medium transition-all duration-200",
                        !isLogin
                          ? "bg-white/10 text-white shadow-[0_0_12px_rgba(255,255,255,0.06)]"
                          : "text-white/50 hover:text-white/70"
                      )}
                      disabled={loading}
                    >
                      Sign Up
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsLogin(true)}
                      className={cn(
                        "flex-1 py-2 px-4 rounded-full text-sm font-medium transition-all duration-200",
                        isLogin
                          ? "bg-white/10 text-white shadow-[0_0_12px_rgba(255,255,255,0.06)]"
                          : "text-white/50 hover:text-white/70"
                      )}
                      disabled={loading}
                    >
                      Sign In
                    </button>
                  </div>

                  {/* Auth Form */}
                  <form onSubmit={onSubmit} className="space-y-3">
                    <div className="relative group">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 transition-colors group-focus-within:text-blue-400" />
                      <input
                        type="email"
                        inputMode="email"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={cn(
                          "w-full h-11 pl-10 pr-4 rounded-xl",
                          "bg-white/5 border border-white/10",
                          "backdrop-blur-sm text-white placeholder:text-white/40",
                          "focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50",
                          "transition-all duration-200"
                        )}
                        disabled={loading}
                        required
                      />
                    </div>
                    <div className="relative group">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 transition-colors group-focus-within:text-blue-400" />
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={cn(
                          "w-full h-11 pl-10 pr-10 rounded-xl",
                          "bg-white/5 border border-white/10",
                          "backdrop-blur-sm text-white placeholder:text-white/40",
                          "focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50",
                          "transition-all duration-200"
                        )}
                        disabled={loading}
                        autoComplete={isLogin ? "current-password" : "new-password"}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <GlassButton
                      variant="glow"
                      type="submit"
                      disabled={loading}
                      className="w-full h-11 rounded-xl text-sm font-medium"
                    >
                      {loading ? "Loading..." : isLogin ? "Sign In & Continue" : "Sign Up & Continue"}
                    </GlassButton>
                  </form>

                  {/* Divider */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    <span className="text-xs text-white/40 font-medium">OR</span>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  </div>

                  {/* Google */}
                  <GlassButton
                    variant="ghost"
                    onClick={handleGoogleAuth}
                    disabled={loading}
                    className="w-full h-11 rounded-xl border border-white/10 hover:border-white/20 text-sm"
                    type="button"
                  >
                    <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Continue with Google
                  </GlassButton>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Header */}
                  <div className="text-center space-y-2">
                    <motion.div
                      animate={{ rotate: [0, 5, -5, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      className="flex justify-center"
                    >
                      <div className="p-3 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20">
                        <Crown className="w-8 h-8 text-cyan-400" />
                      </div>
                    </motion.div>
                    <h2 className="text-xl font-bold text-foreground">
                      {userName ? `Welcome, ${userName}!` : "Welcome to ArcAi!"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Unlock the full ArcAi experience with Pro
                    </p>
                  </div>

                  {/* Benefits */}
                  <ul className="space-y-3">
                    <li className="flex items-center gap-3 text-sm text-foreground">
                      <div className="p-1 rounded-full bg-cyan-500/10">
                        <MessageCircle className="w-3.5 h-3.5 text-cyan-400" />
                      </div>
                      <span><strong>Unlimited</strong> messages — no daily caps</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm text-foreground">
                      <div className="p-1 rounded-full bg-cyan-500/10">
                        <Mic className="w-3.5 h-3.5 text-cyan-400" />
                      </div>
                      <span><strong>Unlimited</strong> voice sessions</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm text-foreground">
                      <div className="p-1 rounded-full bg-cyan-500/10">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      </div>
                      <span>Switch between AI models</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm text-foreground">
                      <div className="p-1 rounded-full bg-cyan-500/10">
                        <Headphones className="w-3.5 h-3.5 text-cyan-400" />
                      </div>
                      <span>Built-in music player</span>
                    </li>
                  </ul>

                  {/* Price */}
                  <div className="text-center">
                    <span className="text-3xl font-bold text-foreground">$8</span>
                    <span className="text-muted-foreground text-sm"> /month</span>
                  </div>

                  {/* Buttons */}
                  <div className="space-y-3">
                    <button
                      onClick={handleUpgradeClick}
                      className="w-full px-6 py-3.5 rounded-full font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                    >
                      <Crown className="w-4 h-4" />
                      Upgrade to Pro
                    </button>
                    <button
                      onClick={handleClose}
                      className="w-full px-6 py-2.5 rounded-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Maybe later — continue free
                    </button>
                  </div>
                </div>
              )}
            </GlassCard>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
