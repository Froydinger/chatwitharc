import { useState, useEffect, useCallback } from 'react';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Shield, Settings, Users, MessageSquare, Trash2, Crown, Search, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
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
} from '@/components/ui/alert-dialog';

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  display_name: string | null;
  avatar_url: string | null;
  preferred_model: string | null;
  is_admin: boolean;
  admin_role: string | null;
  is_primary_admin: boolean;
}

export function AdminPanel() {
  const { isAdmin, loading: adminLoading } = useAdminAccess();
  const { settings, loading, updating, updateSetting, getSetting } = useAdminSettings();
  const { toast } = useToast();
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchUsers = useCallback(async () => {
    if (!supabase) return;
    setUsersLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'list', perPage: 100 },
      });
      if (error) throw error;
      setUsers(data.users || []);
    } catch (err: any) {
      console.error('Failed to fetch users:', err);
      toast({ title: 'Error', description: 'Failed to load users', variant: 'destructive' });
    } finally {
      setUsersLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isAdmin && !adminLoading) {
      fetchUsers();
    }
  }, [isAdmin, adminLoading, fetchUsers]);

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
            <CardDescription>You don't have permission to access the admin panel.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleSave = async (key: string) => {
    try {
      const value = localValues[key] || getSetting(key);
      await updateSetting(key, value);
      toast({ title: 'Settings updated', description: 'The setting has been saved successfully.' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update setting.', variant: 'destructive' });
    }
  };

  const handleValueChange = (key: string, value: string) => {
    setLocalValues(prev => ({ ...prev, [key]: value }));
  };

  const getCurrentValue = (key: string) => {
    return localValues[key] !== undefined ? localValues[key] : getSetting(key);
  };

  const handleToggleAdmin = async (user: AdminUser) => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'toggle_admin', userId: user.id, email: user.email },
      });
      if (error) throw error;
      toast({
        title: data.isAdmin ? 'Admin added' : 'Admin removed',
        description: `${user.display_name || user.email} ${data.isAdmin ? 'is now an admin' : 'is no longer an admin'}`,
      });
      fetchUsers();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to toggle admin', variant: 'destructive' });
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'delete', userId: user.id },
      });
      if (error) throw error;
      toast({ title: 'User deleted', description: `${user.display_name || user.email} has been removed` });
      fetchUsers();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to delete user', variant: 'destructive' });
    }
  };

  const filteredUsers = users.filter(u => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (u.email?.toLowerCase().includes(q)) || (u.display_name?.toLowerCase().includes(q));
  });

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="w-8 h-8 text-primary" />
          Admin Panel
        </h1>
        <p className="text-muted-foreground mt-2">Manage system settings, users, and configuration</p>
      </div>

      <Tabs defaultValue="users" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            System
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            AI Config
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>User Management</CardTitle>
                  <CardDescription>{users.length} total users</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchUsers} disabled={usersLoading}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${usersLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredUsers.map(user => (
                    <div
                      key={user.id}
                      className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback>{(user.display_name || user.email || '?')[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground truncate">{user.display_name || 'No name'}</p>
                          {user.is_primary_admin && (
                            <Badge variant="default" className="text-xs"><Crown className="w-3 h-3 mr-1" />Owner</Badge>
                          )}
                          {user.is_admin && !user.is_primary_admin && (
                            <Badge variant="secondary" className="text-xs"><Shield className="w-3 h-3 mr-1" />Admin</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                        <p className="text-xs text-muted-foreground">
                          Joined {new Date(user.created_at).toLocaleDateString()}
                          {user.last_sign_in_at && ` · Last seen ${new Date(user.last_sign_in_at).toLocaleDateString()}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!user.is_primary_admin && (
                          <>
                            <Button
                              variant={user.is_admin ? 'secondary' : 'outline'}
                              size="sm"
                              onClick={() => handleToggleAdmin(user)}
                            >
                              <Shield className="w-3 h-3 mr-1" />
                              {user.is_admin ? 'Remove Admin' : 'Make Admin'}
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm">
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete User</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete {user.display_name || user.email} and all their data. This cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteUser(user)}>Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {filteredUsers.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No users found</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Configure global application settings</CardDescription>
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
                <p className="text-sm text-muted-foreground">Maximum number of messages before suggesting a new session</p>
                <Button onClick={() => handleSave('max_conversation_length')} disabled={updating} size="sm">Save</Button>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="enable_step_by_step">Enable Step-by-Step Instructions</Label>
                  <Switch
                    id="enable_step_by_step"
                    checked={getCurrentValue('enable_step_by_step') === 'true'}
                    onCheckedChange={(checked) => handleValueChange('enable_step_by_step', checked ? 'true' : 'false')}
                  />
                </div>
                <Button onClick={() => handleSave('enable_step_by_step')} disabled={updating} size="sm">Save</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>AI System Prompt</CardTitle>
              <CardDescription>Configure the system prompt that guides AI behavior.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="system_prompt">System Prompt</Label>
                <Textarea
                  id="system_prompt"
                  value={getCurrentValue('system_prompt')}
                  onChange={(e) => handleValueChange('system_prompt', e.target.value)}
                  placeholder="Enter the system prompt..."
                  rows={12}
                  className="font-mono text-sm"
                />
                <Button onClick={() => handleSave('system_prompt')} disabled={updating} size="sm">Save System Prompt</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
