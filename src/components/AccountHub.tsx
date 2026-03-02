import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog as InnerDialog, DialogContent as InnerDialogContent,
  DialogDescription as InnerDialogDescription, DialogFooter as InnerDialogFooter,
  DialogHeader as InnerDialogHeader, DialogTitle as InnerDialogTitle,
  DialogTrigger as InnerDialogTrigger,
} from "@/components/ui/dialog";
import {
  ExternalLink, Heart, Crown, MessageSquare, Brain, Image,
  Sparkles, RefreshCw, Calendar, Loader2, User, Palette, Mic,
  Check, Shield, Settings, LogOut, Trash2, AlertTriangle,
  Mail, Key, Download, Cloud, CloudOff, WifiOff, Camera, Save, RotateCcw,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useSubscription } from "@/hooks/useSubscription";
import { useAccentColor, AccentColor } from "@/hooks/useAccentColor";
import { useAdminSettings } from "@/hooks/useAdminSettings";
import { useArcStore } from "@/store/useArcStore";
import { useModelStore, type ModelFamily } from "@/store/useModelStore";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { VoiceSelector } from "@/components/VoiceSelector";
import { GlassButton } from "@/components/ui/glass-button";
import { useNavigate } from "react-router-dom";

interface AccountHubProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UserStats {
  chats_week: number;
  chats_month: number;
  chats_year: number;
  memories: number;
  images_generated: number;
}

type HubTab = "overview" | "preferences" | "account";

const COLOR_OPTIONS = [
  { id: "red", label: "Red", gradient: "linear-gradient(135deg, hsl(0,85%,60%), hsl(0,85%,70%))" },
  { id: "blue", label: "Blue", gradient: "linear-gradient(135deg, hsl(200,95%,55%), hsl(200,90%,65%))" },
  { id: "green", label: "Green", gradient: "linear-gradient(135deg, hsl(142,76%,42%), hsl(142,76%,52%))" },
  { id: "yellow", label: "Yellow", gradient: "linear-gradient(135deg, hsl(48,85%,55%), hsl(48,85%,65%))" },
  { id: "purple", label: "Purple", gradient: "linear-gradient(135deg, hsl(270,75%,60%), hsl(270,75%,70%))" },
  { id: "orange", label: "Orange", gradient: "linear-gradient(135deg, hsl(25,90%,58%), hsl(25,90%,68%))" },
  { id: "noir", label: "Noir", gradient: "linear-gradient(135deg, hsl(0,0%,95%), hsl(0,0%,70%))" },
];

