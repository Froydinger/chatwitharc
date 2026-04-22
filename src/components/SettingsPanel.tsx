import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  User,
  LogOut,
  AlertTriangle,
  Wifi,
  WifiOff,
  Cloud,
  CloudOff,
  Mic,
  Settings as SettingsIcon,
  Save,
  RotateCcw,
  Mail,
  Key,
  Download,
  Palette,
  Check,
  Brain,
  Stars,
  Image as ImageIcon,
  CreditCard,
  Lock,
  Cpu,
  type LucideIcon,
} from "lucide-react";
import { useAccentColor, AccentColor } from "@/hooks/useAccentColor";
import { lovable } from "@/integrations/lovable/index";
import { DeleteDataModal } from "@/components/DeleteDataModal";
import { useProfile } from "@/hooks/useProfile";
import { useArcStore } from "@/store/useArcStore";
import { useAuth } from "@/hooks/useAuth";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStarfieldStore } from "@/store/useStarfieldStore";
import { useAdminSettings } from "@/hooks/useAdminSettings";
import { staggerContainerVariants, staggerItemVariants } from "@/utils/animations";
import { VoiceSelector } from "@/components/VoiceSelector";
import { useModelStore, type ModelFamily } from "@/store/useModelStore";
import {
  useImageGenStore,
  IMAGE_MODEL_OPTIONS,
  IMAGE_ASPECT_OPTIONS,
  type ImageModelId,
  type ImageAspectRatio,
} from "@/store/useImageGenStore";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Shield, Crown, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { LocalAIPanel } from "@/components/LocalAIPanel";
import { CorporateModePanel } from "@/components/CorporateModePanel";
import { cn } from "@/lib/utils";

type SectionId = "account" | "appearance" | "ai" | "privacy" | "plan";

const SECTIONS: { id: SectionId; label: string; icon: LucideIcon; subtitle: string }[] = [
  { id: "account",    label: "Account",       icon: User,        subtitle: "Identity & login" },
  { id: "appearance", label: "Appearance",    icon: Palette,     subtitle: "Look & feel" },
  { id: "ai",         label: "AI & Models",   icon: Sparkles,    subtitle: "Models, voice, images" },
  { id: "privacy",    label: "Privacy & Data",icon: Lock,        subtitle: "Memory, exports, sync" },
  { id: "plan",       label: "Plan & Usage",  icon: CreditCard,  subtitle: "Subscription" },
];

function ModelFamilySelector({ isSubscribed }: { isSubscribed: boolean }) {
  const { modelFamily, setModelFamily } = useModelStore();
  const { updateProfile } = useProfile();
  const { toast } = useToast();

  const handleChange = async (family: ModelFamily) => {
    if (!isSubscribed) return;
    setModelFamily(family);
    try {
      await updateProfile({ preferred_model: family === 'gpt' ? 'openai/gpt-5-mini' : 'google/gemini-3-flash-preview' });
    } catch {
      toast({ title: "Failed to save preference", variant: "destructive" });
    }
  };

  return (
    <GlassCard variant="bubble" className={`p-6 space-y-4 ${!isSubscribed ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-primary-glow" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">AI Model</h3>
            {!isSubscribed && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary">PRO</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Choose between GPT and Gemini</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {([
          { id: 'gemini' as ModelFamily, label: 'Gemini', desc: 'Google AI' },
          { id: 'gpt' as ModelFamily, label: 'GPT', desc: 'OpenAI' },
        ]).map((opt) => (
          <button
            key={opt.id}
            onClick={() => handleChange(opt.id)}
            disabled={!isSubscribed}
            className={`relative p-4 rounded-xl border transition-all text-left ${
              modelFamily === opt.id
                ? 'border-primary bg-primary/10 shadow-[0_0_15px_hsl(var(--primary)/0.15)]'
                : 'border-border/40 bg-muted/20 hover:border-border/60'
            } ${!isSubscribed ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className="font-semibold text-foreground">{opt.label}</div>
            <div className="text-xs text-muted-foreground">{opt.desc}</div>
            {modelFamily === opt.id && (
              <Check className="absolute top-3 right-3 w-4 h-4 text-primary" />
            )}
          </button>
        ))}
      </div>
    </GlassCard>
  );
}

