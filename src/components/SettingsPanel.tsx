import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Trash2, User, LogOut, AlertTriangle, Camera, Wifi, WifiOff, Cloud, CloudOff, Mic, Settings as SettingsIcon } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { useArcStore } from "@/store/useArcStore";
import { useAuth } from "@/hooks/useAuth";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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

export function SettingsPanel() {
  const { 
    selectedVoice,
    setSelectedVoice, 
    clearAllSessions,
    lastSyncAt,
    isVoiceMode,
    setVoiceMode,
    isContinuousVoiceMode,
    setContinuousVoiceMode
  } = useArcStore();
  const { user } = useAuth();
  const { profile, updateProfile, updating } = useProfile();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Local draft + dirty state for Display Name (prevent save-per-keystroke)
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [displayNameDirty, setDisplayNameDirty] = useState(false);

  // Local draft + dirty state for Context box (no saving until "Save" pressed)
  const [contextDraft, setContextDraft] = useState("");
  const [contextDirty, setContextDirty] = useState(false);
  
  // Local draft + dirty state for Memory box
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryDirty, setMemoryDirty] = useState(false);

  // Online/offline detection for sync status
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

  // Keep display name draft in sync with profile unless user is editing
  useEffect(() => {
    if (!displayNameDirty) {
      setDisplayNameDraft(profile?.display_name || "");
    }
  }, [profile?.display_name, displayNameDirty]);

  // Keep local drafts in sync with profile, but don't overwrite if the user is editing
  useEffect(() => {
    if (!contextDirty) {
      setContextDraft(profile?.context_info || "");
    }
  }, [profile?.context_info, contextDirty]);

  useEffect(() => {
    if (!memoryDirty) {
      setMemoryDraft(profile?.memory_info || "");
    }
  }, [profile?.memory_info, memoryDirty]);

  const handleSaveDisplayName = async () => {
    try {
      await updateProfile({ display_name: displayNameDraft.trim() });
      setDisplayNameDirty(false);
      toast({
        title: "Saved",
        description: "Your name was updated."
      });
    } catch (e) {
      toast({
        title: "Save failed",
        description: "Could not save your name. Try again.",
        variant: "destructive"
      });
    }
  };

  const handleResetDisplayName = () => {
    setDisplayNameDraft(profile?.display_name || "");
    setDisplayNameDirty(false);
  };

  const handleSaveContext = async () => {
    try {
      await updateProfile({ context_info: contextDraft });
      setContextDirty(false);
      toast({
        title: "Saved",
        description: "Your context was updated."
      });
    } catch (e) {
      toast({
        title: "Save failed",
        description: "Could not save your context. Try again.",
        variant: "destructive"
      });
    }
  };

  const handleResetContext = () => {
    setContextDraft(profile?.context_info || "");
    setContextDirty(false);
  };

  const handleSaveMemory = async () => {
    try {
      await updateProfile({ memory_info: memoryDraft });
      setMemoryDirty(false);
      toast({
        title: "Saved",
        description: "Your memory was updated."
      });
    } catch (e) {
      toast({
        title: "Save failed",
        description: "Could not save your memory. Try again.",
        variant: "destructive"
      });
    }
  };

  const handleResetMemory = () => {
    setMemoryDraft(profile?.memory_info || "");
    setMemoryDirty(false);
  };

  const handleClearMemory = async () => {
    try {
      await updateProfile({ memory_info: "" });
      setMemoryDraft("");
      setMemoryDirty(false);
      toast({
        title: "Cleared",
        description: "Your memory has been cleared."
      });
    } catch (e) {
      toast({
        title: "Clear failed",
        description: "Could not clear your memory. Try again.",
        variant: "destructive"
      });
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setIsUploading(true);
    try {
      // Upload file to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/avatar.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Update profile with new avatar URL
      await updateProfile({ avatar_url: publicUrl });

      toast({
        title: "Avatar updated",
        description: "Your profile picture has been updated successfully!"
      });
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload profile picture. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
      // Clear the input value
      const input = document.getElementById('avatar-upload') as HTMLInputElement;
      if (input) input.value = '';
    }
  };

  const handleClearMessages = () => {
    clearAllSessions();
    // Simulate haptic feedback
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

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      // First clear all user data locally
      clearAllSessions();
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');
      
      // Delete profile and chat sessions manually (they have CASCADE delete)
      await supabase
        .from('profiles')
        .delete()
        .eq('user_id', user.id);
        
      await supabase
        .from('chat_sessions')
        .delete()
        .eq('user_id', user.id);
      
      toast({
        title: "Account deleted",
        description: "Your account has been permanently deleted. You can register again if needed."
      });
      
      // Sign out after deletion - this effectively removes the auth user
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
    
    if (!isOnline) {
      return { 
        icon: WifiOff, 
        color: "text-destructive", 
        text: "Offline" 
      };
    }
    
    if (!lastSyncAt) {
      return { 
        icon: CloudOff, 
        color: "text-muted-foreground", 
        text: "Syncing..." 
      };
    }

    const timeSinceSync = Date.now() - lastSyncAt.getTime();
    if (timeSinceSync < 5000) {
      return { 
        icon: Cloud, 
        color: "text-green-400", 
        text: "Synced" 
      };
    }

    return { 
      icon: Cloud, 
      color: "text-primary-glow", 
      text: "Auto-sync enabled" 
    };
  };

  const { icon: SyncIcon, color: syncColor, text: syncText } = getSyncStatus();

  const settings = [
    {
      title: "Personal Information",
      icon: User,
      items: [
        {
          label: "Your Name",
          description: "How Arc should address you",
          action: (
            <div className="w-full">
              <div className="flex flex-col gap-2">
                <Input
                  value={displayNameDraft}
                  onChange={(e) => {
                    setDisplayNameDraft(e.target.value);
                    setDisplayNameDirty(true);
                  }}
                  placeholder="Enter your name"
                  className="w-full glass border-glass-border text-sm"
                  disabled={updating}
                />
                <div className="mt-1 flex items-center gap-2">
                  <GlassButton
                    variant="ghost"
                    size="sm"
                    onClick={handleSaveDisplayName}
                    disabled={updating || !displayNameDirty}
                    className="px-3 py-1"
                  >
                    Save
                  </GlassButton>
                  <GlassButton
                    variant="ghost"
                    size="sm"
                    onClick={handleResetDisplayName}
                    disabled={updating || !displayNameDirty}
                    className="px-3 py-1"
                  >
                    Reset
                  </GlassButton>
                  {displayNameDirty && (
                    <span className="text-xs text-muted-foreground">
                      Unsaved changes
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        },
        {
          label: "Email Address",
          description: "Your account email",
          action: (
            <div className="text-xs sm:text-sm text-muted-foreground font-mono bg-glass/30 px-3 py-2 rounded-md break-all">
              {user?.email || "No email"}
            </div>
          )
        },
        {
          label: "Context & Preferences", 
          description: "Tell Arc about yourself and your needs",
          action: (
            <div className="w-full">
              <Textarea
                value={contextDraft}
                onChange={(e) => {
                  setContextDraft(e.target.value);
                  setContextDirty(true);
                }}
                placeholder="I'm interested in... I prefer... I'm working on..."
                className="w-full glass border-glass-border text-sm min-h-[80px] resize-none"
                disabled={updating}
              />
              <div className="mt-2 flex items-center gap-2">
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={handleSaveContext}
                  disabled={updating || !contextDirty}
                  className="px-3 py-1"
                >
                  Save
                </GlassButton>
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={handleResetContext}
                  disabled={updating || !contextDirty}
                  className="px-3 py-1"
                >
                  Reset
                </GlassButton>
                {contextDirty && (
                  <span className="text-xs text-muted-foreground">
                    Unsaved changes
                  </span>
                )}
              </div>
            </div>
          ),
        },
        {
          label: "Memory Bank", 
          description: "Information Arc remembers from your conversations",
          action: (
            <div className="w-full">
              <Textarea
                value={memoryDraft}
                onChange={(e) => {
                  setMemoryDraft(e.target.value);
                  setMemoryDirty(true);
                }}
                placeholder="Arc will automatically add things here when you say 'remember this'..."
                className="w-full glass border-glass-border text-sm min-h-[80px] resize-none"
                disabled={updating}
              />
              <div className="mt-2 flex items-center gap-2">
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={handleSaveMemory}
                  disabled={updating || !memoryDirty}
                  className="px-3 py-1"
                >
                  Save
                </GlassButton>
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={handleResetMemory}
                  disabled={updating || !memoryDirty}
                  className="px-3 py-1"
                >
                  Reset
                </GlassButton>
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={handleClearMemory}
                  disabled={updating}
                  className="px-3 py-1 text-destructive hover:text-destructive"
                >
                  Clear All
                </GlassButton>
                {memoryDirty && (
                  <span className="text-xs text-muted-foreground">
                    Unsaved changes
                  </span>
                )}
              </div>
            </div>
          ),
        }
      ]
    },
    {
      title: "Voice Settings",
      icon: Mic,
      items: [
        {
          label: "Voice Mode",
          description: "Enable voice conversations with AI",
          action: (
            <div className="flex items-center gap-2">
              <GlassButton
                variant={isVoiceMode ? "default" : "ghost"}
                size="sm"
                onClick={() => setVoiceMode(!isVoiceMode)}
                className="px-3 py-1"
              >
                {isVoiceMode ? "Enabled" : "Disabled"}
              </GlassButton>
            </div>
          )
        },
        {
          label: "Voice Selection",
          description: "Choose your preferred AI voice",
          action: (
            <Select value={selectedVoice} onValueChange={setSelectedVoice}>
              <SelectTrigger className="w-32 glass border-glass-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass border-glass-border">
                <SelectItem value="cedar">Cedar</SelectItem>
                <SelectItem value="marin">Marin</SelectItem>
              </SelectContent>
            </Select>
          )
        },
        {
          label: "Continuous Mode",
          description: "AI responds automatically when you stop speaking",
          action: (
            <div className="flex items-center gap-2">
              <GlassButton
                variant={isContinuousVoiceMode ? "default" : "ghost"}
                size="sm"
                onClick={() => setContinuousVoiceMode(!isContinuousVoiceMode)}
                className="px-3 py-1"
              >
                {isContinuousVoiceMode ? "Auto-Talk" : "Push-to-Talk"}
              </GlassButton>
            </div>
          )
        }
      ]
    },
    {
      title: "Sync Status",
      icon: Cloud,
      items: [
        {
          label: "Connection Status",
          description: "Real-time sync status with cloud",
          action: (
            <div className="flex items-center gap-2 glass px-3 py-2 rounded-full text-sm">
              <SyncIcon className={`h-4 w-4 ${syncColor}`} />
              <span className={syncColor}>{syncText}</span>
            </div>
          )
        }
      ]
    },
    {
      title: "Data Management",
      icon: Trash2,
      items: [
        {
          label: "Clear Messages",
          description: "Remove all chat history",
          action: (
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={handleClearMessages}
              className="text-destructive hover:text-destructive"
            >
              Clear All
            </GlassButton>
          )
        }
      ]
    },
    {
      title: "Account",
      icon: LogOut,
      items: [
        {
          label: "Sign Out",
          description: "Sign out of your account",
          action: (
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-destructive hover:text-destructive"
            >
              Sign Out
            </GlassButton>
          )
        },
        {
          label: "Delete Account",
          description: "Permanently delete your account and all data",
          action: (
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
          )
        }
      ]
    }
  ];

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 sm:space-y-6 pb-20 pt-8 sm:pt-16 px-3 sm:px-4 h-full overflow-y-auto">
      {/* Profile Picture Upload */}
      <div className="max-w-md mx-auto">
        <GlassCard variant="bubble" className="p-6">
          <div className="flex flex-col items-center">
            <div className="relative">
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
                variant="bubble"
                size="icon"
                className="absolute -bottom-2 -right-2 w-8 h-8"
                onClick={() => document.getElementById('avatar-upload')?.click()}
                disabled={isUploading}
              >
                <Camera className="w-4 h-4" />
              </GlassButton>
            </div>
            <input
              id="avatar-upload"
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
            <p className="text-sm text-muted-foreground mt-2">Click camera to upload profile picture</p>
          </div>
        </GlassCard>
      </div>
      
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-2">Settings</h2>
        <p className="text-muted-foreground">Customize your ArcAI experience</p>
      </div>

      {settings.map((section) => {
        const Icon = section.icon;
        return (
          <div key={section.title}>
            <GlassCard variant="bubble" glow className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="glass rounded-lg p-2">
                  <Icon className="h-5 w-5 text-primary-glow" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {section.title}
                </h3>
              </div>

              <div className="space-y-4">
                {section.items.map((item) => (
                  <div
                    key={item.label}
                    className="glass rounded-lg p-4 space-y-3"
                  >
                    <div className="space-y-2">
                      <p className="font-medium text-foreground text-sm sm:text-base">{item.label}</p>
                      <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                    </div>
                    <div className="w-full">
                      {item.action}
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        );
      })}

      {/* App Info */}
      <div>
        <GlassCard variant="bubble" className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="glass rounded-lg p-2">
              <User className="h-5 w-5 text-primary-glow" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">About ArcAI</h3>
          </div>
          
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>✨ Beautiful glassmorphism interface</p>
            <p>🤖 Powered by OpenAI GPT-5 Nano & Realtime API</p>
            <p>🎙️ Cedar & Marin voice support</p>
            <p>📱 Mobile-first responsive design</p>
            <p>🔒 Secure server-side API handling</p>
          </div>
        </GlassCard>
      </div>

    </div>
  );
}
