import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Settings, Users, MessageSquare, Trash2, Plus } from 'lucide-react';
import { useAdminSettings } from '@/hooks/useAdminSettings';
import { toast } from '@/hooks/use-toast';

export function AdminSettingsPanel() {
  const { 
    settings, 
    adminUsers, 
    isAdmin, 
    loading, 
    updateSetting, 
    addAdminUser, 
    removeAdminUser 
  } = useAdminSettings();
  
  const [updating, setUpdating] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [systemPromptDraft, setSystemPromptDraft] = useState('');
  const [imageRestrictionsDraft, setImageRestrictionsDraft] = useState('');

  if (!isAdmin) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Settings className="mx-auto h-12 w-12 mb-4 opacity-50" />
        <h3 className="text-lg font-medium mb-2">Access Denied</h3>
        <p>You don't have permission to access admin settings.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="mt-2 text-sm text-muted-foreground">Loading admin settings...</p>
      </div>
    );
  }

  const getSetting = (key: string) => settings.find(s => s.key === key);

  // Initialize drafts when settings load
  if (settings.length > 0 && !systemPromptDraft) {
    const systemPrompt = getSetting('system_prompt')?.value || '';
    const globalContext = getSetting('global_context')?.value || '';
    // Merge system prompt and global context
    const mergedPrompt = globalContext ? `${systemPrompt}\n\n--- Global Context ---\n${globalContext}` : systemPrompt;
    setSystemPromptDraft(mergedPrompt);
  }

  if (settings.length > 0 && !imageRestrictionsDraft) {
    const imageRestrictions = getSetting('image_restrictions')?.value || '';
    setImageRestrictionsDraft(imageRestrictions);
  }

  const handleUpdateSetting = async (key: string, value: string) => {
    try {
      setUpdating(true);
      await updateSetting(key, value);
      toast({
        title: "Setting updated",
        description: "The setting has been successfully updated.",
      });
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Failed to update setting",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdminEmail.trim()) return;

    try {
      await addAdminUser(newAdminEmail.trim());
      setNewAdminEmail('');
      toast({
        title: "Admin added",
        description: `${newAdminEmail} has been added as an admin.`,
      });
    } catch (error) {
      toast({
        title: "Failed to add admin",
        description: error instanceof Error ? error.message : "Failed to add admin user",
        variant: "destructive",
      });
    }
  };

  const handleRemoveAdmin = async (id: string, email: string, isPrimaryAdmin: boolean) => {
    if (isPrimaryAdmin) {
      toast({
        title: "Cannot remove",
        description: "Cannot remove the primary admin account.",
        variant: "destructive",
      });
      return;
    }

    try {
      await removeAdminUser(id);
      toast({
        title: "Admin removed",
        description: `${email} has been removed from admin access.`,
      });
    } catch (error) {
      toast({
        title: "Failed to remove admin",
        description: error instanceof Error ? error.message : "Failed to remove admin user",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Settings className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Admin Settings</h1>
      </div>

      <Tabs defaultValue="prompts" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="prompts" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            AI Prompts
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Admin Users
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prompts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>System Prompt</CardTitle>
              <CardDescription>
                The main prompt that guides the AI's behavior and responses. This includes both system instructions and global context.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="system-prompt">System Prompt</Label>
                <Textarea
                  id="system-prompt"
                  value={systemPromptDraft || getSetting('system_prompt')?.value || ''}
                  onChange={(e) => setSystemPromptDraft(e.target.value)}
                  className="min-h-[300px]"
                  placeholder="Enter the system prompt and global context..."
                />
                <p className="text-xs text-muted-foreground">
                  Tip: Include both AI behavior instructions and any global context that should apply to all conversations.
                </p>
              </div>
              <Button 
                onClick={() => handleUpdateSetting('system_prompt', systemPromptDraft)}
                disabled={updating}
                className="w-full"
              >
                Save System Prompt
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Image Generation Restrictions</CardTitle>
              <CardDescription>
                Define negative prompts or content restrictions for image generation (e.g., specific likenesses, buildings, events to exclude).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="image-restrictions">Restrictions / Negative Prompts</Label>
                <Textarea
                  id="image-restrictions"
                  value={imageRestrictionsDraft || getSetting('image_restrictions')?.value || ''}
                  onChange={(e) => setImageRestrictionsDraft(e.target.value)}
                  className="min-h-[150px]"
                  placeholder="Enter image content to exclude (e.g., 'no real people faces, no specific landmarks, no copyrighted characters')..."
                />
                <p className="text-xs text-muted-foreground">
                  These restrictions will be automatically added to all image generation requests.
                </p>
              </div>
              <Button
                onClick={() => handleUpdateSetting('image_restrictions', imageRestrictionsDraft)}
                disabled={updating}
                className="w-full"
              >
                Save Image Restrictions
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Admin Users</CardTitle>
              <CardDescription>
                Manage who has access to admin settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  placeholder="Enter email address..."
                  className="flex-1"
                />
                <Button onClick={handleAddAdmin} disabled={!newAdminEmail.trim()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Admin
                </Button>
              </div>

              <div className="space-y-2">
                {adminUsers.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{user.email}</p>
                      <p className="text-sm text-muted-foreground">Role: {user.role}</p>
                    </div>
                    {!user.is_primary_admin && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRemoveAdmin(user.id, user.email, user.is_primary_admin)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}