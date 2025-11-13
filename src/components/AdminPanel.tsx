import { useState } from 'react';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { useAdminSettings } from '@/hooks/useAdminSettings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Settings, Users, MessageSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function AdminPanel() {
  const { isAdmin, loading: adminLoading } = useAdminAccess();
  const { settings, loading, updating, updateSetting, getSetting } = useAdminSettings();
  const { toast } = useToast();
  const [localValues, setLocalValues] = useState<Record<string, string>>({});

  if (adminLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardHeader className="text-center">
            <Shield className="w-12 h-12 mx-auto text-destructive mb-4" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access the admin panel.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleSave = async (key: string) => {
    try {
      const value = localValues[key] || getSetting(key);
      await updateSetting(key, value);
      toast({
        title: "Settings updated",
        description: "The setting has been saved successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update setting. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleValueChange = (key: string, value: string) => {
    setLocalValues(prev => ({ ...prev, [key]: value }));
  };

  const getCurrentValue = (key: string) => {
    return localValues[key] !== undefined ? localValues[key] : getSetting(key);
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="w-8 h-8 text-primary" />
          Admin Panel
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage system settings and configuration
        </p>
      </div>

      <Tabs defaultValue="system" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="system" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            System Settings
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            AI Configuration
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            User Management
          </TabsTrigger>
        </TabsList>

        <TabsContent value="system" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>
                Configure global application settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="max_conversation_length">Max Conversation Length</Label>
                <Input
                  id="max_conversation_length"
                  type="number"
                  value={getCurrentValue('max_conversation_length')}
                  onChange={(e) => handleValueChange('max_conversation_length', e.target.value)}
                  placeholder="50"
                />
                <p className="text-sm text-muted-foreground">
                  Maximum number of messages before suggesting a new session
                </p>
                <Button 
                  onClick={() => handleSave('max_conversation_length')}
                  disabled={updating}
                  size="sm"
                >
                  Save
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="enable_step_by_step">Enable Step-by-Step Instructions</Label>
                  <Switch
                    id="enable_step_by_step"
                    checked={getCurrentValue('enable_step_by_step') === 'true'}
                    onCheckedChange={(checked) => 
                      handleValueChange('enable_step_by_step', checked ? 'true' : 'false')
                    }
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Automatically provide step-by-step guidance for wellness checks and similar requests
                </p>
                <Button 
                  onClick={() => handleSave('enable_step_by_step')}
                  disabled={updating}
                  size="sm"
                >
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>AI System Prompt</CardTitle>
              <CardDescription>
                Configure the system prompt that guides AI behavior. This includes both system instructions and global context.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="system_prompt">System Prompt</Label>
                <Textarea
                  id="system_prompt"
                  value={getCurrentValue('system_prompt')}
                  onChange={(e) => handleValueChange('system_prompt', e.target.value)}
                  placeholder="Enter the system prompt for the AI assistant, including any global context..."
                  rows={12}
                  className="font-mono text-sm"
                />
                <p className="text-sm text-muted-foreground">
                  This prompt defines how the AI assistant behaves and responds to users. Include both behavior instructions and any context that should apply to all conversations.
                </p>
                <Button 
                  onClick={() => handleSave('system_prompt')}
                  disabled={updating}
                  size="sm"
                >
                  Save System Prompt
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Admin Users</CardTitle>
              <CardDescription>
                Manage admin access and permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Badge variant="secondary" className="mb-4">
                  Current Admin: j@froydinger.com
                </Badge>
                <p className="text-sm text-muted-foreground">
                  Additional admin management features coming soon. Contact the primary admin to add new users.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}