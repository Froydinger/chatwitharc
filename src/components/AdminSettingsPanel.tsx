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

  const handleRemoveAdmin = async (id: string, email: string) => {
    if (email === 'j@froydinger.com') {
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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="prompts" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            AI Prompts
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            General
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
                The main prompt that guides the AI's behavior and responses
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="system-prompt">System Prompt</Label>
                <Textarea
                  id="system-prompt"
                  value={getSetting('system_prompt')?.value || ''}
                  onChange={(e) => {
                    const setting = getSetting('system_prompt');
                    if (setting) {
                      handleUpdateSetting('system_prompt', e.target.value);
                    }
                  }}
                  className="min-h-[200px]"
                  placeholder="Enter the system prompt..."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Global Context</CardTitle>
              <CardDescription>
                Additional context that applies to all conversations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="global-context">Global Context</Label>
                <Textarea
                  id="global-context"
                  value={getSetting('global_context')?.value || ''}
                  onChange={(e) => {
                    const setting = getSetting('global_context');
                    if (setting) {
                      handleUpdateSetting('global_context', e.target.value);
                    }
                  }}
                  className="min-h-[150px]"
                  placeholder="Enter global context..."
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Behavior Settings</CardTitle>
              <CardDescription>
                Configure how the AI responds to different types of requests
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Step-by-step Instructions</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically provide step-by-step guidance for wellness checks and similar requests
                  </p>
                </div>
                <Switch
                  checked={getSetting('enable_step_by_step')?.value === 'true'}
                  onCheckedChange={(checked) => {
                    handleUpdateSetting('enable_step_by_step', checked.toString());
                  }}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="max-conversation">Max Conversation Length</Label>
                <Input
                  id="max-conversation"
                  type="number"
                  value={getSetting('max_conversation_length')?.value || ''}
                  onChange={(e) => {
                    handleUpdateSetting('max_conversation_length', e.target.value);
                  }}
                  placeholder="50"
                />
                <p className="text-sm text-muted-foreground">
                  Maximum number of messages before suggesting a new session
                </p>
              </div>
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
                    {user.email !== 'j@froydinger.com' && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRemoveAdmin(user.id, user.email)}
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