import { useState } from "react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { Separator } from "@/components/ui/separator";

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
        <DialogContent className="sm:max-w-md p-0 bg-transparent border-0 shadow-none overflow-hidden" onOpenAutoFocus={(e) => e.preventDefault()}>
          <div className="relative">
            <GlassCard variant="bubble" glow className="w-full p-8 auth-modal-card">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                {/* Logo */}
                <div className="text-center">
                  <motion.div
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className="flex justify-center mb-4"
                  >
                    <img src="/arc-logo-ui.png" alt="ArcAI" className="h-16 w-16" />
                  </motion.div>
                  <h1 className="text-2xl font-bold text-foreground mb-2">Welcome to ArcAI</h1>
                  <p className="text-muted-foreground">{isLogin ? "Sign in to continue" : "Create your account"}</p>
                </div>

                <form
                  onSubmit={onSubmit}
                  autoComplete={isLogin ? "on" : "on"}
                  className="space-y-4"
                >
                  {/* Email */}
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
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
                        className="pl-10"
                        disabled={loading}
                        autoFocus={false}
                        required
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10"
                        disabled={loading}
                        autoComplete={isLogin ? "current-password" : "new-password"}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <GlassButton variant="glow" type="submit" disabled={loading} className="w-full">
                    {loading ? "Loading..." : isLogin ? "Sign In" : "Sign Up"}
                  </GlassButton>
                </form>

                {/* Divider */}
                <div className="flex items-center gap-4">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground">OR</span>
                  <Separator className="flex-1" />
                </div>

                {/* Google Sign In */}
                <GlassButton 
                  variant="ghost" 
                  onClick={handleGoogleAuth} 
                  disabled={loading} 
                  className="w-full border border-white/20"
                  type="button"
                >
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
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

                {/* Toggle Auth Mode */}
                <div className="text-center">
                  <button
                    onClick={() => setIsLogin(!isLogin)}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    disabled={loading}
                    type="button"
                  >
                    {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                  </button>
                </div>
              </motion.div>
            </GlassCard>
          </div>
        </DialogContent>
      </Dialog>
      
      <style>{`
        /* Dialog backdrop blur */
        [data-radix-dialog-overlay] {
          backdrop-filter: blur(12px) !important;
          -webkit-backdrop-filter: blur(12px) !important;
          background: rgba(0, 0, 0, 0.6) !important;
        }
        
        /* Make the auth modal highly visible with dark background and white text */
        .auth-modal-card {
          background: rgba(0, 0, 0, 0.85) !important;
          color: #fff !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5) !important;
          backdrop-filter: blur(24px) saturate(150%) !important;
          -webkit-backdrop-filter: blur(24px) saturate(150%) !important;
        }
        
        .auth-modal-card *,
        .auth-modal-card h1,
        .auth-modal-card p,
        .auth-modal-card label,
        .auth-modal-card span,
        .auth-modal-card div {
          color: #fff !important;
        }
        
        .auth-modal-card input {
          background: rgba(255, 255, 255, 0.1) !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
          border-radius: 0.375rem !important;
          color: #fff !important;
        }
        
        .auth-modal-card input::placeholder {
          color: rgba(255, 255, 255, 0.5) !important;
        }
        
        .auth-modal-card button {
          color: #fff !important;
        }
        
        .auth-modal-card svg {
          color: #fff !important;
        }
      `}</style>
    </div>
  );
}