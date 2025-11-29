import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Settings, Users, MessageSquare, Trash2, Plus, Megaphone, Construction, AlertTriangle, PartyPopper } from 'lucide-react';
import { useAdminSettings } from '@/hooks/useAdminSettings';
import { toast } from '@/hooks/use-toast';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

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
  const [bannerEnabled, setBannerEnabled] = useState(false);
  const [bannerMessage, setBannerMessage] = useState('');
  const [bannerIcon, setBannerIcon] = useState<'construction' | 'alert' | 'celebrate'>('alert');

  const getSetting = (key: string) => settings.find(s => s.key === key);

  // Initialize drafts when settings load
  useEffect(() => {
    if (settings.length > 0 && !systemPromptDraft) {
      const systemPrompt = getSetting('system_prompt')?.value || '';
      const globalContext = getSetting('global_context')?.value || '';
      // Merge system prompt and global context
      const mergedPrompt = globalContext ? `${systemPrompt}\n\n--- Global Context ---\n${globalContext}` : systemPrompt;
      setSystemPromptDraft(mergedPrompt);
    }
  }, [settings, systemPromptDraft]);

  useEffect(() => {
    if (settings.length > 0 && !imageRestrictionsDraft) {
      const imageRestrictions = getSetting('image_restrictions')?.value || '';
      setImageRestrictionsDraft(imageRestrictions);
    }
  }, [settings, imageRestrictionsDraft]);

  // Initialize banner settings when settings load
  useEffect(() => {
    if (settings.length > 0) {
      const enabled = getSetting('banner_enabled')?.value === 'true';
      const message = getSetting('banner_message')?.value || '';
      const icon = (getSetting('banner_icon')?.value || 'alert') as 'construction' | 'alert' | 'celebrate';

      setBannerEnabled(enabled);
      setBannerMessage(message);
      setBannerIcon(icon);
    }
  }, [settings]);

  // Early returns AFTER all hooks
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

  const handleUpdateBanner = async () => {
    try {
      setUpdating(true);
      await updateSetting('banner_enabled', bannerEnabled.toString(), 'Enable or disable the admin announcement banner');
      await updateSetting('banner_message', bannerMessage, 'Message to display in the admin banner');
      await updateSetting('banner_icon', bannerIcon, 'Icon to display in the banner (construction, alert, or celebrate)');
      toast({
        title: "Banner updated",
        description: "The announcement banner has been successfully updated.",
      });
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Failed to update banner",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6" />
        <h1 className="text-2xl sm:text-3xl font-bold">Admin Settings</h1>
      </div>

      <Tabs defaultValue="prompts" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="prompts" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">AI Prompts</span>
            <span className="sm:hidden">Prompts</span>
          </TabsTrigger>
          <TabsTrigger value="banner" className="flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            <span className="hidden sm:inline">Banner</span>
            <span className="sm:hidden">Banner</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Admin Users</span>
            <span className="sm:hidden">Users</span>
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

        <TabsContent value="banner" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Announcement Banner</CardTitle>
              <CardDescription>
                Create a site-wide banner for announcements, maintenance notices, or celebrations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="banner-enabled" className="text-base">Enable Banner</Label>
                  <p className="text-sm text-muted-foreground">
                    Show the announcement banner across the entire app
                  </p>
                </div>
                <Switch
                  id="banner-enabled"
                  checked={bannerEnabled}
                  onCheckedChange={setBannerEnabled}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="banner-message">Banner Message</Label>
                <Textarea
                  id="banner-message"
                  value={bannerMessage}
                  onChange={(e) => setBannerMessage(e.target.value)}
                  placeholder="Enter your announcement message..."
                  className="min-h-[100px]"
                />
                <p className="text-xs text-muted-foreground">
                  This message will be displayed in the banner when enabled
                </p>
              </div>

              <div className="space-y-3">
                <Label>Banner Icon</Label>
                <RadioGroup value={bannerIcon} onValueChange={(value) => setBannerIcon(value as 'construction' | 'alert' | 'celebrate')}>
                  <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                    <RadioGroupItem value="construction" id="icon-construction" />
                    <Label htmlFor="icon-construction" className="flex items-center gap-2 cursor-pointer flex-1">
                      <Construction className="h-5 w-5" />
                      <div>
                        <p className="font-medium">Construction</p>
                        <p className="text-xs text-muted-foreground">For maintenance or work in progress</p>
                      </div>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                    <RadioGroupItem value="alert" id="icon-alert" />
                    <Label htmlFor="icon-alert" className="flex items-center gap-2 cursor-pointer flex-1">
                      <AlertTriangle className="h-5 w-5" />
                      <div>
                        <p className="font-medium">Alert</p>
                        <p className="text-xs text-muted-foreground">For important announcements or warnings</p>
                      </div>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                    <RadioGroupItem value="celebrate" id="icon-celebrate" />
                    <Label htmlFor="icon-celebrate" className="flex items-center gap-2 cursor-pointer flex-1">
                      <PartyPopper className="h-5 w-5" />
                      <div>
                        <p className="font-medium">Celebrate</p>
                        <p className="text-xs text-muted-foreground">For positive announcements or events</p>
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {bannerEnabled && bannerMessage && (
                <div className="space-y-2">
                  <Label>Preview</Label>
                  <div className="bg-[#00f0ff] border-2 border-black rounded-lg p-4 shadow-lg">
                    <div className="flex items-center justify-center gap-3 text-black">
                      {bannerIcon === 'construction' && <Construction className="w-5 h-5 flex-shrink-0" />}
                      {bannerIcon === 'alert' && <AlertTriangle className="w-5 h-5 flex-shrink-0" />}
                      {bannerIcon === 'celebrate' && <PartyPopper className="w-5 h-5 flex-shrink-0" />}
                      <p className="text-sm md:text-base font-semibold text-center">
                        {bannerMessage}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Button
                onClick={handleUpdateBanner}
                disabled={updating}
                className="w-full"
              >
                Save Banner Settings
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