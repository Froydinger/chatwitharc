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
  const [globalContextDraft, setGlobalContextDraft] = useState('');
  const [imageAnalysisPromptDraft, setImageAnalysisPromptDraft] = useState('');

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
  if (settings.length > 0 && !systemPromptDraft && !globalContextDraft && !imageAnalysisPromptDraft) {
    const systemPrompt = getSetting('system_prompt')?.value || '';
    const globalContext = getSetting('global_context')?.value || '';
    const imageAnalysisPrompt = getSetting('image_analysis_prompt')?.value || `Analyze this prompt and respond with ONLY "image" or "text" based on whether the user wants image generation or text response:

Rules for detecting IMAGE requests:
- Visual creation keywords: create, generate, make, draw, design, show, visualize, render, produce, illustrate
- Visual objects: image, photo, picture, art, illustration, diagram, chart, graphic, banner, logo, icon, wallpaper
- Art styles: realistic, cartoon, abstract, minimalist, watercolor, oil painting, sketch, digital art, 3D render
- Descriptive phrases: "I want to see", "Can you show me", "What would look like", "Picture this", "Imagine a"
- Visual concepts: landscape, portrait, scene, background, character, building, object
- Style descriptors: colorful, detailed, bright, dark, vibrant, soft, hard, smooth, rough

Be VERY inclusive - even subtle visual requests should return "image"
If they want text responses, explanations, conversations, or anything non-visual → respond "text"`;
    
    setSystemPromptDraft(systemPrompt);
    setGlobalContextDraft(globalContext);
    setImageAnalysisPromptDraft(imageAnalysisPrompt);
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
                The main prompt that guides the AI's behavior and responses
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="system-prompt">System Prompt</Label>
                <Textarea
                  id="system-prompt"
                  value={systemPromptDraft || getSetting('system_prompt')?.value || ''}
                  onChange={(e) => setSystemPromptDraft(e.target.value)}
                  className="min-h-[200px]"
                  placeholder="Enter the system prompt..."
                />
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
              <CardTitle>Image Analysis Prompt</CardTitle>
              <CardDescription>
                The prompt used to analyze user messages and determine if they want image generation. Include keywords and phrases to improve detection accuracy.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="image-analysis-prompt">Image Analysis Prompt</Label>
                <Textarea
                  id="image-analysis-prompt"
                  value={imageAnalysisPromptDraft || getSetting('image_analysis_prompt')?.value || ''}
                  onChange={(e) => setImageAnalysisPromptDraft(e.target.value)}
                  className="min-h-[300px]"
                  placeholder="Enter the image analysis prompt..."
                />
              </div>
              <div className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
                <strong>Recommended keywords to include:</strong>
                <br />• Visual creation: create, generate, make, draw, design, show, visualize, render, produce, illustrate
                <br />• Visual objects: image, photo, picture, art, illustration, diagram, chart, graphic, banner, logo, icon
                <br />• Art styles: realistic, cartoon, abstract, minimalist, watercolor, oil painting, sketch, digital art
                <br />• Phrases: "I want to see", "Can you show me", "What would look like", "Picture this", "Imagine a"
              </div>
              <Button 
                onClick={() => handleUpdateSetting('image_analysis_prompt', imageAnalysisPromptDraft)}
                disabled={updating}
                className="w-full"
              >
                Save Image Analysis Prompt
              </Button>
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
                  value={globalContextDraft || getSetting('global_context')?.value || ''}
                  onChange={(e) => setGlobalContextDraft(e.target.value)}
                  className="min-h-[150px]"
                  placeholder="Enter global context..."
                />
              </div>
              <Button 
                onClick={() => handleUpdateSetting('global_context', globalContextDraft)}
                disabled={updating}
                className="w-full"
              >
                Save Global Context
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