import { useState } from "react";
import { motion } from "framer-motion";
import { GlassButton } from "@/components/ui/glass-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { Mail, Lock, Eye, EyeOff, ArrowLeft, User } from "lucide-react";
import { Separator } from "@/components/ui/separator";

type AuthMode = 'login' | 'signup' | 'forgot-password';

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleAuth = async () => {
    if (!supabase || !isSupabaseConfigured) {
      toast({
        title: "Error",
        description: "Authentication is not available. Please try again later.",
        variant: "destructive",
      });
      return;
    }

    if (!email || (mode !== 'forgot-password' && !password) || (mode === 'signup' && !name.trim())) {
      toast({
        title: "Error",
        description: mode === 'forgot-password' ? "Please enter your email" : "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      if (mode === 'forgot-password') {
        const redirectUrl = `${window.location.origin}/`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: redirectUrl,
        });
        if (error) throw error;
        toast({ 
          title: "Check your email", 
          description: "We've sent you a password reset link" 
        });
        setMode('login');
        setEmail("");
      } else if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: "Welcome back!", description: "You've been signed in successfully" });
      } else {
        const redirectUrl = `${window.location.origin}/`;
        const { error, data } = await supabase.auth.signUp({
          email,
          password,
          options: { 
            emailRedirectTo: redirectUrl,
            data: {
              display_name: name.trim(),
            }
          },
        });
        if (error) throw error;
        
        // Create/update profile with display name
        if (data.user) {
          await supabase.from('profiles').upsert({
            user_id: data.user.id,
            display_name: name.trim(),
          }, { onConflict: 'user_id' });
        }
        
        toast({ title: "Account created!", description: "Welcome to ArcAI!" });
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
    if (!supabase || !isSupabaseConfigured) {
      toast({
        title: "Error",
        description: "Authentication is not available. Please try again later.",
        variant: "destructive",
      });
      return;
    }

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

  const getTitle = () => {
    switch (mode) {
      case 'forgot-password': return 'Reset Password';
      case 'signup': return 'Create Account';
      default: return 'Welcome to ArcAI';
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case 'forgot-password': return "Enter your email and we'll send you a reset link";
      case 'signup': return 'Create your account';
      default: return 'Sign in to continue';
    }
  };

  const getButtonText = () => {
    if (loading) return 'Loading...';
    switch (mode) {
      case 'forgot-password': return 'Send Reset Link';
      case 'signup': return 'Sign Up';
      default: return 'Sign In';
    }
  };

  return (
    <div className="dark min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
      {/* Background Effects - Always Blue */}
      <div className="fixed inset-0 pointer-events-none">
        <motion.div
          animate={{
            background: [
              "radial-gradient(circle at 20% 50%, hsl(217 91% 60% / 0.1) 0%, transparent 50%)",
              "radial-gradient(circle at 80% 20%, hsl(217 91% 60% / 0.1) 0%, transparent 50%)",
              "radial-gradient(circle at 40% 80%, hsl(217 91% 60% / 0.1) 0%, transparent 50%)",
            ],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="w-full h-full"
        />
      </div>

      {/* Solid Black Card - no glass effects */}
      <div className="w-full max-w-md p-8 relative z-10 bg-black border border-white/10 rounded-2xl shadow-2xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Back button for forgot password */}
          {mode === 'forgot-password' && (
            <button
              onClick={() => setMode('login')}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
              type="button"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </button>
          )}

          {/* Logo */}
          <div className="text-center">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="flex justify-center mb-4"
            >
              <img src="/arc-logo-ui.png" alt="ArcAI" className="h-16 w-16" />
            </motion.div>
            <h1 className="text-2xl font-bold text-white mb-2">{getTitle()}</h1>
            <p className="text-gray-400">{getSubtitle()}</p>
          </div>

          <form
            onSubmit={onSubmit}
            autoComplete="on"
            className="space-y-4"
          >
            {/* Name - only for signup */}
            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="name" className="text-white">Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-white/70" />
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    placeholder="Enter your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10 bg-black border-white/20 text-white placeholder:text-white/50"
                    disabled={loading}
                    required
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-white/70" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete={mode === 'login' ? "username" : "email"}
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 bg-black border-white/20 text-white placeholder:text-white/50"
                  disabled={loading}
                  required
                />
              </div>
            </div>

            {/* Password - only show for login/signup */}
            {mode !== 'forgot-password' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-white">Password</Label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => setMode('forgot-password')}
                      className="text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-white/70" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 bg-black border-white/20 text-white placeholder:text-white/50"
                    disabled={loading}
                    autoComplete={mode === 'login' ? "current-password" : "new-password"}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-white/70 hover:text-white"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            <GlassButton variant="glow" type="submit" disabled={loading} className="w-full">
              {getButtonText()}
            </GlassButton>
          </form>

          {/* Only show social login and toggle for login/signup */}
          {mode !== 'forgot-password' && (
            <>
              {/* Divider */}
              <div className="flex items-center gap-4">
                <Separator className="flex-1 bg-white/10" />
                <span className="text-xs text-gray-400">OR</span>
                <Separator className="flex-1 bg-white/10" />
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
                  onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                  disabled={loading}
                  type="button"
                >
                  {mode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                </button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}