export function AccountHub({ isOpen, onClose }: AccountHubProps) {
  const { user } = useAuth();
  const { profile, updateProfile, updating } = useProfile();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { accentColor, setAccentColor } = useAccentColor();
  const { isAdmin } = useAdminSettings();
  const { clearAllSessions, createNewSession, lastSyncAt } = useArcStore();
  const { modelFamily, setModelFamily } = useModelStore();
  const subscription = useSubscription();
  const {
    isSubscribed, loading: subLoading,
    dailyMessagesUsed, dailyVoiceSessionsUsed,
    canSendMessage, canUseVoice,
    remainingMessages, remainingVoiceSessions,
    openCheckout, openCustomerPortal,
    FREE_DAILY_MESSAGE_LIMIT, FREE_DAILY_VOICE_LIMIT,
  } = subscription;

  const [activeTab, setActiveTab] = useState<HubTab>("overview");
  const [stats, setStats] = useState<UserStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [funFact, setFunFact] = useState<string | null>(null);
  const [funFactLoading, setFunFactLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  // Profile editing
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [displayNameDirty, setDisplayNameDirty] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Account management
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPasswordResetOpen, setIsPasswordResetOpen] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Keep display name in sync
  useEffect(() => {
    if (!displayNameDirty) setDisplayNameDraft(profile?.display_name || "");
  }, [profile?.display_name, displayNameDirty]);

  // Online status
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const fetchStats = useCallback(async () => {
    if (!supabase || !user) return;
    setStatsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("user-stats");
      if (!error && data) setStats(data);
    } catch { /* ignore */ }
    setStatsLoading(false);
  }, [user]);

  const fetchFunFact = useCallback(async () => {
    if (!supabase || !user) return;
    setFunFactLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-fun-fact");
      if (!error && data?.fun_fact) setFunFact(data.fun_fact);
    } catch { /* ignore */ }
    setFunFactLoading(false);
  }, [user]);

  useEffect(() => {
    if (isOpen && user) {
      fetchStats();
      if (!funFact) fetchFunFact();
    }
  }, [isOpen, user]);

  const handleSaveDisplayName = async () => {
    try {
      await updateProfile({ display_name: displayNameDraft.trim() });
      setDisplayNameDirty(false);
      toast({ title: "Name saved" });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user || !supabase || !isSupabaseConfigured) return;
    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/avatar.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(fileName);
      await updateProfile({ avatar_url: publicUrl });
      toast({ title: "Photo updated" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    try {
      localStorage.removeItem('theme');
      localStorage.removeItem('followSystem');
      localStorage.removeItem('accentColor');
      await supabase.auth.signOut();
      toast({ title: "Signed out" });
      onClose();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handlePasswordReset = async () => {
    if (!supabase || !user?.email) return;
    setIsResettingPassword(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/`,
      });
      if (error) throw error;
      toast({ title: "Password reset sent", description: "Check your email" });
      setIsPasswordResetOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!supabase) return;
    setIsDeleting(true);
    try {
      clearAllSessions();
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) throw new Error("No user found");
      await supabase.from("profiles").delete().eq("user_id", u.id);
      await supabase.from("chat_sessions").delete().eq("user_id", u.id);
      toast({ title: "Account deleted" });
      await supabase.auth.signOut();
      onClose();
    } catch {
      toast({ title: "Deletion failed", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClearMessages = () => {
    clearAllSessions();
    toast({ title: "Chat history cleared" });
  };

  const handleModelChange = async (family: ModelFamily) => {
    if (!isSubscribed) return;
    setModelFamily(family);
    try {
      await updateProfile({ preferred_model: family === 'gpt' ? 'openai/gpt-5-mini' : 'google/gemini-3-flash-preview' });
    } catch {
      toast({ title: "Failed to save preference", variant: "destructive" });
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    await openCustomerPortal();
    setPortalLoading(false);
  };

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;


  const msgPercent = isSubscribed ? 0 : Math.min(100, (dailyMessagesUsed / FREE_DAILY_MESSAGE_LIMIT) * 100);
  const voicePercent = isSubscribed ? 0 : Math.min(100, (dailyVoiceSessionsUsed / FREE_DAILY_VOICE_LIMIT) * 100);

  const getSyncStatus = () => {
    if (!user) return { icon: CloudOff, color: "text-muted-foreground", text: "Not signed in" };
    if (!isOnline) return { icon: WifiOff, color: "text-destructive", text: "Offline" };
    if (!lastSyncAt) return { icon: CloudOff, color: "text-muted-foreground", text: "Syncing..." };
    const timeSinceSync = Date.now() - lastSyncAt.getTime();
    if (timeSinceSync < 5000) return { icon: Cloud, color: "text-green-400", text: "Synced" };
    return { icon: Cloud, color: "text-primary-glow", text: "Auto-sync enabled" };
  };
  const { icon: SyncIcon, color: syncColor, text: syncText } = getSyncStatus();

  const tabs: { id: HubTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "preferences", label: "Preferences" },
    { id: "account", label: "Account" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg sm:max-w-xl md:max-w-2xl glass border-primary/20 max-h-[90vh] p-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-3">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary text-xl">
              <User className="h-5 w-5" />
              Account Hub
            </DialogTitle>
          </DialogHeader>

          {/* Tab switcher */}
          <div className="flex gap-1 mt-4 p-1 rounded-full bg-muted/40 border border-border/30">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "flex-1 text-sm font-medium py-2 px-3 rounded-full transition-all",
                  activeTab === t.id
                    ? "bg-primary/20 text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable content */}
        <ScrollArea className="h-[calc(90vh-140px)] px-6 pb-6">
          <div className="space-y-4 pr-2">
            {/* ===================== OVERVIEW TAB ===================== */}
            {activeTab === "overview" && (
              <>
                {/* Profile Card */}
                <div className="flex items-center gap-3 p-4 rounded-xl glass border border-border/30">
                  <div className="relative group">
                    <div className="h-14 w-14 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                      {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="" className="h-full w-full object-cover rounded-full" />
                      ) : (
                        <User className="h-7 w-7 text-primary" />
                      )}
                    </div>
                    <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                      <Camera className="h-4 w-4 text-white" />
                      <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={isUploading} />
                    </label>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground truncate text-lg">
                      {profile?.display_name || user?.email?.split("@")[0] || "User"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                    {memberSince && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Calendar className="h-3 w-3" /> Member since {memberSince}
                      </p>
                    )}
                  </div>
                </div>

                {/* Subscription Card */}
                <div className="p-4 rounded-xl glass border border-border/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Crown className={cn("h-4 w-4", isSubscribed ? "text-primary" : "text-muted-foreground")} />
                      <span className="font-medium">
                        {subLoading ? "Loading..." : isSubscribed ? "ArcAI Pro" : "Free Plan"}
                      </span>
                    </div>
                    {isSubscribed ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs glass border-glass-border" onClick={handlePortal} disabled={portalLoading}>
                        {portalLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Manage"}
                      </Button>
                    ) : (
                      <Button
                        size="sm" className="h-7 text-xs noir-send-btn"
                        onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('open-upgrade-modal')); }}
                      >
                        Upgrade to Pro
                      </Button>
                    )}
                  </div>
                  {!isSubscribed && !subLoading && (
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Messages</span>
                          <span>{dailyMessagesUsed}/{FREE_DAILY_MESSAGE_LIMIT}</span>
                        </div>
                        <Progress value={msgPercent} className="h-1.5" />
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>🎙️ Voice Sessions</span>
                          <span>{dailyVoiceSessionsUsed}/{FREE_DAILY_VOICE_LIMIT}</span>
                        </div>
                        <Progress value={voicePercent} className="h-1.5" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-2">
                  {statsLoading ? (
                    <><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" /></>
                  ) : stats ? (
                    <>
                      <StatTile icon={<MessageSquare className="h-3.5 w-3.5" />} label="This Week" value={stats.chats_week} />
                      <StatTile icon={<MessageSquare className="h-3.5 w-3.5" />} label="This Month" value={stats.chats_month} />
                      <StatTile icon={<MessageSquare className="h-3.5 w-3.5" />} label="This Year" value={stats.chats_year} />
                    </>
                  ) : null}
                </div>
                {!statsLoading && stats && (
                  <div className="grid grid-cols-2 gap-2">
                    <StatTile icon={<Brain className="h-3.5 w-3.5" />} label="Memories" value={stats.memories} />
                    <StatTile icon={<Image className="h-3.5 w-3.5" />} label="Images" value={stats.images_generated} />
                  </div>
                )}

                {/* Fun Fact */}
                <div className="p-3 rounded-xl glass border border-primary/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-primary flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5" /> Fun Fact
                    </span>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={fetchFunFact} disabled={funFactLoading}>
                      <RefreshCw className={cn("h-3 w-3", funFactLoading && "animate-spin")} />
                    </Button>
                  </div>
                  {funFactLoading ? (
                    <Skeleton className="h-4 w-full" />
                  ) : (
                    <p className="text-sm text-foreground/90">{funFact || "Click refresh to generate a fun fact about you!"}</p>
                  )}
                </div>
              </>
            )}

            {/* ===================== PREFERENCES TAB ===================== */}
            {activeTab === "preferences" && (
              <>
                {/* Display Name */}
                <Section icon={<User className="h-4 w-4" />} title="Your Name" desc="How Arc should address you">
                  <Input
                    value={displayNameDraft}
                    onChange={(e) => { setDisplayNameDraft(e.target.value); setDisplayNameDirty(true); }}
                    placeholder="Enter your name"
                    className="glass border-glass-border"
                    disabled={updating}
                  />
                  {displayNameDirty && (
                    <div className="flex items-center gap-2 mt-2">
                      <Button size="sm" variant="outline" onClick={handleSaveDisplayName} disabled={updating} className="glass border-glass-border">
                        <Save className="w-3 h-3 mr-1" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setDisplayNameDraft(profile?.display_name || ""); setDisplayNameDirty(false); }} disabled={updating}>
                        <RotateCcw className="w-3 h-3 mr-1" /> Reset
                      </Button>
                    </div>
                  )}
                </Section>

                {/* Memory */}
                <Section icon={<Brain className="h-4 w-4" />} title="Memory" desc="View & manage what Arc remembers">
                  <Button
                    variant="outline"
                    className="w-full glass border-glass-border"
                    onClick={() => {
                      onClose();
                      window.dispatchEvent(new CustomEvent('open-context-blocks'));
                    }}
                  >
                    <Brain className="h-4 w-4 mr-2" /> View Memory
                  </Button>
                </Section>

                {/* Accent Color */}
                <Section icon={<Palette className="h-4 w-4" />} title="Accent Color" desc="Customize your theme color">
                  <div className="grid grid-cols-7 gap-3">
                    {COLOR_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setAccentColor(opt.id as AccentColor)}
                        className={cn(
                          "aspect-square rounded-xl relative transition-all",
                          accentColor === opt.id
                            ? "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110"
                            : "hover:scale-105"
                        )}
                        style={{ background: opt.gradient }}
                        aria-label={`Select ${opt.label}`}
                      >
                        {accentColor === opt.id && <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow-lg" />}
                      </button>
                    ))}
                  </div>
                </Section>

                {/* Voice */}
                <Section icon={<Mic className="h-4 w-4" />} title="Voice Mode" desc="Choose your AI assistant's voice">
                  <VoiceSelector />
                </Section>

                {/* AI Model */}
                <Section
                  icon={<Sparkles className="h-4 w-4" />}
                  title="AI Model"
                  desc="Choose between GPT and Gemini"
                  badge={!isSubscribed ? "PRO" : undefined}
                >
                  <div className={cn("grid grid-cols-2 gap-3", !isSubscribed && "opacity-60")}>
                    {([
                      { id: 'gemini' as ModelFamily, label: 'Gemini', desc: 'Google AI' },
                      { id: 'gpt' as ModelFamily, label: 'GPT', desc: 'OpenAI' },
                    ]).map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => handleModelChange(opt.id)}
                        disabled={!isSubscribed}
                        className={cn(
                          "relative p-4 rounded-xl border transition-all text-left",
                          modelFamily === opt.id
                            ? "border-primary bg-primary/10 shadow-[0_0_15px_hsl(var(--primary)/0.15)]"
                            : "border-border/40 bg-muted/20 hover:border-border/60",
                          !isSubscribed ? "cursor-not-allowed" : "cursor-pointer"
                        )}
                      >
                        <div className="font-semibold text-foreground">{opt.label}</div>
                        <div className="text-xs text-muted-foreground">{opt.desc}</div>
                        {modelFamily === opt.id && <Check className="absolute top-3 right-3 w-4 h-4 text-primary" />}
                      </button>
                    ))}
                  </div>
                </Section>
              </>
            )}

            {/* ===================== ACCOUNT TAB ===================== */}
            {activeTab === "account" && (
              <>
                {/* Email */}
                <Section icon={<Mail className="h-4 w-4" />} title="Email Address" desc="Your account email">
                  <div className="text-sm text-muted-foreground font-mono bg-muted/20 px-3 py-2 rounded-lg">
                    {user?.email || "No email"}
                  </div>
                </Section>

                {/* Connected Accounts */}
                <Section icon={<Key className="h-4 w-4" />} title="Connected Accounts" desc="Manage your login methods">
                  <div className="space-y-2">
                    {user?.app_metadata?.providers?.includes("google") && (
                      <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                        <div className="flex items-center gap-3">
                          <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z" opacity="0.15" /><path fill="currentColor" d="M12 7a5 5 0 0 0-5 5c0 1.93 1.1 3.6 2.68 4.52L7 17c-1.2-1.23-2-2.92-2-5 0-3.87 3.13-7 7-7s7 3.13 7 7h-2a5 5 0 0 0-5-5z" /></svg>
                          <div>
                            <div className="text-sm font-medium">Google Account</div>
                            <div className="text-xs text-muted-foreground">Connected</div>
                          </div>
                        </div>
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                      </div>
                    )}
                    <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Mail className="w-5 h-5" />
                        <div>
                          <div className="text-sm font-medium">Email & Password</div>
                          <div className="text-xs text-muted-foreground">Primary login</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsPasswordResetOpen(true)}>
                          <Key className="w-3 h-3 mr-1" /> Reset
                        </Button>
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                      </div>
                    </div>
                  </div>
                </Section>

                {/* Sync Status */}
                <Section icon={<Cloud className="h-4 w-4" />} title="Sync Status" desc="Cloud synchronization">
                  <div className="flex items-center gap-2 glass px-3 py-2 rounded-full text-sm w-fit">
                    <SyncIcon className={cn("h-4 w-4", syncColor)} />
                    <span className={syncColor}>{syncText}</span>
                  </div>
                </Section>

                {/* Data Management */}
                <Section icon={<Download className="h-4 w-4" />} title="Data Management" desc="Export or clear your data">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-foreground">Export Chats</span>
                      <Button variant="outline" size="sm" className="glass border-glass-border" onClick={() => {
                        onClose();
                        const { setRightPanelOpen, setRightPanelTab } = useArcStore.getState();
                        setRightPanelTab("export" as any);
                        setRightPanelOpen(true);
                      }}>
                        <Download className="h-3 w-3 mr-1" /> Export
                      </Button>
                    </div>
                    <div className="h-px bg-border/30" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-foreground">Clear Chat History</span>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleClearMessages}>
                        <Trash2 className="h-3 w-3 mr-1" /> Clear All
                      </Button>
                    </div>
                  </div>
                </Section>

                {/* Sign Out & Delete */}
                <Section icon={<LogOut className="h-4 w-4" />} title="Account Actions" desc="Sign out or delete your account">
                  <div className="space-y-3">
                    <Button variant="outline" className="w-full glass border-glass-border" onClick={handleSignOut}>
                      <LogOut className="h-4 w-4 mr-2" /> Sign Out
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" className="w-full border-destructive/30 text-destructive hover:bg-destructive/10" disabled={isDeleting}>
                          <Trash2 className="h-4 w-4 mr-2" /> {isDeleting ? "Deleting..." : "Delete Account"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="glass border-destructive/20">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-5 w-5" /> Are you absolutely sure?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete your account and remove all data.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="glass border-glass-border">Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDeleteAccount} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={isDeleting}>
                            {isDeleting ? "Deleting..." : "Delete Account"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </Section>

                {/* Admin */}
                {isAdmin && (
                  <Section icon={<Shield className="h-4 w-4" />} title="Admin Panel" desc="Manage system settings">
                    <Button variant="outline" className="w-full glass border-glass-border" onClick={() => { onClose(); navigate('/admin'); }}>
                      <Settings className="h-4 w-4 mr-2" /> Open Admin Panel
                    </Button>
                  </Section>
                )}
              </>
            )}

            {/* Footer */}
            <div className="pt-4 border-t border-border/20">
              <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                <a href="https://winthenight.productions/support" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors underline">Support</a>
                <span>•</span>
                <a href="https://winthenight.productions" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors underline">Win the Night Productions</a>
              </div>
              <p className="text-[10px] text-muted-foreground text-center mt-2">
                © 2026 Win The Night Productions. All rights reserved.
              </p>
            </div>
          </div>
        </ScrollArea>

        {/* Password Reset Dialog */}
        {isPasswordResetOpen && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setIsPasswordResetOpen(false)}>
            <div className="glass border border-border/40 rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4" onClick={e => e.stopPropagation()}>
              <h3 className="font-semibold text-foreground">Reset Password</h3>
              <p className="text-sm text-muted-foreground">
                We'll send a password reset link to <span className="font-mono">{user?.email}</span>
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setIsPasswordResetOpen(false)} disabled={isResettingPassword}>Cancel</Button>
                <Button onClick={handlePasswordReset} disabled={isResettingPassword}>
                  {isResettingPassword ? "Sending..." : "Send Reset Link"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ icon, title, desc, badge, children }: {
  icon: React.ReactNode; title: string; desc: string; badge?: string; children: React.ReactNode;
}) {
  return (
    <div className="p-4 rounded-xl glass border border-border/30 space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-primary">{icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-foreground text-sm">{title}</h3>
            {badge && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary">{badge}</span>}
          </div>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="p-2.5 rounded-xl glass border border-border/30 text-center space-y-0.5">
      <div className="flex items-center justify-center text-muted-foreground">{icon}</div>
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
