import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { Database, Shield, Users, RefreshCw, Trash2, Cloud, UserPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { VirtualFileSystem } from '@/types/ide';
import { DEFAULT_FILES } from '@/types/ide';

interface IDECloudPanelProps {
  files: VirtualFileSystem;
  setFiles: React.Dispatch<React.SetStateAction<VirtualFileSystem>>;
  onChatSend?: (message: string) => void;
  isAgentRunning?: boolean;
  projectId?: string | null;
}

// Detect whether the app's code actually uses netlifyDb
const isDbCodeApplied = (vfs: VirtualFileSystem): boolean => {
  return Object.entries(vfs).some(([path, file]) => {
    if (path === 'src/lib/netlifyDb.ts') return false;
    const c = file.content;
    return (
      c.includes('netlifyDb.collection') ||
      c.includes('netlifyDb.get') ||
      c.includes('netlifyDb.set') ||
      c.includes("from './lib/netlifyDb'") ||
      c.includes('from "./lib/netlifyDb"') ||
      c.includes("from '../lib/netlifyDb'") ||
      c.includes('from "../lib/netlifyDb"')
    );
  });
};

// Detect whether the app's code actually uses Netlify auth
const isAuthCodeApplied = (vfs: VirtualFileSystem): boolean => {
  return Object.entries(vfs).some(([path, file]) => {
    if (path === 'src/components/NetlifyAuthModal.tsx' || path === 'src/lib/netlifyDb.ts') return false;
    const c = file.content;
    return (
      c.includes('NetlifyAuthModal') ||
      c.includes('netlifyDb.auth') ||
      c.includes("from './components/NetlifyAuthModal'") ||
      c.includes('from "./components/NetlifyAuthModal"')
    );
  });
};

export function IDECloudPanel({ files, setFiles, onChatSend, isAgentRunning, projectId }: IDECloudPanelProps) {
  const appId = projectId || 'default';
  const dbPrefix = `netlify_db:${appId}:`;
  const currentUserKey = `netlify_current_user:${appId}`;
  const mockUsersKey = `netlify_mock_users:${appId}`;

  const [authEnabled, setAuthEnabled] = useState(false);
  const [dbEnabled, setDbEnabled] = useState(false);
  const [mockUsers, setMockUsers] = useState<any[]>([]);
  const [dbRecords, setDbRecords] = useState<Record<string, any>>({});
  const [showAddUser, setShowAddUser] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');

  const loadMockData = () => {
    try {
      const currentUser = localStorage.getItem(currentUserKey);
      const storedUsers = localStorage.getItem(mockUsersKey);
      let parsedUsers: any[] = storedUsers ? JSON.parse(storedUsers) : [];

      // Filter out any legacy dummy accounts
      parsedUsers = parsedUsers.filter(u => u?.email && u.email !== 'user@askarc.chat' && u.name !== 'App User');

      if (currentUser) {
        try {
          const cu = JSON.parse(currentUser);
          if (cu?.email && cu.email !== 'user@askarc.chat' && !parsedUsers.some(u => u.email === cu.email)) {
            parsedUsers.unshift({
              id: cu.id || '1',
              email: cu.email,
              name: cu.name || cu.email.split('@')[0],
              role: cu.role || 'User',
              status: 'Active',
              created_at: new Date(cu.created_at || Date.now()).toLocaleDateString()
            });
          }
        } catch {}
      }
      setMockUsers(parsedUsers);

      const records: Record<string, any> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const fullKey = localStorage.key(i);
        if (fullKey && fullKey.startsWith(dbPrefix)) {
          const rawKey = fullKey.slice(dbPrefix.length);
          try {
            records[rawKey] = JSON.parse(localStorage.getItem(fullKey) || 'null');
          } catch {
            records[rawKey] = localStorage.getItem(fullKey);
          }
        }
      }
      setDbRecords(records);
    } catch (e) {
      console.error('Failed to load mock data:', e);
    }
  };

  useEffect(() => {
    setAuthEnabled(isAuthCodeApplied(files));
    setDbEnabled(isDbCodeApplied(files));
    loadMockData();

    const handleStorageOrAuth = (e?: any) => {
      if (!e?.detail || e.detail.appId === undefined || e.detail.appId === appId) {
        loadMockData();
      }
    };
    window.addEventListener('netlify-auth-change', handleStorageOrAuth);
    window.addEventListener('netlify-db-change', handleStorageOrAuth);
    window.addEventListener('storage', handleStorageOrAuth);
    return () => {
      window.removeEventListener('netlify-auth-change', handleStorageOrAuth);
      window.removeEventListener('netlify-db-change', handleStorageOrAuth);
      window.removeEventListener('storage', handleStorageOrAuth);
    };
  }, [files, appId]);

  const saveMockData = (users: any[], db: Record<string, any>) => {
    localStorage.setItem(mockUsersKey, JSON.stringify(users));
    setMockUsers(users);
    setDbRecords(db);
  };

  const handleToggleAuth = () => {
    if (isAgentRunning) {
      toast.error("Agent is currently generating code. Please wait a moment.");
      return;
    }

    if (!authEnabled) {
      // User wants to enable auth: ensure helper components exist in files
      setFiles(prev => {
        const next = { ...prev };
        if (!next['src/lib/netlifyDb.ts']) {
          next['src/lib/netlifyDb.ts'] = DEFAULT_FILES['src/lib/netlifyDb.ts'];
        }
        if (!next['src/components/NetlifyAuthModal.tsx']) {
          next['src/components/NetlifyAuthModal.tsx'] = DEFAULT_FILES['src/components/NetlifyAuthModal.tsx'];
        }
        return next;
      });

      if (onChatSend) {
        toast.success("Instructing Arc to wire up user authentication...");
        onChatSend("Please update the app to add user account authentication and login/signup flow using NetlifyAuthModal and netlifyDb.auth. Show Sign In / Sign Up buttons in the header when logged out, and user avatar / name / Sign Out when logged in. Let logged-in users create and interact with content using their identity.");
      } else {
        toast.success("Injected NetlifyAuthModal component! Ask the chat to wire it into the app.");
      }
    } else {
      // User wants to disable auth
      if (onChatSend) {
        toast.info("Instructing Arc to remove user authentication...");
        onChatSend("Please update the app to remove user authentication and NetlifyAuthModal, making the app open and accessible without needing to log in.");
      } else {
        setFiles(prev => {
          const next = { ...prev };
          delete next['src/components/NetlifyAuthModal.tsx'];
          return next;
        });
        toast.info("Removed NetlifyAuthModal component.");
      }
    }
  };

  const handleToggleDb = () => {
    if (isAgentRunning) {
      toast.error("Agent is currently generating code. Please wait a moment.");
      return;
    }

    if (!dbEnabled) {
      // User wants to enable database: ensure helper exists in files
      setFiles(prev => {
        if (!prev['src/lib/netlifyDb.ts']) {
          return {
            ...prev,
            'src/lib/netlifyDb.ts': DEFAULT_FILES['src/lib/netlifyDb.ts']
          };
        }
        return prev;
      });

      if (onChatSend) {
        toast.success("Instructing Arc to connect persistent database storage...");
        onChatSend("Please connect and wire up netlifyDb persistent database storage for this app. Replace any static mock state or in-memory arrays with netlifyDb.collection() or netlifyDb.get/set so all user data, posts, items, and changes are saved and persist across page reloads.");
      } else {
        toast.success("Injected netlifyDb helper to src/lib/netlifyDb.ts! Ask the chat to wire it into the app.");
      }
    } else {
      // User wants to disable database
      if (onChatSend) {
        toast.info("Instructing Arc to disconnect database storage...");
        onChatSend("Please update the app to disconnect netlifyDb persistent database storage and use standard in-memory React state instead.");
      } else {
        setFiles(prev => {
          const next = { ...prev };
          delete next['src/lib/netlifyDb.ts'];
          return next;
        });
        toast.info("Removed netlifyDb helper.");
      }
    }
  };

  const handleAddUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;

    const email = newEmail.trim().toLowerCase();
    if (mockUsers.some(u => u.email.toLowerCase() === email)) {
      toast.error("User with this email already exists.");
      return;
    }

    const newUser = {
      id: Math.random().toString(36).substring(2, 9),
      email,
      name: newName.trim() || email.split('@')[0],
      role: mockUsers.length === 0 ? 'Admin' : 'User',
      status: 'Active',
      created_at: new Date().toLocaleDateString(),
    };

    const next = [newUser, ...mockUsers];
    saveMockData(next, dbRecords);
    setNewEmail('');
    setNewName('');
    setShowAddUser(false);
    toast.success(`User ${newUser.email} created in sandbox registry!`);
  };

  const deleteUser = (id: string) => {
    const next = mockUsers.filter(u => u.id !== id);
    saveMockData(next, dbRecords);
    toast.success("User deleted from registry");
  };

  const deleteDbRecord = (key: string) => {
    const next = { ...dbRecords };
    delete next[key];
    localStorage.removeItem(`${dbPrefix}${key}`);
    saveMockData(mockUsers, next);
    toast.success("Record deleted");
  };

  return (
    <div className="p-5 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Cloud className="h-4 w-4 text-primary" /> Netlify Cloud & Database
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Manage user accounts, persistence collections, and credentials</p>
        </div>
        <Button size="sm" variant="outline" onClick={loadMockData} className="gap-1.5 rounded-xl border-white/10 hover:bg-white/5">
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Auth Config */}
        <GlassCard className="p-4 border-white/10 bg-[#0f1117]/60 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Shield className="h-4 w-4 text-primary" /> User Accounts & Auth
            </span>
            <Button 
              size="sm" 
              variant={authEnabled ? "default" : "outline"}
              onClick={handleToggleAuth}
              disabled={isAgentRunning}
              className={cn(
                "h-8 rounded-xl transition-all gap-1.5",
                authEnabled
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border-white/10 hover:bg-white/5 text-muted-foreground hover:text-foreground"
              )}
            >
              {isAgentRunning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {authEnabled ? "Enabled" : "Enable"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Injects <code>NetlifyAuthModal.tsx</code> custom dialog component. Toggling requests Arc to wire up login/signup in your code.
          </p>
        </GlassCard>

        {/* Database Config */}
        <GlassCard className="p-4 border-white/10 bg-[#0f1117]/60 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Database className="h-4 w-4 text-primary" /> Lightweight Database SDK
            </span>
            <Button 
              size="sm" 
              variant={dbEnabled ? "default" : "outline"}
              onClick={handleToggleDb}
              disabled={isAgentRunning}
              className={cn(
                "h-8 rounded-xl transition-all gap-1.5",
                dbEnabled
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border-white/10 hover:bg-white/5 text-muted-foreground hover:text-foreground"
              )}
            >
              {isAgentRunning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {dbEnabled ? "Enabled" : "Enable"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Injects <code>netlifyDb.ts</code> helper with collections and CRUD. Toggling requests Arc to wire persistent storage into your code.
          </p>
        </GlassCard>
      </div>

      {/* Cloud Manager Dashboard View */}
      <GlassCard className="border-white/10 bg-[#0f1117]/60 overflow-hidden">
        <div className="bg-white/5 border-b border-white/10 px-4 py-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 text-foreground">
            <Users className="h-3.5 w-3.5 text-primary" /> App User Accounts
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">{mockUsers.length} registered</span>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setShowAddUser(!showAddUser)}
              className="h-6 px-2 text-[10px] rounded-lg gap-1 border-white/10"
            >
              <UserPlus className="h-3 w-3" /> Add Account
            </Button>
          </div>
        </div>

        {showAddUser && (
          <form onSubmit={handleAddUserSubmit} className="p-3 bg-white/[0.02] border-b border-white/10 flex flex-wrap gap-2 items-center">
            <input 
              type="text"
              placeholder="Name (e.g. Alex)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="h-8 px-2.5 rounded-lg bg-white/5 border border-white/10 text-xs text-foreground focus:outline-none focus:border-primary flex-1 min-w-[120px]"
            />
            <input 
              type="email"
              required
              placeholder="Email (e.g. user@app.com)"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              className="h-8 px-2.5 rounded-lg bg-white/5 border border-white/10 text-xs text-foreground focus:outline-none focus:border-primary flex-1 min-w-[160px]"
            />
            <Button type="submit" size="sm" className="h-8 text-xs rounded-lg px-3">
              Save Account
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddUser(false)} className="h-8 text-xs rounded-lg px-2 text-muted-foreground">
              Cancel
            </Button>
          </form>
        )}

        <div className="divide-y divide-white/5">
          {mockUsers.length > 0 ? (
            mockUsers.map((user) => (
              <div key={user.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-primary/20 text-primary font-bold text-[11px] flex items-center justify-center border border-primary/30 uppercase">
                    {user.name ? user.name.slice(0, 2) : user.email.slice(0, 2)}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{user.name || user.email}</p>
                    <p className="text-[10px] text-muted-foreground">{user.email} • Joined {user.created_at}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-mono">{user.role}</span>
                  <button onClick={() => deleteUser(user.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-6 text-center text-xs text-muted-foreground">No registered users in this app yet.</div>
          )}
        </div>
      </GlassCard>

      <GlassCard className="border-white/10 bg-[#0f1117]/60 overflow-hidden">
        <div className="bg-white/5 border-b border-white/10 px-4 py-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 text-foreground">
            <Database className="h-3.5 w-3.5 text-primary" /> Database Records & Collections
          </span>
          <span className="text-[10px] text-muted-foreground">{Object.keys(dbRecords).length} keys</span>
        </div>
        <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto">
          {Object.keys(dbRecords).length > 0 ? (
            Object.entries(dbRecords).map(([key, val]) => (
              <div key={key} className="px-4 py-2.5 flex items-center justify-between text-xs">
                <div className="font-mono text-[11px] text-primary truncate max-w-[200px] sm:max-w-xs">
                  {key}
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-muted-foreground bg-white/5 px-2 py-0.5 rounded text-[10px] max-w-[240px] truncate">
                    {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                  </span>
                  <button onClick={() => deleteDbRecord(key)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-6 text-center text-xs text-muted-foreground">No records saved in the database yet.</div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

