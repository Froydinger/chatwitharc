import { useState } from "react";
import { motion } from "framer-motion";
import { GlassButton } from "@/components/ui/glass-button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Lock, Eye, EyeOff, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleAuth = async () => {
    if (!email || !password) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
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
        const redirectUrl = `${window.location.origin}/`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectUrl },
        });
        if (error) throw error;
        toast({ title: "Account created!", description: "Please check your email to verify your account" });
        onClose();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "An error occurred with Google sign in",
        variant: "destructive",
      });
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
          {/* Liquid Glass Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full"
          >
            {/* Animated Liquid Blobs */}
            <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
              <motion.div
                animate={{
                  x: [0, 30, 0],
                  y: [0, -20, 0],
                  scale: [1, 1.1, 1],
                }}
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-blue-500/30 blur-[80px]"
              />
              <motion.div
                animate={{
                  x: [0, -20, 0],
                  y: [0, 30, 0],
                  scale: [1, 1.15, 1],
                }}
                transition={{
                  duration: 10,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 1,
                }}
                className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-purple-500/25 blur-[80px]"
              />
              <motion.div
                animate={{
                  x: [0, 15, 0],
                  y: [0, -15, 0],
                  scale: [1, 1.2, 1],
                }}
                transition={{
                  duration: 12,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 2,
                }}
                className="absolute top-1/2 right-0 w-48 h-48 rounded-full bg-cyan-400/20 blur-[70px]"
              />
            </div>

            {/* Main Glass Card */}
            <div className="relative backdrop-blur-[40px] bg-gradient-to-br from-black/85 via-black/80 to-black/85 rounded-3xl border border-white/[0.08] shadow-2xl shadow-black/50 p-8">
              {/* Custom Close Button */}
              <motion.button
                whileHover={{ scale: 1.1, backgroundColor: "rgba(255, 255, 255, 0.15)" }}
                whileTap={{ scale: 0.95 }}
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors backdrop-blur-sm"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-white/70" />
              </motion.button>

              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="space-y-6"
              >
                {/* Logo */}
                <div className="text-center">
                  <motion.div
                    animate={{
                      rotate: [0, 5, -5, 0],
                      scale: [1, 1.05, 1],
                    }}
                    transition={{ 
                      duration: 4, 
                      repeat: Infinity, 
                      ease: "easeInOut",
                    }}
                    className="flex justify-center mb-4"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center backdrop-blur-sm">
                      <img src="/arc-logo-ui.png" alt="ArcAI" className="h-10 w-10" />
                    </div>
                  </motion.div>
                  <h1 className="text-2xl font-bold text-white mb-2">Welcome to ArcAI</h1>
                  <p className="text-white/60 text-sm">{isLogin ? "Sign in to continue" : "Create your account"}</p>
                </div>

                <form onSubmit={onSubmit} className="space-y-4">
                  {/* Email */}
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
                          "backdrop-blur-sm text-white placeholder:text-white/40",
                          "focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50",
                          "transition-all duration-200",
                          "hover:bg-white/[0.07] hover:border-white/20"
                        )}
                        disabled={loading}
                        autoFocus={false}
                        required
                      />
                    </div>
                  </div>

                  {/* Password */}
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
                          "backdrop-blur-sm text-white placeholder:text-white/40",
                          "focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50",
                          "transition-all duration-200",
                          "hover:bg-white/[0.07] hover:border-white/20"
                        )}
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
                        aria-label={showPassword ? "Hide password" : "Show password"}
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
                      className="w-full h-12 rounded-xl text-base font-medium"
                    >
                      {loading ? "Loading..." : isLogin ? "Sign In" : "Sign Up"}
                    </GlassButton>
                  </motion.div>
                </form>

                {/* Divider */}
                <div className="flex items-center gap-4 py-2">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  <span className="text-xs text-white/40 font-medium">OR</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </div>

                {/* Google Sign In */}
                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                  <GlassButton 
                    variant="ghost" 
                    onClick={handleGoogleAuth} 
                    disabled={loading} 
                    className="w-full h-12 rounded-xl border border-white/10 hover:border-white/20 text-base"
                    type="button"
                  >
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Continue with Google
                  </GlassButton>
                </motion.div>

                {/* Toggle Auth Mode */}
                <div className="text-center pt-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setIsLogin(!isLogin)}
                    className="text-sm text-white/50 hover:text-white/80 transition-colors"
                    disabled={loading}
                    type="button"
                  >
                    {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                  </motion.button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </DialogContent>
      </Dialog>
    </div>
  );
}