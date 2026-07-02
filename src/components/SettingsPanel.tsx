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
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAccentColor, AccentColor } from "@/hooks/useAccentColor";
import { useAccentStore } from "@/store/useAccentStore";
import { AVAILABLE_FONTS, getStoredCustomFont, setStoredCustomFont, type CustomFontId } from "@/hooks/useCustomFont";

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

import { useAdminSettings } from "@/hooks/useAdminSettings";
import { staggerContainerVariants, staggerItemVariants } from "@/utils/animations";
import { VoiceSelector } from "@/components/VoiceSelector";

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
import { Shield, Crown, Sparkles, Activity, ExternalLink } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSubscription } from "@/hooks/useSubscription";
import { LocalAIPanel } from "@/components/LocalAIPanel";
import { CorporateModePanel } from "@/components/CorporateModePanel";
import { SharedLinksCard } from "@/components/SharedLinksCard";
import { PushNotificationsCard } from "@/components/PushNotificationsCard";
import { cn } from "@/lib/utils";
import { isMobileLocalDevice } from "@/utils/mobileLocal";
import { PersonasManager } from "@/components/PersonasManager";
import { useStarfieldStore } from "@/store/useStarfieldStore";

type SectionId = "account" | "appearance" | "ai" | "privacy" | "plan";

const SECTIONS: { id: SectionId; label: string; icon: LucideIcon; subtitle: string }[] = [
  { id: "account",    label: "Account",       icon: User,        subtitle: "Identity & login" },
  { id: "appearance", label: "Appearance",    icon: Palette,     subtitle: "Look & feel" },
  { id: "ai",         label: "AI & Models",   icon: Sparkles,    subtitle: "Models, voice, images" },
  { id: "privacy",    label: "Privacy, Sharing, & Data",icon: Lock,        subtitle: "Memory, sharing, exports" },
  { id: "plan",       label: "Plan & Usage",  icon: CreditCard,  subtitle: "Subscription" },
];

// ---------- Shared tile primitives (matches Arc Local look) ----------

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <GlassCard className={cn("p-5 space-y-4", className)}>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-primary/15 border border-primary/30">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-2">{children}</div>
    </GlassCard>
  );
}

function Tile({
  icon: Icon,
  title,
  description,
  right,
  active = false,
  onClick,
  className,
  children,
}: {
  icon?: LucideIcon;
  title?: React.ReactNode;
  description?: React.ReactNode;
  right?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-xl border transition-colors",
        active ? "bg-primary/10 border-primary/40" : "bg-muted/20 border-border/40",
        onClick && "hover:bg-muted/30 cursor-pointer",
        className
      )}
    >
      {(Icon || title || description || right) && (
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="p-1.5 rounded-lg bg-primary/15 border border-primary/30 shrink-0">
              <Icon className="h-4 w-4 text-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {title && <div className="text-sm font-medium text-foreground">{title}</div>}
            {description && <div className="text-[11px] text-muted-foreground mt-0.5">{description}</div>}
          </div>
          {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
        </div>
      )}
      {children && <div className={cn(Icon || title || description || right ? "mt-3" : "")}>{children}</div>}
    </Comp>
  );
}


function ImageDefaultsCard() {
  const { model, aspectRatio, setModel, setAspectRatio } = useImageGenStore();
  return (
    <SectionCard icon={ImageIcon} title="Image Defaults" subtitle="Used when generating images">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground px-1 pt-1">Model</div>
      {IMAGE_MODEL_OPTIONS.map((opt) => (
        <Tile
          key={opt.id}
          title={
            <div className="flex items-center gap-2">
              {opt.label}
              {opt.pro && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">Pro</span>
              )}
            </div>
          }
          description={opt.blurb}
          active={model === opt.id}
          onClick={() => setModel(opt.id as ImageModelId)}
          right={model === opt.id ? <Check className="h-4 w-4 text-primary" /> : null}
        />
      ))}

      <div className="text-[11px] uppercase tracking-wider text-muted-foreground px-1 pt-3">Aspect Ratio</div>
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
    </SectionCard>
  );
}

