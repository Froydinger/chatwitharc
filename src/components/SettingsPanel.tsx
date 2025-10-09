import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Trash2, User, LogOut, AlertTriangle, Camera, Wifi, WifiOff, 
  Cloud, CloudOff, Mic, Settings as SettingsIcon, ChevronDown,
  Save, RotateCcw, X, Mail, Key
} from "lucide-react";
import { DeleteDataModal } from "@/components/DeleteDataModal";
import { useProfile } from "@/hooks/useProfile";
import { useArcStore } from "@/store/useArcStore";
import { useAuth } from "@/hooks/useAuth";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAdminSettings } from "@/hooks/useAdminSettings";
import { fadeInVariants, staggerContainerVariants, staggerItemVariants } from "@/utils/animations";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AdminSettingsPanel } from "@/components/AdminSettingsPanel";

export function SettingsPanel() {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { 
    selectedVoice,
    setSelectedVoice, 
    clearAllSessions,
    lastSyncAt,
    isVoiceMode,
    setVoiceMode,
    isContinuousVoiceMode,
    setContinuousVoiceMode,
    createNewSession
  } = useArcStore();
  const { user } = useAuth();
  const { profile, updateProfile, updating } = useProfile();
  const { toast } = useToast();

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
    voice: false,
    data: false
  });

  // Local draft states for profile fields
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [displayNameDirty, setDisplayNameDirty] = useState(false);
  const [contextDraft, setContextDraft] = useState("");
  const [contextDirty, setContextDirty] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryDirty, setMemoryDirty] = useState(false);
  const [selectedModel, setSelectedModel] = useState((profile as any)?.preferred_model || 'google/gemini-2.5-flash');

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Keep drafts in sync with profile
  useEffect(() => {
    if (!displayNameDirty) setDisplayNameDraft(profile?.display_name || "");
  }, [profile?.display_name, displayNameDirty]);

  useEffect(() => {
    if (!contextDirty) setContextDraft(profile?.context_info || "");
  }, [profile?.context_info, contextDirty]);

  useEffect(() => {
    if (!memoryDirty) setMemoryDraft(profile?.memory_info || "");
  }, [profile?.memory_info, memoryDirty]);

  useEffect(() => {
    if ((profile as any)?.preferred_model) {
      setSelectedModel((profile as any).preferred_model);
    }
  }, [(profile as any)?.preferred_model]);

  const handleSaveDisplayName = async () => {
    try {
      await updateProfile({ display_name: displayNameDraft.trim() });
      setDisplayNameDirty(false);
    } catch (e) {
      toast({
        title: "Save failed",
        description: "Could not save your name. Try again.",
        variant: "destructive"
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
        variant: "destructive"
      });
    }
  };

  const handleSaveMemory = async () => {
    try {
      await updateProfile({ memory_info: memoryDraft });
      setMemoryDirty(false);
    } catch (e) {
      toast({
        title: "Save failed",
        description: "Could not save your memory. Try again.",
        variant: "destructive"
      });
    }
  };

  const handleClearMemory = async () => {
    try {
      await updateProfile({ memory_info: "" });
      setMemoryDraft("");
      setMemoryDirty(false);
    } catch (e) {
      toast({
        title: "Clear failed",
        description: "Could not clear your memory. Try again.",
        variant: "destructive"
      });
    }
  };

  const handleModelChange = async (model: string) => {
    try {
      setSelectedModel(model);
      await updateProfile({ preferred_model: model } as any);
      toast({
        title: "Model updated",
        description: `Now using ${model.includes('gemini') ? 'Google Gemini' : 'OpenAI GPT'}`
      });
    } catch (e) {
      toast({
        title: "Update failed",
        description: "Could not update model preference",
        variant: "destructive"
      });
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/avatar.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      await updateProfile({ avatar_url: publicUrl });
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload profile picture. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
      const input = document.getElementById('avatar-upload') as HTMLInputElement;
      if (input) input.value = '';
    }
  };

  const handleClearMessages = () => {
    clearAllSessions();
    if (navigator.vibrate) {
      navigator.vibrate([50, 50, 50]);
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      toast({
        title: "Signed out",
        description: "You've been signed out successfully"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to sign out",
        variant: "destructive"
      });
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) {
      toast({
        title: "Error",
        description: "No email address found",
        variant: "destructive"
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
        description: "Check your email for password reset instructions"
      });
      
      setIsPasswordResetOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send password reset",
        variant: "destructive"
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      clearAllSessions();
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');
      
      await supabase.from('profiles').delete().eq('user_id', user.id);
      await supabase.from('chat_sessions').delete().eq('user_id', user.id);
      
      toast({
        title: "Account deleted",
        description: "Your account has been permanently deleted. You can register again if needed."
      });
      
      await supabase.auth.signOut();
    } catch (error: any) {
      console.error('Delete account error:', error);
      toast({
        title: "Deletion failed",
        description: "Failed to delete account. Please try again or contact support.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const getSyncStatus = () => {
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
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
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
        <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          {isAdmin && <TabsTrigger value="admin">Admin</TabsTrigger>}
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6 mt-6">
          {/* Profile Picture */}
          <GlassCard variant="bubble" className="p-6">
            <div className="flex flex-col items-center space-y-4">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-muted border-2 border-border">
                {profile?.avatar_url ? (
                  <img 
                    src={profile.avatar_url} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User className="w-8 h-8 text-muted-foreground" />
                  </div>
                )}
              </div>
              
              <GlassButton
                variant="default"
                onClick={() => document.getElementById('avatar-upload')?.click()}
                disabled={isUploading}
                className="flex items-center gap-2"
              >
                <Camera className="w-4 h-4" />
                {isUploading ? "Uploading..." : "Update Photo"}
              </GlassButton>
              
              <input
                id="avatar-upload"
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>
          </GlassCard>

          {/* Personal Information */}
          <Collapsible 
            open={openSections.profile} 
            onOpenChange={() => toggleSection('profile')}
          >
            <GlassCard variant="bubble" className="overflow-hidden">
              <CollapsibleTrigger className="w-full p-6 flex items-center justify-between hover:bg-glass/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="glass rounded-lg p-2">
                    <User className="h-5 w-5 text-primary-glow" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Personal Information</h3>
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${openSections.profile ? 'rotate-180' : ''}`} />
              </CollapsibleTrigger>
              
              <CollapsibleContent className="px-6 pb-6">
                <div className="space-y-6">
                  {/* Display Name */}
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-foreground">Your Name</label>
                      <p className="text-xs text-muted-foreground">How Arc should address you</p>
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
                          <GlassButton
                            variant="ghost"
                            size="sm"
                            onClick={handleSaveDisplayName}
                            disabled={updating}
                          >
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
                  </div>

                  {/* Email */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Email Address</label>
                    <div className="text-sm text-muted-foreground font-mono bg-glass/30 px-3 py-2 rounded-md">
                      {user?.email || "No email"}
                    </div>
                  </div>

                  {/* Context */}
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-foreground">Context & Preferences</label>
                      <p className="text-xs text-muted-foreground">Tell Arc about yourself and your needs</p>
                    </div>
                    <div className="space-y-2">
                      <Textarea
                        value={contextDraft}
                        onChange={(e) => {
                          setContextDraft(e.target.value);
                          setContextDirty(true);
                        }}
                        placeholder="I'm interested in... I prefer... I'm working on..."
                        className="glass border-glass-border min-h-[80px] resize-none"
                        disabled={updating}
                      />
                      {contextDirty && (
                        <div className="flex items-center gap-2">
                          <GlassButton variant="ghost" size="sm" onClick={handleSaveContext} disabled={updating}>
                            <Save className="w-3 h-3 mr-1" />Save
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
                            <RotateCcw className="w-3 h-3 mr-1" />Reset
                          </GlassButton>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* AI Model Selection */}
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-foreground">AI Model</label>
                      <p className="text-xs text-muted-foreground">Choose which model powers your conversations</p>
                    </div>
                    <Select value={selectedModel} onValueChange={handleModelChange}>
                      <SelectTrigger className="glass border-glass-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="glass border-glass-border">
                        <SelectItem value="google/gemini-2.5-flash">
                          <div className="flex flex-col">
                            <span className="font-medium">Gemini 2.5 Flash</span>
                            <span className="text-xs text-muted-foreground">Balanced - Fast & smart (default)</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="google/gemini-2.5-pro">
                          <div className="flex flex-col">
                            <span className="font-medium">Gemini 2.5 Pro</span>
                            <span className="text-xs text-muted-foreground">Most capable - Best reasoning</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="google/gemini-2.5-flash-lite">
                          <div className="flex flex-col">
                            <span className="font-medium">Gemini 2.5 Flash Lite</span>
                            <span className="text-xs text-muted-foreground">Fastest - Simple tasks</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="openai/gpt-5">
                          <div className="flex flex-col">
                            <span className="font-medium">GPT-5</span>
                            <span className="text-xs text-muted-foreground">Premium - Highest quality</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="openai/gpt-5-mini">
                          <div className="flex flex-col">
                            <span className="font-medium">GPT-5 Mini</span>
                            <span className="text-xs text-muted-foreground">Efficient - Great performance</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="openai/gpt-5-nano">
                          <div className="flex flex-col">
                            <span className="font-medium">GPT-5 Nano</span>
                            <span className="text-xs text-muted-foreground">Speed optimized</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Memory */}
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-foreground">Memory Bank</label>
                      <p className="text-xs text-muted-foreground">Information Arc remembers from conversations</p>
                    </div>
                    <div className="space-y-2">
                      <Textarea
                        value={memoryDraft}
                        onChange={(e) => {
                          setMemoryDraft(e.target.value);
                          setMemoryDirty(true);
                        }}
                        placeholder="Arc will automatically add things here when you say 'remember this'..."
                        className="glass border-glass-border min-h-[80px] resize-none"
                        disabled={updating}
                      />
                      <div className="flex items-center gap-2">
                        {memoryDirty ? (
                          <>
                            <GlassButton variant="ghost" size="sm" onClick={handleSaveMemory} disabled={updating}>
                              <Save className="w-3 h-3 mr-1" />Save
                            </GlassButton>
                            <GlassButton 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => {
                                setMemoryDraft(profile?.memory_info || "");
                                setMemoryDirty(false);
                              }}
                              disabled={updating}
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />Reset
                            </GlassButton>
                          </>
                        ) : (
                          <GlassButton
                            variant="ghost"
                            size="sm"
                            onClick={handleClearMemory}
                            disabled={updating}
                            className="text-destructive hover:text-destructive"
                          >
                            <X className="w-3 h-3 mr-1" />
                            Clear All
                          </GlassButton>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </GlassCard>
          </Collapsible>
        </TabsContent>

        {/* Account Tab */}
        <TabsContent value="account" className="space-y-6 mt-6">
          {/* Sync Status */}
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
                  {user?.app_metadata?.providers?.includes('google') && (
                    <div className="flex items-center justify-between p-3 bg-glass/30 rounded-md">
                      <div className="flex items-center gap-3">
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
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
                        <div>
                          <div className="text-sm font-medium">Google Account</div>
                          <div className="text-xs text-muted-foreground">Connected</div>
                        </div>
                      </div>
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
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
                              {user?.app_metadata?.providers?.includes('google') 
                                ? "This will add email/password login to your account. Your Google login will remain active."
                                : "We'll send a password reset link to your email address."
                              }
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
                            <GlassButton 
                              onClick={handlePasswordReset}
                              disabled={isResettingPassword}
                            >
                              {isResettingPassword ? "Sending..." : "Send Reset Link"}
                            </GlassButton>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
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

          {/* Data Management */}
          <GlassCard variant="bubble" className="p-6">
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
                      Delete Account Permanently
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-foreground">
                      This action cannot be undone. This will permanently delete your account,
                      remove all your data including chat history, profile information, and 
                      disconnect any Google authentication. You can register again with the 
                      same email if needed.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="glass">Cancel</AlertDialogCancel>
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

          {/* App Info */}
          <GlassCard variant="bubble" className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="glass rounded-lg p-2">
                <SettingsIcon className="h-5 w-5 text-primary-glow" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">About ArcAI</h3>
            </div>
            
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>✨ Beautiful glassmorphism interface</p>
              <p>🤖 Powered by Google Gemini 2.5 Flash via Lovable AI</p>
              <p>🎨 Image generation with Gemini Image Preview</p>
              <p>📱 Mobile-first responsive design</p>
              <p>🔒 Secure server-side API handling</p>
            </div>
          </GlassCard>
        </TabsContent>

        {/* Admin Tab */}
        {isAdmin && (
          <TabsContent value="admin" className="space-y-6 mt-6">
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2">
                <div className="glass rounded-full p-2">
                  <SettingsIcon className="h-6 w-6 text-primary-glow" />
                </div>
                <h2 className="text-xl font-bold text-foreground">Admin Settings</h2>
              </div>
              <p className="text-muted-foreground">Configure global AI behavior and system settings</p>
            </div>
            <AdminSettingsPanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
