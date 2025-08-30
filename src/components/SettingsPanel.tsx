import { useState } from "react";
import { motion } from "framer-motion";
import { Trash2, User, LogOut, AlertTriangle } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { useArcStore } from "@/store/useArcStore";
import { useAuth } from "@/hooks/useAuth";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProfileManager } from "@/components/ProfileManager";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
    clearAllSessions
  } = useArcStore();
  const { user, profile } = useAuth();
  const { updateProfile, updating } = useProfile();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  

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

  const settings = [
    {
      title: "Personal Information",
      icon: User,
      items: [
        {
          label: "Your Name",
          description: "How Arc should address you",
          action: (
            <Input
              value={profile?.display_name || ""}
              onChange={(e) => updateProfile({ display_name: e.target.value })}
              placeholder="Enter your name"
              className="w-40 glass border-glass-border text-sm"
              disabled={updating}
            />
          )
        },
        {
          label: "Context & Preferences", 
          description: "Tell Arc about yourself and your needs",
          action: (
            <Textarea
              value={profile?.context_info || ""}
              onChange={(e) => updateProfile({ context_info: e.target.value })}
              placeholder="I'm interested in... I prefer... I'm working on..."
              className="w-full glass border-glass-border text-sm min-h-[80px] resize-none"
              disabled={updating}
            />
          ),
          fullWidth: true
        },
        {
          label: "Email Address",
          description: "Your account email",
          action: (
            <div className="text-sm text-muted-foreground font-mono bg-glass/30 px-3 py-2 rounded-md">
              {user?.email || "No email"}
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
    <div className="w-full max-w-2xl mx-auto space-y-6 pb-8 pt-16 px-4 h-full overflow-y-auto">
      {/* Profile Manager */}
      <ProfileManager />
      
      <motion.div
        initial={{ opacity: 0, y: 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="text-center mb-8"
      >
        <h2 className="text-2xl font-bold text-foreground mb-2">Settings</h2>
        <p className="text-muted-foreground">Customize your ArcAI experience</p>
      </motion.div>

      {settings.map((section, sectionIndex) => {
        const Icon = section.icon;
        
        return (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ 
              duration: 0.6, 
              ease: "easeOut",
              delay: sectionIndex * 0.1 
            }}
          >
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
                {section.items.map((item, itemIndex) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, x: 0 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ 
                      duration: 0.5, 
                      ease: "easeOut",
                      delay: (sectionIndex * 0.1) + (itemIndex * 0.05) 
                    }}
                    className={`glass rounded-lg p-4 ${
                      item.fullWidth ? 'space-y-3' : 'flex items-center justify-between'
                    }`}
                  >
                    <div className={item.fullWidth ? 'space-y-2' : 'flex-1'}>
                      <p className="font-medium text-foreground">{item.label}</p>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                    <div className={item.fullWidth ? 'w-full' : 'ml-4'}>
                      {item.action}
                    </div>
                  </motion.div>
                ))}
              </div>
            </GlassCard>
          </motion.div>
        );
      })}

      {/* App Info */}
      <motion.div
        initial={{ opacity: 0, y: 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.4 }}
      >
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
      </motion.div>

    </div>
  );
}