export function SettingsPanel() {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [section, setSection] = useState<SectionId>("account");
  const [searchParams] = useSearchParams();
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
    hasBoost,
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
  const themeMode = useAccentStore((s) => s.themeMode);




  const { isAdmin } = useAdminSettings();
  const isMobileLocal = isMobileLocalDevice();

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
    const sectionParam = searchParams.get("section") as SectionId | null;
    if (sectionParam && SECTIONS.some((s) => s.id === sectionParam)) {
      setSection(sectionParam);
    }
  }, [searchParams]);

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
      // Reset theme to follow system on sign out
      localStorage.removeItem('themeMode');
      useAccentStore.getState().setThemeMode('system');
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

  const allColorOptions: { id: AccentColor; label: string; gradient: string; adminOnly?: boolean }[] = [
    { id: "red",    label: "Red",    gradient: "linear-gradient(135deg, hsl(0,90%,48%), hsl(0,90%,58%))" },
    { id: "blue",   label: "Blue",   gradient: "linear-gradient(135deg, hsl(205,100%,48%), hsl(205,95%,58%))" },
    { id: "green",  label: "Green",  gradient: "linear-gradient(135deg, hsl(145,82%,35%), hsl(145,80%,45%))" },
    { id: "yellow", label: "Yellow", gradient: "linear-gradient(135deg, hsl(45,100%,48%), hsl(45,100%,58%))" },
    { id: "purple", label: "Purple", gradient: "linear-gradient(135deg, hsl(268,85%,52%), hsl(268,82%,62%))" },
    { id: "orange", label: "Orange", gradient: "linear-gradient(135deg, hsl(22,100%,50%), hsl(22,98%,60%))" },
    { id: "noir",   label: "Noir",   gradient: "linear-gradient(135deg, hsl(0,0%,4%), hsl(0,0%,18%))" },
    { id: "gold",   label: "Gold",   gradient: "linear-gradient(135deg, hsl(40,78%,42%), hsl(46,92%,64%) 50%, hsl(43,82%,48%))", adminOnly: true },
  ];
  const colorOptions = allColorOptions.filter((opt) => !opt.adminOnly || isAdmin);


  // ----- Section renderers -----

  const ProfileCard = (
    <SectionCard icon={User} title="Profile" subtitle="Name & avatar">
      <Tile>
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
      </Tile>
    </SectionCard>
  );

  const EmailCard = (
    <SectionCard icon={Mail} title="Email" subtitle="Your account email">
      <Tile
        icon={Mail}
        title={user?.email || "No email"}
        description="Used for sign-in and notifications"
      />
    </SectionCard>
  );

  const ConnectedAccountsCard = (
    <SectionCard icon={Key} title="Connected Accounts" subtitle="Manage login methods">
      {user?.app_metadata?.providers?.includes("google") ? (
        <Tile
          title="Google Account"
          description="Connected"
          right={<div className="w-2 h-2 bg-green-500 rounded-full" />}
        />
      ) : (
        <Tile
          title="Google Account"
          description="Not connected"
          right={
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={async () => {
                const result = await lovable.auth.signInWithOAuth("google", {
                  redirect_uri: window.location.origin + "/dashboard/settings",
                  extraParams: { prompt: "select_account" },
                });
                if (result.error) {
                  toast({ title: "Failed to connect Google", description: String(result.error), variant: "destructive" });
                }
              }}
            >
              Connect
            </GlassButton>
          }
        />
      )}
      <Tile
        icon={Mail}
        title="Email & Password"
        description="Primary login method"
        right={
          <>
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
          </>
        }
      />
    </SectionCard>
  );

  const DangerZoneCard = (
    <SectionCard icon={AlertTriangle} title="Sign Out & Delete" subtitle="Account exit options">
      <Tile
        icon={LogOut}
        title="Sign Out"
        description="Sign out of this device"
        right={
          <GlassButton variant="ghost" size="sm" onClick={handleSignOut} className="text-destructive hover:text-destructive">
            <LogOut className="h-4 w-4 mr-1" /> Sign Out
          </GlassButton>
        }
      />
      <Tile
        icon={Trash2}
        title="Delete Account"
        description="Permanent and irreversible"
        right={
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
        }
      />
    </SectionCard>
  );

  const AdminCard = isAdmin ? (
    <SectionCard icon={Shield} title="Admin Panel" subtitle="System settings and configuration">
      <Tile
        icon={SettingsIcon}
        title="Admin Console"
        description="Manage users, banners and system prompts"
        right={
          <GlassButton variant="ghost" size="sm" onClick={() => navigate('/admin')} className="text-primary hover:text-primary">
            Open
          </GlassButton>
        }
      />
    </SectionCard>
  ) : null;

  const AccentColorCard = (
    <SectionCard icon={Palette} title="Accent Color" subtitle="Personalize your app accent" className="lg:col-span-2">
      <Tile>
        <div className="grid grid-cols-7 gap-3">
          {colorOptions.map((opt) => {
            const isActive = accentColor === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setAccentColor(opt.id)}
                className={`aspect-square rounded-xl relative transition-all ${
                  opt.id === "noir" ? "accent-swatch-noir " : ""
                }${
                  isActive
                    ? "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110"
                    : "hover:scale-105"
                }`}
                style={opt.id === "noir" ? undefined : { background: opt.gradient }}
                aria-label={`Select ${opt.label} accent color`}
              >
                {isActive && <Check className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow-lg" />}
              </button>
            );
          })}
        </div>
      </Tile>
    </SectionCard>
  );

  const [customFont, setCustomFont] = useState<CustomFontId>(() => getStoredCustomFont());
  const showStarfield = useStarfieldStore((s) => s.showStarfield);
  const setShowStarfield = useStarfieldStore((s) => s.setShowStarfield);

  const StarfieldCard = (
    <SectionCard icon={Stars} title="Starfield" subtitle="Twinkling background stars" className="lg:col-span-2">
      <Tile
        icon={Stars}
        title="Show starfield"
        description="Off by default for a cleaner look and lower memory use."
        right={
          <Switch checked={showStarfield} onCheckedChange={setShowStarfield} aria-label="Toggle starfield" />
        }
      />
    </SectionCard>
  );
  const FontCard = (
    <SectionCard
      icon={Stars}
      title="Custom Font"
      subtitle={hasBoost ? "Pick a font for your whole app" : "Boost perk — pick a custom UI font"}
      className="lg:col-span-2"
    >
      {hasBoost ? (
        <Tile>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full">
            {AVAILABLE_FONTS.map((f) => {
              const isActive = customFont === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => { setCustomFont(f.id); setStoredCustomFont(f.id); }}
                  style={{ fontFamily: `'${f.id}', sans-serif` }}
                  className={`text-sm px-3 py-3 rounded-xl border transition-all text-left ${
                    isActive
                      ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/40"
                      : "border-border/40 bg-card/40 hover:bg-card/60 text-foreground/90"
                  }`}
                >
                  <div className="font-semibold leading-tight">{f.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">The quick brown fox</div>
                </button>
              );
            })}
          </div>
        </Tile>
      ) : (
        <Tile
          icon={Lock}
          title="Unlock Custom Fonts"
          description="Pick from 8 hand-picked fonts to make Arc feel like yours. Included with ArcAI Boost."
          right={
            <GlassButton variant="ghost" size="sm" onClick={openCheckout}>
              Upgrade
            </GlassButton>
          }
        />
      )}
    </SectionCard>
  );




  const VoiceCard = (
    <SectionCard icon={Mic} title="Voice Mode" subtitle="Choose your assistant's voice">
      <Tile>
        <VoiceSelector />
      </Tile>
    </SectionCard>
  );

  const MemoryCard = (
    <SectionCard icon={Brain} title="Memory" subtitle="View & manage what Arc remembers">
      <Tile
        icon={Brain}
        title="Arc's Brain"
        description="Open the full memory manager"
        onClick={() => navigate('/dashboard?tab=memories')}
        right={<span className="text-xs text-primary">Open →</span>}
      />
    </SectionCard>
  );

  const ExportCard = (
    <SectionCard icon={Download} title="Export & Clear" subtitle="Download or wipe your chats">
      <Tile
        icon={Download}
        title="Export Chats"
        description="HTML, TXT, JSON"
        right={
          <GlassButton variant="ghost" size="sm" onClick={() => setRightPanelTab("export")}>
            <Download className="h-4 w-4 mr-1" /> Export
          </GlassButton>
        }
      />
      <Tile
        icon={Trash2}
        title="Clear Chat History"
        description="Remove all conversations"
        right={
          <GlassButton variant="ghost" size="sm" onClick={handleClearMessages} className="text-destructive hover:text-destructive">
            Clear All
          </GlassButton>
        }
      />
    </SectionCard>
  );

  const SyncCard = (
    <SectionCard icon={Wifi} title="Sync Status" subtitle="Cloud synchronization">
      <Tile
        icon={SyncIcon as any}
        title={syncText}
        description={isOnline ? "Your chats save automatically" : "Reconnect to resume syncing"}
        right={<SyncIcon className={`h-4 w-4 ${syncColor}`} />}
      />
    </SectionCard>
  );

  const PlanCard = (
    <SectionCard
      icon={Crown}
      title="Your Plan"
      subtitle={hasBoost ? "ArcAI Boost — unlimited everything" : "Upgrade to unlock unlimited access"}
    >
      {hasBoost ? (
        <>
          <Tile
            icon={Sparkles}
            title="ArcAI Boost"
            description="Unlimited chats, voice, and image generations. Access to all premium models."
            right={<span className="text-xs font-semibold text-primary">ACTIVE</span>}
          />
          <Tile
            icon={CreditCard}
            title="Manage Billing"
            description="Update payment method, view invoices, or cancel"
            onClick={openCustomerPortal}
            right={<span className="text-xs text-primary">Open →</span>}
          />
        </>
      ) : (
        <>
          <Tile
            icon={Crown}
            title="Free Plan"
            description="Unlimited chats. 10 voice conversations per 30 days. 10 image generations per day."
          />
          <button
            onClick={openCheckout}
            className="w-full text-left rounded-2xl p-4 border border-primary/40 bg-gradient-to-br from-primary/20 to-primary/5 hover:from-primary/30 hover:to-primary/10 transition-all group"
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/25 text-primary flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">Upgrade to ArcAI Boost</span>
                  <span className="text-xs font-bold text-primary">$7/month</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Unlimited images, voice, premium models, Maestro's Studio & Arcana
                </p>
              </div>
              <span className="text-primary text-sm font-semibold group-hover:translate-x-0.5 transition-transform shrink-0">
                Upgrade →
              </span>
            </div>
          </button>
        </>
      )}
    </SectionCard>
  );

  const UsageCard = (
    <SectionCard icon={Stars} title="Today's Usage" subtitle={hasBoost ? "Unlimited with Boost" : "Image limit resets daily"}>
      <Tile
        title="Image Generations"
        right={
          hasBoost ? (
            <span className="font-mono text-primary text-sm">Unlimited</span>
          ) : (
            <span className="font-mono text-foreground text-sm">{dailyImagesUsed} / {FREE_DAILY_IMAGE_LIMIT}</span>
          )
        }
      />
    </SectionCard>
  );

  const renderSection = () => {
    switch (section) {
      case "account":
        return (
          <>
            {ProfileCard}
            {EmailCard}
            <PushNotificationsCard />
            {ConnectedAccountsCard}
            {DangerZoneCard}
            {AdminCard}
          </>
        );
      case "appearance":
        return (
          <>
            {AccentColorCard}
            {FontCard}
          </>
        );

      case "ai":
        return (
          <>
            <SectionCard icon={Stars} title="Custom Personas" subtitle="Create unique conversation styles">
              <PersonasManager />
            </SectionCard>
            {VoiceCard}
            <ImageDefaultsCard />
            <LocalAIPanel />
            <a
              href="https://froydinger.design/status"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-3 p-4 rounded-2xl border border-border/40 bg-card/40 backdrop-blur-md hover:bg-card/60 hover:border-primary/40 transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <Activity className="h-4 w-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-foreground">System Status</span>
                  <span className="text-xs text-muted-foreground truncate">
                    Check live status of Arc's AI & services
                  </span>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            </a>
          </>
        );
      case "privacy":
        return (
          <>
            {!isMobileLocal && <CorporateModePanel />}
            {MemoryCard}
            <SharedLinksCard />
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
        <p className="text-xs opacity-60">Web Version v4.2.0</p>
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
      {/* Mobile dropdown */}
      <div className="lg:hidden sticky top-0 z-20 -mx-1 px-1 pt-1 pb-3 bg-background/60 backdrop-blur-md">
        {(() => {
          const current = SECTIONS.find((s) => s.id === section)!;
          const CurrentIcon = current.icon;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "w-full inline-flex items-center justify-between gap-2 px-4 py-3 rounded-2xl text-sm font-medium transition-all border",
                    "bg-primary/10 text-foreground border-primary/40 shadow-[0_0_20px_hsl(var(--primary)/0.18)]"
                  )}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="h-7 w-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center shrink-0">
                      <CurrentIcon className="h-4 w-4" />
                    </span>
                    <span className="flex flex-col items-start min-w-0">
                      <span className="text-sm font-semibold truncate">{current.label}</span>
                      <span className="text-[11px] text-muted-foreground truncate">{current.subtitle}</span>
                    </span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={8}
                className="glass border-glass-border w-[calc(100vw-2rem)] max-w-[420px] p-1.5"
              >
                {SECTIONS.map((s) => {
                  const Icon = s.icon;
                  const active = section === s.id;
                  return (
                    <DropdownMenuItem
                      key={s.id}
                      onSelect={() => setSection(s.id)}
                      className={cn(
                        "flex items-center gap-3 px-2.5 py-2.5 rounded-lg cursor-pointer",
                        active && "bg-primary/10 text-foreground"
                      )}
                    >
                      <span
                        className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                          active ? "bg-primary/20 text-primary" : "bg-muted/30 text-muted-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate">{s.label}</span>
                        <span className="block text-[11px] text-muted-foreground truncate">{s.subtitle}</span>
                      </span>
                      {active && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })()}
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
            <div className="opacity-60">Web Version v4.2.0</div>
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
