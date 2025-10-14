import { useState } from "react";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ProfileManager() {
  const { profile, updateProfile } = useProfile();
  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleProfileUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    
    setIsUpdating(true);
    try {
      await updateProfile({
        display_name: formData.get('display_name') as string,
        context_info: formData.get('context_info') as string,
      });

      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully!"
      });
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: "Update failed",
        description: "Failed to update profile. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      <GlassCard variant="bubble" className="p-6">
        <h2 className="text-xl font-semibold text-foreground mb-6">Profile Settings</h2>

        {/* Profile Form */}
        <form onSubmit={handleProfileUpdate} className="space-y-4">
          <div>
            <Label htmlFor="display_name">Display Name</Label>
            <Input
              id="display_name"
              name="display_name"
              defaultValue={profile?.display_name || ''}
              placeholder="Your display name"
              className="glass border-0 bg-glass/30"
            />
          </div>

          <div>
            <Label htmlFor="context_info">Context & Preferences</Label>
            <Textarea
              id="context_info"
              name="context_info"
              defaultValue={profile?.context_info || ''}
              placeholder="Tell ArcAI about yourself, your preferences, goals, or any context that helps personalize your experience..."
              className="glass border-0 bg-glass/30 min-h-20"
              rows={4}
            />
            <p className="text-xs text-muted-foreground mt-1">
              This helps ArcAI provide more personalized responses
            </p>
          </div>

          <GlassButton
            type="submit"
            disabled={isUpdating}
            className="w-full"
          >
            {isUpdating ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Updating...
              </>
            ) : (
              'Update Profile'
            )}
          </GlassButton>
        </form>
      </GlassCard>
    </div>
  );
}