function ImageDefaultsCard() {
  const { model, aspectRatio, setModel, setAspectRatio } = useImageGenStore();
  return (
    <GlassCard variant="bubble" className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <ImageIcon className="h-5 w-5 text-primary-glow" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">Image Defaults</h3>
          <p className="text-sm text-muted-foreground">Used when generating images</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-foreground font-medium text-sm">Model</Label>
        <div className="grid gap-2">
          {IMAGE_MODEL_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setModel(opt.id as ImageModelId)}
              className={cn(
                "relative p-3 rounded-xl border text-left transition-all",
                model === opt.id
                  ? "border-primary bg-primary/10 shadow-[0_0_15px_hsl(var(--primary)/0.15)]"
                  : "border-border/40 bg-muted/20 hover:border-border/60"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-foreground text-sm">{opt.label}</div>
                {opt.pro && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary">PRO</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">{opt.blurb}</div>
              {model === opt.id && (
                <Check className="absolute top-3 right-3 w-4 h-4 text-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-foreground font-medium text-sm">Aspect Ratio</Label>
        <div className="grid grid-cols-2 gap-2">
          {IMAGE_ASPECT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setAspectRatio(opt.id as ImageAspectRatio)}
              className={cn(
                "px-3 py-2 rounded-lg border text-xs font-medium transition-all",
                aspectRatio === opt.id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border/60"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

export function SettingsPanel() {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [section, setSection] = useState<SectionId>("account");
  const navigate = useNavigate();
  const {
    clearAllSessions,
    lastSyncAt,
    createNewSession,
    setRightPanelTab,
  } = useArcStore();
  const { user } = useAuth();
  const { profile, updateProfile, updating } = useProfile();
  const {
    isSubscribed,
    subscriptionEnd,
    openCheckout,
    openCustomerPortal,
    dailyMessagesUsed,
    dailyVoiceSessionsUsed,
    dailyImagesUsed,
    FREE_DAILY_MESSAGE_LIMIT,
    FREE_DAILY_VOICE_LIMIT,
    FREE_DAILY_IMAGE_LIMIT,
  } = useSubscription();
  const { toast } = useToast();
  const { accentColor, setAccentColor } = useAccentColor();
  const showStarfield = useStarfieldStore((s) => s.showStarfield);
  const setShowStarfield = useStarfieldStore((s) => s.setShowStarfield);
  const { isAdmin } = useAdminSettings();

  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isPasswordResetOpen, setIsPasswordResetOpen] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [displayNameDirty, setDisplayNameDirty] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!displayNameDirty) setDisplayNameDraft(profile?.display_name || "");
  }, [profile?.display_name, displayNameDirty]);

  const handleDataDeleted = () => {
    createNewSession();
    toast({ title: "Account Reset", description: "Starting fresh with a new session" });
  };

  const handleSaveDisplayName = async () => {
    try {
      await updateProfile({ display_name: displayNameDraft.trim() });
      setDisplayNameDirty(false);
    } catch {
      toast({ title: "Save failed", description: "Could not save your name. Try again.", variant: "destructive" });
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    if (!supabase || !isSupabaseConfigured) {
      toast({ title: "Upload unavailable", description: "Storage is not available.", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/avatar.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(fileName);
      await updateProfile({ avatar_url: publicUrl });
    } catch (error) {
      console.error("Error uploading avatar:", error);
      toast({ title: "Upload failed", description: "Failed to upload profile picture.", variant: "destructive" });
    } finally {
      setIsUploading(false);
      const input = document.getElementById("avatar-upload") as HTMLInputElement;
      if (input) input.value = "";
    }
  };

  const handleClearMessages = () => {
    clearAllSessions();
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
  };

  const handleSignOut = async () => {
    if (!supabase || !isSupabaseConfigured) {
      toast({ title: "Error", description: "Sign out is not available.", variant: "destructive" });
      return;
    }
    try {
      localStorage.removeItem('theme');
      localStorage.removeItem('followSystem');
      localStorage.removeItem('accentColor');
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      toast({ title: "Signed out", description: "You've been signed out successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to sign out", variant: "destructive" });
    }
  };

  const handlePasswordReset = async () => {
    if (!supabase || !isSupabaseConfigured) {
      toast({ title: "Error", description: "Password reset is not available.", variant: "destructive" });
      return;
    }
    if (!user?.email) {
      toast({ title: "Error", description: "No email address found", variant: "destructive" });
      return;
    }
    setIsResettingPassword(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: 'https://askarc.chat/',
      });
      if (error) throw error;
      toast({ title: "Password reset sent", description: "Check your email for instructions" });
      setIsPasswordResetOpen(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to send password reset", variant: "destructive" });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      clearAllSessions();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");
      await supabase.from("profiles").delete().eq("user_id", user.id);
      await supabase.from("chat_sessions").delete().eq("user_id", user.id);
      toast({ title: "Account deleted", description: "Your account has been permanently deleted." });
      await supabase.auth.signOut();
    } catch (error: any) {
      console.error("Delete account error:", error);
      toast({ title: "Deletion failed", description: "Failed to delete account.", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  type SyncStatus = { icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; color: string; text: string };
  const getSyncStatus = (): SyncStatus => {
    if (!user) return { icon: CloudOff, color: "text-muted-foreground", text: "Not signed in" };
    if (!isOnline) return { icon: WifiOff, color: "text-destructive", text: "Offline" };
    if (!lastSyncAt) return { icon: CloudOff, color: "text-muted-foreground", text: "Syncing..." };
    const timeSinceSync = Date.now() - lastSyncAt.getTime();
    if (timeSinceSync < 5000) return { icon: Cloud, color: "text-green-400", text: "Synced" };
    return { icon: Cloud, color: "text-primary-glow", text: "Auto-sync enabled" };
  };

  const { icon: SyncIcon, color: syncColor, text: syncText } = getSyncStatus();

  const colorOptions: { id: AccentColor; label: string; gradient: string }[] = [
    { id: "red",    label: "Red",    gradient: "linear-gradient(135deg, hsl(0,90%,48%), hsl(0,90%,58%))" },
    { id: "blue",   label: "Blue",   gradient: "linear-gradient(135deg, hsl(205,100%,48%), hsl(205,95%,58%))" },
    { id: "green",  label: "Green",  gradient: "linear-gradient(135deg, hsl(145,82%,35%), hsl(145,80%,45%))" },
    { id: "yellow", label: "Yellow", gradient: "linear-gradient(135deg, hsl(45,100%,48%), hsl(45,100%,58%))" },
    { id: "purple", label: "Purple", gradient: "linear-gradient(135deg, hsl(268,85%,52%), hsl(268,82%,62%))" },
    { id: "orange", label: "Orange", gradient: "linear-gradient(135deg, hsl(22,100%,50%), hsl(22,98%,60%))" },
    { id: "noir",   label: "Noir",   gradient: "linear-gradient(135deg, hsl(0,0%,95%), hsl(0,0%,70%))" },
  ];

  // ----- Section renderers -----

  const ProfileCard = (
    <GlassCard variant="bubble" className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <User className="h-5 w-5 text-primary-glow" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">Profile</h3>
          <p className="text-sm text-muted-foreground">Name & avatar</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full overflow-hidden bg-muted/30 border border-border/40 flex items-center justify-center">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="avatar" className="h-full w-full object-cover" />
            ) : (
              <User className="h-7 w-7 text-muted-foreground" />
            )}
          </div>
          <label
            htmlFor="avatar-upload"
            className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover:scale-105 transition shadow-md"
          >
            {isUploading ? (
              <div className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
          </label>
          <input
            id="avatar-upload"
            type="file"
            accept="image/*"
            onChange={handleAvatarUpload}
            className="hidden"
            disabled={isUploading}
          />
        </div>

        <div className="flex-1 space-y-2">
          <Input
            value={displayNameDraft}
            onChange={(e) => { setDisplayNameDraft(e.target.value); setDisplayNameDirty(true); }}
            placeholder="Your name"
            className="glass border-glass-border"
            disabled={updating}
          />
          {displayNameDirty && (
            <div className="flex items-center gap-2">
              <GlassButton variant="ghost" size="sm" onClick={handleSaveDisplayName} disabled={updating}>
                <Save className="w-3 h-3 mr-1" /> Save
              </GlassButton>
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={() => { setDisplayNameDraft(profile?.display_name || ""); setDisplayNameDirty(false); }}
                disabled={updating}
              >
                Reset
              </GlassButton>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );

  const EmailCard = (
    <GlassCard variant="bubble" className="p-6 space-y-3">
      <div className="flex items-center gap-3">
        <Mail className="h-5 w-5 text-primary-glow" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">Email</h3>
          <p className="text-sm text-muted-foreground">Your account email</p>
        </div>
      </div>
      <div className="text-sm text-muted-foreground font-mono bg-glass/30 px-3 py-2 rounded-md break-all">
        {user?.email || "No email"}
      </div>
    </GlassCard>
  );

  const ConnectedAccountsCard = (
    <GlassCard variant="bubble" className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Key className="h-5 w-5 text-primary-glow" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">Connected Accounts</h3>
          <p className="text-sm text-muted-foreground">Manage login methods</p>
        </div>
      </div>

      <div className="space-y-3">
        {user?.app_metadata?.providers?.includes("google") ? (
          <div className="flex items-center justify-between p-3 bg-glass/30 rounded-md">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <div>
                <div className="text-sm font-medium">Google Account</div>
                <div className="text-xs text-muted-foreground">Connected</div>
              </div>
            </div>
            <div className="w-2 h-2 bg-green-500 rounded-full" />
          </div>
        ) : (
          <div className="flex items-center justify-between p-3 bg-glass/30 rounded-md">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <div>
                <div className="text-sm font-medium">Google Account</div>
                <div className="text-xs text-muted-foreground">Not connected</div>
              </div>
            </div>
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={async () => {
                const result = await lovable.auth.signInWithOAuth("google", {
                  redirect_uri: window.location.origin + "/dashboard/settings",
                });
                if (result.error) {
                  toast({ title: "Failed to connect Google", description: String(result.error), variant: "destructive" });
                }
              }}
            >
              Connect
            </GlassButton>
          </div>
        )}
        <div className="flex items-center justify-between p-3 bg-glass/30 rounded-md">
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5" />
            <div>
              <div className="text-sm font-medium">Email & Password</div>
              <div className="text-xs text-muted-foreground">Primary login method</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={isPasswordResetOpen} onOpenChange={setIsPasswordResetOpen}>
              <DialogTrigger asChild>
                <GlassButton variant="ghost" size="sm">
                  <Key className="w-3 h-3 mr-1" /> Reset
                </GlassButton>
              </DialogTrigger>
              <DialogContent className="glass border-glass-border">
                <DialogHeader>
                  <DialogTitle>Reset Password</DialogTitle>
                  <DialogDescription>
                    {user?.app_metadata?.providers?.includes("google")
                      ? "This will add email/password login to your account. Your Google login will remain active."
                      : "We'll send a password reset link to your email address."}
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <div className="text-sm text-muted-foreground">
                    Email: <span className="font-mono">{user?.email}</span>
                  </div>
                </div>
                <DialogFooter>
                  <GlassButton variant="ghost" onClick={() => setIsPasswordResetOpen(false)} disabled={isResettingPassword}>
                    Cancel
                  </GlassButton>
                  <GlassButton onClick={handlePasswordReset} disabled={isResettingPassword}>
                    {isResettingPassword ? "Sending..." : "Send Reset Link"}
                  </GlassButton>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <div className="w-2 h-2 bg-green-500 rounded-full" />
          </div>
        </div>
      </div>
    </GlassCard>
  );

  const DangerZoneCard = (
    <GlassCard variant="bubble" className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">Sign Out & Delete</h3>
          <p className="text-sm text-muted-foreground">Account exit options</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-foreground">Sign Out</h4>
          <p className="text-xs text-muted-foreground">Sign out of this device</p>
        </div>
        <GlassButton variant="ghost" size="sm" onClick={handleSignOut} className="text-destructive hover:text-destructive">
          <LogOut className="h-4 w-4 mr-1" /> Sign Out
        </GlassButton>
      </div>

      <div className="h-px bg-border" />

      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-foreground">Delete Account</h4>
          <p className="text-xs text-muted-foreground">Permanent and irreversible</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <GlassButton variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={isDeleting}>
              <Trash2 className="h-4 w-4 mr-1" />
              {isDeleting ? "Deleting..." : "Delete"}
            </GlassButton>
          </AlertDialogTrigger>
          <AlertDialogContent className="glass border-destructive/20">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" /> Are you absolutely sure?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete your account and remove all your data from our servers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="glass border-glass-border">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAccount}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete Account"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </GlassCard>
  );

  const AdminCard = isAdmin ? (
    <GlassCard variant="bubble" className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-4 w-4 text-primary" />
            <h3 className="font-medium text-foreground">Admin Panel</h3>
          </div>
          <p className="text-xs text-muted-foreground">System settings and configuration</p>
        </div>
        <GlassButton variant="ghost" size="sm" onClick={() => navigate('/admin')} className="text-primary hover:text-primary">
          <SettingsIcon className="h-4 w-4 mr-1" /> Open
        </GlassButton>
      </div>
    </GlassCard>
  ) : null;

  const AccentColorCard = (
    <GlassCard variant="bubble" className="p-6 space-y-4 lg:col-span-2">
      <div className="flex items-center gap-3">
        <Palette className="h-5 w-5 text-primary-glow" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">Accent Color</h3>
          <p className="text-sm text-muted-foreground">Personalize your app accent</p>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-3">
        {colorOptions.map((opt) => {
          const isActive = accentColor === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => setAccentColor(opt.id)}
              className={`aspect-square rounded-xl relative transition-all ${
                isActive
                  ? "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110"
                  : "hover:scale-105"
              }`}
              style={{ background: opt.gradient }}
              aria-label={`Select ${opt.label} accent color`}
            >
              {isActive && <Check className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow-lg" />}
            </button>
          );
        })}
      </div>
    </GlassCard>
  );

  const StarfieldCard = (
    <GlassCard variant="bubble" className="p-6 space-y-3">
      <div className="flex items-center gap-3">
        <Stars className="h-5 w-5 text-primary-glow" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">Background Stars</h3>
          <p className="text-sm text-muted-foreground">Animated starfield effect</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-sm text-foreground">Show stars</Label>
        <Switch checked={showStarfield} onCheckedChange={setShowStarfield} />
      </div>
    </GlassCard>
  );

  const VoiceCard = (
    <GlassCard variant="bubble" className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Mic className="h-5 w-5 text-primary-glow" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">Voice Mode</h3>
          <p className="text-sm text-muted-foreground">Choose your assistant's voice</p>
        </div>
      </div>
      <VoiceSelector />
    </GlassCard>
  );

  const MemoryCard = (
    <GlassCard variant="bubble" className="p-6 space-y-3">
      <div className="flex items-center gap-3">
        <Brain className="h-5 w-5 text-primary-glow" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">Memory</h3>
          <p className="text-sm text-muted-foreground">View & manage what Arc remembers</p>
        </div>
      </div>
      <GlassButton
        className="w-full h-11 rounded-full outline-shimmer"
        onClick={() => navigate('/dashboard?tab=memories')}
      >
        <Brain className="h-4 w-4 mr-2" /> Open Arc's Brain
      </GlassButton>
    </GlassCard>
  );

  const ExportCard = (
    <GlassCard variant="bubble" className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Download className="h-5 w-5 text-primary-glow" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">Export & Clear</h3>
          <p className="text-sm text-muted-foreground">Download or wipe your chats</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-foreground">Export Chats</h4>
          <p className="text-xs text-muted-foreground">HTML, TXT, JSON</p>
        </div>
        <GlassButton variant="ghost" size="sm" onClick={() => setRightPanelTab("export")}>
          <Download className="h-4 w-4 mr-1" /> Export
        </GlassButton>
      </div>

      <div className="h-px bg-border" />

      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-foreground">Clear Chat History</h4>
          <p className="text-xs text-muted-foreground">Remove all conversations</p>
        </div>
        <GlassButton variant="ghost" size="sm" onClick={handleClearMessages} className="text-destructive hover:text-destructive">
          Clear All
        </GlassButton>
      </div>
    </GlassCard>
  );

  const SyncCard = (
    <GlassCard variant="bubble" className="p-6 space-y-3">
      <div className="flex items-center gap-3">
        <Wifi className="h-5 w-5 text-primary-glow" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">Sync Status</h3>
          <p className="text-sm text-muted-foreground">Cloud synchronization</p>
        </div>
      </div>
      <div className="flex items-center gap-2 glass px-3 py-2 rounded-full text-sm w-fit">
        <SyncIcon className={`h-4 w-4 ${syncColor}`} />
        <span className={syncColor}>{syncText}</span>
      </div>
    </GlassCard>
  );

  const PlanCard = (
    <GlassCard variant="bubble" className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Crown className="h-5 w-5 text-primary-glow" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">Your Plan</h3>
          <p className="text-sm text-muted-foreground">
            {isSubscribed ? "You're on ArcAI Pro" : "You're on the Free plan"}
          </p>
        </div>
      </div>

      {isSubscribed ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-primary/10 border border-primary/20 w-fit">
            <Crown className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Pro Plan — Active</span>
          </div>
          {subscriptionEnd && (
            <p className="text-xs text-muted-foreground">
              Next billing date: {new Date(subscriptionEnd).toLocaleDateString()}
            </p>
          )}
          <GlassButton variant="ghost" size="sm" onClick={() => openCustomerPortal()} className="gap-1.5">
            <SettingsIcon className="h-4 w-4" /> Manage Subscription
          </GlassButton>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Free plan includes:</p>
            <ul className="space-y-1 ml-4 list-disc">
              <li>{FREE_DAILY_MESSAGE_LIMIT} messages per day</li>
              <li>{FREE_DAILY_VOICE_LIMIT} voice sessions per day</li>
              <li>{FREE_DAILY_IMAGE_LIMIT} image generations per day</li>
            </ul>
          </div>
          <div className="space-y-2 text-sm text-foreground">
            <p className="font-medium">Pro unlocks:</p>
            <ul className="space-y-1 ml-4 list-disc text-muted-foreground">
              <li>Unlimited messages, voice & images</li>
              <li>Model selection</li>
              <li>Music player</li>
            </ul>
          </div>
          <GlassButton onClick={() => openCheckout()} className="gap-1.5 w-full justify-center">
            <Sparkles className="h-4 w-4" /> Upgrade to Pro
          </GlassButton>
        </div>
      )}
    </GlassCard>
  );

  const UsageCard = !isSubscribed ? (
    <GlassCard variant="bubble" className="p-6 space-y-3">
      <div className="flex items-center gap-3">
        <Stars className="h-5 w-5 text-primary-glow" />
        <h3 className="text-lg font-semibold text-foreground">Today's Usage</h3>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Messages</span>
          <span className="font-mono text-foreground">{dailyMessagesUsed} / {FREE_DAILY_MESSAGE_LIMIT}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Voice Sessions</span>
          <span className="font-mono text-foreground">{dailyVoiceSessionsUsed} / {FREE_DAILY_VOICE_LIMIT}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Image Generations</span>
          <span className="font-mono text-foreground">{dailyImagesUsed} / {FREE_DAILY_IMAGE_LIMIT}</span>
        </div>
      </div>
    </GlassCard>
  ) : null;

  const renderSection = () => {
    switch (section) {
      case "account":
        return (
          <>
            {ProfileCard}
            {EmailCard}
            {ConnectedAccountsCard}
            {DangerZoneCard}
            {AdminCard}
          </>
        );
      case "appearance":
        return (
          <>
            {AccentColorCard}
            {StarfieldCard}
          </>
        );
      case "ai":
        return (
          <>
            <ModelFamilySelector isSubscribed={isSubscribed} />
            {VoiceCard}
            <ImageDefaultsCard />
            <LocalAIPanel />
          </>
        );
      case "privacy":
        return (
          <>
            <CorporateModePanel />
            {MemoryCard}
            {ExportCard}
            {SyncCard}
          </>
        );
      case "plan":
        return (
          <>
            {PlanCard}
            {UsageCard}
          </>
        );
    }
  };

  const Footer = (
    <div className="pt-6 border-t border-border/30">
      <div className="text-center space-y-2 text-sm text-muted-foreground">
        <p className="text-xs opacity-60">Web Version v4.1.4</p>
        <div className="flex items-center justify-center gap-4">
          <a href="/support" className="hover:text-primary-glow transition-colors underline">Support</a>
          <span>•</span>
          <a
            href="https://winthenight.productions"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary-glow transition-colors underline"
          >
            Win the Night Productions
          </a>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-7xl mx-auto pb-20 pt-2 h-full overflow-y-auto scrollbar-hide">
      {/* Mobile pill bar */}
      <div className="lg:hidden sticky top-0 z-10 -mx-1 px-1 pt-1 pb-3 bg-background/40 backdrop-blur-md">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide snap-x snap-mandatory">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={cn(
                  "snap-start shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border",
                  active
                    ? "bg-primary/15 text-foreground border-primary/40 shadow-[0_0_20px_hsl(var(--primary)/0.25)]"
                    : "bg-muted/20 text-muted-foreground border-border/40 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-8 px-4">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex flex-col sticky top-2 self-start h-[calc(100vh-6rem)]">
          <div className="px-2 mb-4">
            <h1 className="text-xl font-semibold text-foreground">Settings</h1>
            <p className="text-xs text-muted-foreground">Customize your ArcAI experience</p>
          </div>
          <nav className="flex-1 flex flex-col gap-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all border",
                    active
                      ? "bg-primary/10 border-primary/40 text-foreground shadow-[0_0_20px_hsl(var(--primary)/0.18)]"
                      : "bg-transparent border-transparent text-muted-foreground hover:bg-muted/20 hover:text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center",
                      active ? "bg-primary/20 text-primary" : "bg-muted/30"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{s.label}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">{s.subtitle}</span>
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="mt-4 text-xs text-muted-foreground/80 px-2 space-y-2">
            <div className="opacity-60">Web Version v4.1.4</div>
            <div className="flex flex-wrap items-center gap-2">
              <a href="/support" className="hover:text-primary-glow underline">Support</a>
              <span>•</span>
              <a
                href="https://winthenight.productions"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary-glow underline"
              >
                WTN
              </a>
            </div>
          </div>
        </aside>

        {/* Content */}
        <main>
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              variants={staggerContainerVariants}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, y: 4 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-6"
            >
              {renderSection()}
            </motion.div>
          </AnimatePresence>

          <div className="lg:hidden mt-8">{Footer}</div>
        </main>
      </div>

      <DeleteDataModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onDeleted={handleDataDeleted}
      />
    </div>
  );
}
