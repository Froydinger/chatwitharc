import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Trash2,
  User,
  LogOut,
  AlertTriangle,
  Camera,
  Wifi,
  WifiOff,
  Cloud,
  CloudOff,
  Mic,
  Settings as SettingsIcon,
  ChevronDown,
  Save,
  RotateCcw,
  X,
  Mail,
  Key,
  Download,
  Monitor,
  Palette,
  Check,
} from "lucide-react";
import { useAccentColor, AccentColor } from "@/hooks/useAccentColor";
import { DeleteDataModal } from "@/components/DeleteDataModal";
import { useProfile } from "@/hooks/useProfile";
import { useArcStore } from "@/store/useArcStore";
import { useAuth } from "@/hooks/useAuth";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFingerPopup } from "@/hooks/use-finger-popup";
import { useAdminSettings } from "@/hooks/useAdminSettings";
import { fadeInVariants, staggerContainerVariants, staggerItemVariants } from "@/utils/animations";
import { VoiceSelector } from "@/components/VoiceSelector";
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
import { FileText, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function SettingsPanel() {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const navigate = useNavigate();
  const {
    clearAllSessions,
    lastSyncAt,
    createNewSession,
    setRightPanelTab,
  } = useArcStore();
  const { user } = useAuth();
  const { profile, updateProfile, updating } = useProfile();
  const { toast } = useToast();
  const showPopup = useFingerPopup((state) => state.showPopup);
  // Use unified accent color system
  const { accentColor, setAccentColor } = useAccentColor();

  const handleDataDeleted = () => {
    // Create new session and refresh
    createNewSession();
    toast({
      title: "Account Reset",
      description: "Starting fresh with a new session",
    });
  };
  const { isAdmin } = useAdminSettings();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isPasswordResetOpen, setIsPasswordResetOpen] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Collapsible states
  const [openSections, setOpenSections] = useState({
    profile: true,
    data: false,
  });

  // Local draft states for profile fields
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [displayNameDirty, setDisplayNameDirty] = useState(false);
  const [contextDraft, setContextDraft] = useState("");
  const [contextDirty, setContextDirty] = useState(false);
  const [isContextDialogOpen, setIsContextDialogOpen] = useState(false);


  // Online/offline detection
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

  // Keep drafts in sync with profile
  useEffect(() => {
    if (!displayNameDirty) setDisplayNameDraft(profile?.display_name || "");
  }, [profile?.display_name, displayNameDirty]);

  useEffect(() => {
    if (!contextDirty) setContextDraft(profile?.context_info || "");
  }, [profile?.context_info, contextDirty]);

  const handleSaveDisplayName = async () => {
    try {
      await updateProfile({ display_name: displayNameDraft.trim() });
      setDisplayNameDirty(false);
    } catch (e) {
      toast({
        title: "Save failed",
        description: "Could not save your name. Try again.",
        variant: "destructive",
      });
    }
  };

  const handleSaveContext = async () => {
    try {
      await updateProfile({ context_info: contextDraft });
      setContextDirty(false);
    } catch (e) {
      toast({
        title: "Save failed",
        description: "Could not save your context. Try again.",
        variant: "destructive",
      });
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    if (!supabase || !isSupabaseConfigured) {
      toast({
        title: "Upload unavailable",
        description: "Storage is not available. Please try again later.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from("avatars").upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(fileName);

      await updateProfile({ avatar_url: publicUrl });
    } catch (error) {
      console.error("Error uploading avatar:", error);
      toast({
        title: "Upload failed",
        description: "Failed to upload profile picture. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      const input = document.getElementById("avatar-upload") as HTMLInputElement;
      if (input) input.value = "";
    }
  };

  const handleClearMessages = () => {
    clearAllSessions();
    if (navigator.vibrate) {
      navigator.vibrate([50, 50, 50]);
    }
  };

  const handleSignOut = async () => {
    if (!supabase || !isSupabaseConfigured) {
      toast({
        title: "Error",
        description: "Sign out is not available. Please try again later.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Clear all theme-related cache
      localStorage.removeItem('theme');
      localStorage.removeItem('followSystem');
      localStorage.removeItem('accentColor');

      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      toast({
        title: "Signed out",
        description: "You've been signed out successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to sign out",
        variant: "destructive",
      });
    }
  };

  const handlePasswordReset = async () => {
    if (!supabase || !isSupabaseConfigured) {
      toast({
        title: "Error",
        description: "Password reset is not available. Please try again later.",
        variant: "destructive",
      });
      return;
    }

    if (!user?.email) {
      toast({
        title: "Error",
        description: "No email address found",
        variant: "destructive",
      });
      return;
    }

    setIsResettingPassword(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/`,
      });

      if (error) throw error;

      toast({
        title: "Password reset sent",
        description: "Check your email for password reset instructions",
      });

      setIsPasswordResetOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send password reset",
        variant: "destructive",
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      clearAllSessions();

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("No user found");

      await supabase.from("profiles").delete().eq("user_id", user.id);
      await supabase.from("chat_sessions").delete().eq("user_id", user.id);

      toast({
        title: "Account deleted",
        description: "Your account has been permanently deleted. You can register again if needed.",
      });

      await supabase.auth.signOut();
    } catch (error: any) {
      console.error("Delete account error:", error);
      toast({
        title: "Deletion failed",
        description: "Failed to delete account. Please try again or contact support.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Typing for sync status
  type SyncStatus = { icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; color: string; text: string };
  const getSyncStatus = (): SyncStatus => {
    if (!user) return { icon: CloudOff, color: "text-muted-foreground", text: "Not signed in" };
    if (!isOnline) return { icon: WifiOff, color: "text-destructive", text: "Offline" };
    if (!lastSyncAt) return { icon: CloudOff, color: "text-muted-foreground", text: "Syncing..." };

    const timeSinceSync = Date.now() - lastSyncAt.getTime();
    if (timeSinceSync < 5000) {
      return { icon: Cloud, color: "text-green-400", text: "Synced" };
    }
    return { icon: Cloud, color: "text-primary-glow", text: "Auto-sync enabled" };
  };

  const { icon: SyncIcon, color: syncColor, text: syncText } = getSyncStatus();

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Accent color options (match exact HSL format used in storage)
  const colorOptions = [
    {
      id: "red",
      label: "Red",
      value: "0 85.0% 60.0%",
      gradient: "linear-gradient(135deg, hsl(0,85%,60%), hsl(0,85%,70%))",
    },
    {
      id: "blue",
      label: "Blue",
      value: "200 95% 55%",
      gradient: "linear-gradient(135deg, hsl(200,95%,55%), hsl(200,90%,65%))",
    },
    {
      id: "green",
      label: "Green",
      value: "142 76.0% 36.3%",
      gradient: "linear-gradient(135deg, hsl(142,76%,42%), hsl(142,76%,52%))",
    },
    {
      id: "yellow",
      label: "Yellow",
      value: "48 100.0% 50.0%",
      gradient: "linear-gradient(135deg, hsl(48,85%,55%), hsl(48,85%,65%))",
    },
    {
      id: "purple",
      label: "Purple",
      value: "270 80.0% 60.0%",
      gradient: "linear-gradient(135deg, hsl(270,75%,60%), hsl(270,75%,70%))",
    },
    {
      id: "orange",
      label: "Orange",
      value: "25 90.0% 58.0%",
      gradient: "linear-gradient(135deg, hsl(25,90%,58%), hsl(25,90%,68%))",
    },
    {
      id: "noir",
      label: "Noir",
      value: "0 0% 92%",
      gradient: "linear-gradient(135deg, hsl(0,0%,95%), hsl(0,0%,70%))",
    },
  ];

  const handleAccentClick = (colorId: AccentColor) => {
    // Use the unified accent color system with named color keys
    setAccentColor(colorId);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 pb-20 pt-8 px-4 h-full overflow-y-auto scrollbar-hide">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <div className="glass rounded-full p-2">
            <SettingsIcon className="h-6 w-6 text-primary-glow" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Preferences</h1>
        </div>
        <p className="text-muted-foreground">Customize your ArcAI experience</p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-muted/50 rounded-full p-1">
          <TabsTrigger value="profile" className="rounded-full data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm">Profile</TabsTrigger>
          <TabsTrigger value="account" className="rounded-full data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm">Account</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6 mt-6">
          {/* Your Name */}
          <GlassCard variant="bubble" className="p-6 space-y-3">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-primary-glow" />
              <div>
                <h3 className="text-lg font-semibold text-foreground">Your Name</h3>
                <p className="text-sm text-muted-foreground">How Arc should address you</p>
              </div>
            </div>
            <div className="space-y-2">
              <Input
                value={displayNameDraft}
                onChange={(e) => {
                  setDisplayNameDraft(e.target.value);
                  setDisplayNameDirty(true);
                }}
                placeholder="Enter your name"
                className="glass border-glass-border"
                disabled={updating}
              />
              {displayNameDirty && (
                <div className="flex items-center gap-2">
                  <GlassButton variant="ghost" size="sm" onClick={handleSaveDisplayName} disabled={updating}>
                    <Save className="w-3 h-3 mr-1" />
                    Save
                  </GlassButton>
                  <GlassButton
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDisplayNameDraft(profile?.display_name || "");
                      setDisplayNameDirty(false);
                    }}
                    disabled={updating}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Reset
                  </GlassButton>
                </div>
              )}
            </div>
          </GlassCard>

          {/* Context Button */}
          <GlassCard variant="bubble" className="p-6 space-y-3">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary-glow" />
              <div>
                <h3 className="text-lg font-semibold text-foreground">Context</h3>
                <p className="text-sm text-muted-foreground">Give Arc extra context about yourself</p>
              </div>
            </div>
            <Dialog open={isContextDialogOpen} onOpenChange={setIsContextDialogOpen}>
              <DialogTrigger asChild>
                <GlassButton className="w-full h-12 rounded-full outline-shimmer inline-flex items-center justify-center text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]">
                  <FileText className="h-4 w-4 mr-2" />
                  Context
                </GlassButton>
              </DialogTrigger>
              <DialogContent className="w-[95vw] max-w-lg max-h-[85vh] sm:max-h-[80vh] overflow-y-auto p-4 sm:p-6">
                <DialogHeader>
                  <DialogTitle className="text-base sm:text-lg">Context</DialogTitle>
                  <DialogDescription className="text-xs sm:text-sm">Tell Arc about yourself and your preferences</DialogDescription>
                </DialogHeader>

                <div className="py-3 sm:py-4">
                  <div className="space-y-2 sm:space-y-3">
                    <p className="text-[10px] sm:text-xs text-muted-foreground">This information helps Arc personalize responses to your needs</p>
                    <div className="space-y-2">
                      <Textarea
                        value={contextDraft}
                        onChange={(e) => {
                          setContextDraft(e.target.value);
                          setContextDirty(true);
                        }}
                        placeholder="I'm interested in... I prefer... I'm working on..."
                        className="glass border-glass-border min-h-[120px] sm:min-h-[150px] resize-none text-sm"
                        disabled={updating}
                        autoFocus={false}
                        data-autofocus="false"
                      />
                      {contextDirty && (
                        <div className="flex items-center gap-2">
                          <GlassButton variant="ghost" size="sm" onClick={handleSaveContext} disabled={updating}>
                            <Save className="w-3 h-3 mr-1" />
                            Save
                          </GlassButton>
                          <GlassButton
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setContextDraft(profile?.context_info || "");
                              setContextDirty(false);
                            }}
                            disabled={updating}
                          >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Reset
                          </GlassButton>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </GlassCard>

          {/* Appearance Section */}
          <GlassCard variant="bubble" className="p-6 space-y-6">
            <div className="flex items-center gap-3">
              <Palette className="h-5 w-5 text-primary-glow" />
              <div>
                <h3 className="text-lg font-semibold text-foreground">Appearance</h3>
                <p className="text-sm text-muted-foreground">Customize your visual experience</p>
              </div>
            </div>

            {/* Accent Color Picker */}
            <div className="space-y-3">
              <div>
                <Label className="text-foreground font-medium">Accent Color</Label>
                <p className="text-sm text-muted-foreground mt-1">Customize the app's accent color</p>
              </div>
              <div className="grid grid-cols-6 gap-3">
                {colorOptions.map((opt) => {
                  // Normalize both strings for comparison (remove extra spaces and format)
                  // Compare using color ID (named key), not HSL values
                  const isActive = accentColor === opt.id;
                  
                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleAccentClick(opt.id as AccentColor)}
                      className={`aspect-square rounded-xl relative transition-all ${
                        isActive
                          ? "ring-2 ring-offset-2 ring-offset-background ring-primary scale-110"
                          : "hover:scale-105"
                      }`}
                      style={{
                        background: opt.gradient,
                      }}
                      aria-label={`Select ${opt.label} accent color`}
                    >
                      {isActive && (
                        <Check className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow-lg" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

          </GlassCard>

          {/* Voice Mode Section */}
          <GlassCard variant="bubble" className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Mic className="h-5 w-5 text-primary-glow" />
              <div>
                <h3 className="text-lg font-semibold text-foreground">Voice Mode</h3>
                <p className="text-sm text-muted-foreground">Choose your AI assistant's voice</p>
              </div>
            </div>
            <VoiceSelector />
          </GlassCard>

        </TabsContent>

        {/* Account Tab */}
        <TabsContent value="account" className="space-y-6 mt-6">
          {/* Email Address */}
          <GlassCard variant="bubble" className="p-6">
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-foreground">Email Address</h4>
                <p className="text-xs text-muted-foreground">Your account email</p>
              </div>
              <div className="text-sm text-muted-foreground font-mono bg-glass/30 px-3 py-2 rounded-md">
                {user?.email || "No email"}
              </div>
            </div>
          </GlassCard>

          <GlassCard variant="bubble" className="p-6">
            <div className="space-y-6">
              {/* Connected Accounts */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-foreground">Connected Accounts</h4>
                    <p className="text-xs text-muted-foreground">Manage your login methods</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {user?.app_metadata?.providers?.includes("google") && (
                    <div className="flex items-center justify-between p-3 bg-glass/30 rounded-md">
                      <div className="flex items-center gap-3">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            fill="currentColor"
                            d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"
                            opacity="0.15"
                          ></path>
                          <path
                            fill="currentColor"
                            d="M12 7a5 5 0 0 0-5 5c0 1.93 1.1 3.6 2.68 4.52L7 17c-1.2-1.23-2-2.92-2-5 0-3.87 3.13-7 7-7s7 3.13 7 7h-2a5 5 0 0 0-5-5z"
                          ></path>
                        </svg>
                        <div>
                          <div className="text-sm font-medium">Google Account</div>
                          <div className="text-xs text-muted-foreground">Connected</div>
                        </div>
                      </div>
                      <div className="w-2 h-2 bg-green-500 rounded-full" aria-label="connected-dot" />
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
                            <Key className="w-3 h-3 mr-1" />
                            Reset
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
                            <GlassButton
                              variant="ghost"
                              onClick={() => setIsPasswordResetOpen(false)}
                              disabled={isResettingPassword}
                            >
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
              </div>

              <div className="h-px bg-border" />

              {/* Sync Status */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-foreground">Sync Status</h3>
                  <p className="text-xs text-muted-foreground">Cloud synchronization</p>
                </div>
                <div className="flex items-center gap-2 glass px-3 py-2 rounded-full text-sm">
                  <SyncIcon className={`h-4 w-4 ${syncColor}`} />
                  <span className={syncColor}>{syncText}</span>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Export & Data Management */}
          <GlassCard variant="bubble" className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-foreground">Export Chats</h3>
                <p className="text-xs text-muted-foreground">Download as HTML, TXT, JSON, or WordPress plugin</p>
              </div>
              <GlassButton variant="ghost" size="sm" onClick={() => setRightPanelTab("export")}>
                <Download className="h-4 w-4 mr-1" />
                Export
              </GlassButton>
            </div>

            <div className="pt-4 border-t border-border/40">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-foreground">Clear Chat History</h3>
                  <p className="text-xs text-muted-foreground">Remove all stored conversations</p>
                </div>
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={handleClearMessages}
                  className="text-destructive hover:text-destructive"
                >
                  Clear All
                </GlassButton>
              </div>
            </div>
          </GlassCard>

          {/* Usage Disclaimer */}
          <GlassCard variant="bubble" className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              <div>
                <h3 className="text-sm font-medium text-foreground">Fair Use Policy</h3>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              If you abuse our free, unlimited service via ArcAi tools (it takes a LOT to do this, don't worry) you will be banned. 99.99% of people don't need to worry about this–you know who you are. 👀
            </p>
          </GlassCard>

          {/* Account Actions */}
          <GlassCard variant="bubble" className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-foreground">Sign Out</h3>
                <p className="text-xs text-muted-foreground">Sign out of your account</p>
              </div>
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-destructive hover:text-destructive"
              >
                Sign Out
              </GlassButton>
            </div>

            <div className="h-px bg-border" />

            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-foreground">Delete Account</h3>
                <p className="text-xs text-muted-foreground">Permanently delete your account and all data</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <GlassButton
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={isDeleting}
                  >
                    {isDeleting ? "Deleting..." : "Delete Account"}
                  </GlassButton>
                </AlertDialogTrigger>
                <AlertDialogContent className="glass border-destructive/20">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                      Are you absolutely sure?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete your account and remove all your data
                      from our servers.
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

          {/* Admin Panel Access */}
          {isAdmin && (
            <GlassCard variant="bubble" className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="h-4 w-4 text-primary" />
                    <h3 className="font-medium text-foreground">Admin Panel</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">Manage system settings and configuration</p>
                </div>
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/admin')}
                  className="text-primary hover:text-primary"
                >
                  <SettingsIcon className="h-4 w-4 mr-1" />
                  Open Admin
                </GlassButton>
              </div>
            </GlassCard>
          )}
        </TabsContent>

      </Tabs>

      {/* Footer with Support Links */}
      <div className="mt-8 pt-6 border-t border-border/30">
        <div className="text-center space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center justify-center gap-4">
            <a
              href="https://winthenight.productions/support"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary-glow transition-colors underline"
            >
              Support
            </a>
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

      {/* Delete Data Modal */}
      <DeleteDataModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onDeleted={handleDataDeleted}
      />
    </div>
  );
}
