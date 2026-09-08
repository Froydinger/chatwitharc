import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Database, Shield, Users, RefreshCw, Trash2, Cloud, UserPlus, Loader2, Tag, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { VirtualFileSystem } from '@/types/ide';
import { DEFAULT_FILES } from '@/types/ide';
import { supabase } from '@/integrations/supabase/client';

interface IDECloudPanelProps {
  files: VirtualFileSystem;
  setFiles: React.Dispatch<React.SetStateAction<VirtualFileSystem>>;
  onChatSend?: (message: string) => void;
  isAgentRunning?: boolean;
  projectId?: string | null;
  hideBadge?: boolean;
  onToggleHideBadge?: (hide: boolean) => Promise<void>;
  onDeployClick?: () => void;
  isDeployed?: boolean;
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

export function IDECloudPanel({
  files,
  setFiles,
  onChatSend,
  isAgentRunning,
  projectId,
  hideBadge = false,
  onToggleHideBadge,
  onDeployClick,
  isDeployed = false,
}: IDECloudPanelProps) {
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

  const loadMockData = async () => {
    try {
      let parsedUsers: any[] = [];
      const records: Record<string, any> = {};

      // 1. Primary check: mockUsersKey
      const storedUsers = localStorage.getItem(mockUsersKey);
      if (storedUsers) {
        try {
          const list = JSON.parse(storedUsers);
          if (Array.isArray(list)) parsedUsers = list;
        } catch {}
      }

      // 2. Scan all localStorage keys for any mock users or current user or db records
      for (let i = 0; i < localStorage.length; i++) {
        const fullKey = localStorage.key(i);
        if (!fullKey) continue;

        if (fullKey.startsWith('netlify_mock_users:')) {
          try {
            const raw = localStorage.getItem(fullKey);
            const list = raw ? JSON.parse(raw) : [];
            if (Array.isArray(list)) {
              for (const u of list) {
                if (u?.email && u.email !== 'user@askarc.chat' && u.name !== 'App User' && !parsedUsers.some(existing => existing.email === u.email)) {
                  parsedUsers.push(u);
                }
              }
            }
          } catch {}
        } else if (fullKey.startsWith('netlify_current_user:')) {
          try {
            const raw = localStorage.getItem(fullKey);
            const cu = raw ? JSON.parse(raw) : null;
            if (cu?.email && cu.email !== 'user@askarc.chat' && cu.name !== 'App User' && !parsedUsers.some(existing => existing.email === cu.email)) {
              parsedUsers.unshift({
                id: cu.id || Math.random().toString(36).substring(2, 9),
                email: cu.email,
                name: cu.name || cu.email.split('@')[0],
                role: cu.role || 'User',
                status: 'Active',
                created_at: new Date(cu.created_at || Date.now()).toLocaleDateString()
              });
            }
          } catch {}
        } else if (fullKey.startsWith(dbPrefix)) {
          const rawKey = fullKey.slice(dbPrefix.length);
          try {
            records[rawKey] = JSON.parse(localStorage.getItem(fullKey) || 'null');
          } catch {
            records[rawKey] = localStorage.getItem(fullKey);
          }
        } else if (fullKey.startsWith('netlify_db:')) {
          const parts = fullKey.split(':');
          if (parts.length >= 3) {
            const keyAppId = parts[1];
            const rawKey = parts.slice(2).join(':');
            if (keyAppId === 'default' || keyAppId === appId) {
              if (records[rawKey] === undefined) {
                try {
                  records[rawKey] = JSON.parse(localStorage.getItem(fullKey) || 'null');
                } catch {
                  records[rawKey] = localStorage.getItem(fullKey);
                }
              }
            }
          }
        }
      }

      // 3. Cloud fetch: Fetch from Supabase ide_projects versions (handles published sites & cross-device)
      if (projectId && projectId !== 'default') {
        try {
          const { data } = await supabase
            .from('ide_projects')
            .select('versions, netlify_subdomain')
            .eq('id', projectId)
            .maybeSingle();

          if (data?.versions && typeof data.versions === 'object') {
            const v = data.versions as any;
            if (Array.isArray(v.app_users)) {
              for (const u of v.app_users) {
                if (u?.email && u.email !== 'user@askarc.chat' && !parsedUsers.some(existing => existing.email === u.email)) {
                  parsedUsers.push(u);
                }
              }
            }
            if (v.app_db && typeof v.app_db === 'object') {
              for (const [k, val] of Object.entries(v.app_db)) {
                if (records[k] === undefined) {
                  records[k] = val;
                }
              }
            }
          }

          // 4. Also query edge function backend directly by projectId or subdomain
          const sub = (data as any)?.netlify_subdomain;
          const queryParam = projectId ? `projectId=${encodeURIComponent(projectId)}` : `subdomain=${encodeURIComponent(sub || '')}`;
          const res = await fetch(`https://olhptgffasqrmeyqjtrq.supabase.co/functions/v1/app-backend?${queryParam}&action=get-data`);
          if (res.ok) {
            const cloudData = await res.json();
            if (Array.isArray(cloudData?.users)) {
              for (const u of cloudData.users) {
                if (u?.email && u.email !== 'user@askarc.chat' && !parsedUsers.some(existing => existing.email === u.email)) {
                  parsedUsers.push(u);
                }
              }
            }
            if (cloudData?.db && typeof cloudData.db === 'object') {
              for (const [k, val] of Object.entries(cloudData.db)) {
                if (records[k] === undefined) {
                  records[k] = val;
                }
              }
            }
          }
        } catch (e) {
          console.error('[IDECloudPanel] Supabase fetch error:', e);
        }
      }

      // 5. Recover any user records stored inside database collections (e.g. users, profiles, accounts)
      const userCollections = ['collection:users', 'collection:profiles', 'collection:accounts', 'collection:members', 'collection:registered_users'];
      for (const colKey of userCollections) {
        const items = records[colKey];
        if (Array.isArray(items)) {
          for (const item of items) {
            if (item?.email && item.email !== 'user@askarc.chat' && !parsedUsers.some(existing => existing.email === item.email)) {
              parsedUsers.push({
                id: item.id || Math.random().toString(36).substring(2, 9),
                email: item.email,
                name: item.name || item.username || item.fullName || item.email.split('@')[0],
                role: item.role || 'User',
                status: 'Active',
                created_at: item.created_at ? new Date(item.created_at).toLocaleDateString() : new Date().toLocaleDateString(),
              });
            }
          }
        }
      }

      // Filter out dummy test account if any
      parsedUsers = parsedUsers.filter(u => u?.email && u.email !== 'user@askarc.chat' && u.name !== 'App User');

      setMockUsers(parsedUsers);
      setDbRecords(records);

      if (parsedUsers.length > 0) setAuthEnabled(true);
      if (Object.keys(records).length > 0) setDbEnabled(true);

      // Cache locally under current appId
      try {
        localStorage.setItem(mockUsersKey, JSON.stringify(parsedUsers));
        for (const [k, val] of Object.entries(records)) {
          localStorage.setItem(`${dbPrefix}${k}`, JSON.stringify(val));
        }
      } catch {}
    } catch (e) {
      console.error('Failed to load mock data:', e);
    }
  };

  useEffect(() => {
    setAuthEnabled(isAuthCodeApplied(files) || mockUsers.length > 0);
    setDbEnabled(isDbCodeApplied(files) || Object.keys(dbRecords).length > 0);
    void loadMockData();

    const handleStorageOrAuth = () => {
      void loadMockData();
    };

    const handleWindowMessage = (e: MessageEvent) => {
      if (e.data?.source === 'arc-netlify-db') {
        if (e.data.payload?.user || Array.isArray(e.data.payload?.users)) {
          const u = e.data.payload?.user;
          const uList = e.data.payload?.users || [];
          setMockUsers(prev => {
            const next = [...prev];
            for (const item of (Array.isArray(uList) ? uList : [])) {
              if (item?.email && item.email !== 'user@askarc.chat' && !next.some(ex => ex.email === item.email)) {
                next.push(item);
              }
            }
            if (u?.email && u.email !== 'user@askarc.chat' && !next.some(ex => ex.email === u.email)) {
              next.unshift({
                id: u.id || Math.random().toString(36).substring(2, 9),
                email: u.email,
                name: u.name || u.email.split('@')[0],
                role: u.role || 'User',
                status: 'Active',
                created_at: new Date(u.created_at || Date.now()).toLocaleDateString(),
              });
            }
            return next;
          });
        }
        void loadMockData();
      }
    };

    window.addEventListener('netlify-auth-change', handleStorageOrAuth);
    window.addEventListener('netlify-db-change', handleStorageOrAuth);
    window.addEventListener('storage', handleStorageOrAuth);
    window.addEventListener('message', handleWindowMessage);
    return () => {
      window.removeEventListener('netlify-auth-change', handleStorageOrAuth);
      window.removeEventListener('netlify-db-change', handleStorageOrAuth);
      window.removeEventListener('storage', handleStorageOrAuth);
      window.removeEventListener('message', handleWindowMessage);
    };
  }, [files, appId, projectId]);

  const saveMockData = async (users: any[], db: Record<string, any>) => {
    localStorage.setItem(mockUsersKey, JSON.stringify(users));
    setMockUsers(users);
    setDbRecords(db);
    window.dispatchEvent(new CustomEvent('netlify-auth-change', { detail: { appId, users } }));
    window.dispatchEvent(new Event('storage'));

    if (projectId && projectId !== 'default') {
      try {
        const { data: existing } = await supabase
          .from('ide_projects')
          .select('versions')
          .eq('id', projectId)
          .maybeSingle();

        const versions = (existing?.versions && typeof existing.versions === 'object') ? existing.versions : {};
        await supabase
          .from('ide_projects')
          .update({
            versions: {
              ...versions,
              app_users: users,
              app_db: db,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', projectId);
      } catch (err) {
        console.error('[IDECloudPanel] Failed to save to Supabase:', err);
      }
    }
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
    <div className="p-3 sm:p-5 space-y-4 sm:space-y-6 max-w-3xl pb-24 sm:pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Cloud className="h-4 w-4 text-purple-400" /> Netlify Cloud & Database
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Manage user accounts, persistence collections, and credentials</p>
        </div>
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={loadMockData} 
          className="gap-1.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 text-xs"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Auth Config */}
        <div className="rounded-2xl border border-white/10 bg-[#12141d]/95 p-4 space-y-3 backdrop-blur-xl shadow-lg">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-white">
              <Shield className="h-4 w-4 text-purple-400" /> User Accounts & Auth
            </span>
            <Button 
              size="sm" 
              variant="ghost"
              onClick={handleToggleAuth}
              disabled={isAgentRunning}
              className={cn(
                "h-8 rounded-xl transition-all gap-1.5 text-xs font-medium",
                authEnabled
                  ? "bg-purple-600 hover:bg-purple-500 text-white border border-purple-400/30 shadow-sm"
                  : "bg-white/5 hover:bg-white/10 text-slate-200 border border-white/15"
              )}
            >
              {isAgentRunning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {authEnabled ? "Enabled" : "Enable"}
            </Button>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Injects <code className="px-1.5 py-0.5 rounded bg-white/10 text-purple-300 border border-white/10 font-mono text-[11px]">NetlifyAuthModal.tsx</code> custom dialog component. Toggling requests Arc to wire up login/signup in your code.
          </p>
        </div>

        {/* Database Config */}
        <div className="rounded-2xl border border-white/10 bg-[#12141d]/95 p-4 space-y-3 backdrop-blur-xl shadow-lg">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-white">
              <Database className="h-4 w-4 text-purple-400" /> Lightweight Database SDK
            </span>
            <Button 
              size="sm" 
              variant="ghost"
              onClick={handleToggleDb}
              disabled={isAgentRunning}
              className={cn(
                "h-8 rounded-xl transition-all gap-1.5 text-xs font-medium",
                dbEnabled
                  ? "bg-purple-600 hover:bg-purple-500 text-white border border-purple-400/30 shadow-sm"
                  : "bg-white/5 hover:bg-white/10 text-slate-200 border border-white/15"
              )}
            >
              {isAgentRunning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {dbEnabled ? "Enabled" : "Enable"}
            </Button>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Injects <code className="px-1.5 py-0.5 rounded bg-white/10 text-purple-300 border border-white/10 font-mono text-[11px]">netlifyDb.ts</code> helper with collections and CRUD. Toggling requests Arc to wire persistent storage into your code.
          </p>
        </div>

        {/* Site Branding & Badge Config */}
        <div className="rounded-2xl border border-white/10 bg-[#12141d]/95 p-4 space-y-3 md:col-span-2 backdrop-blur-xl shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-purple-400" />
              <div>
                <span className="text-sm font-semibold text-white">"Built with ArcAi" Badge</span>
                <span className="ml-2 text-[10px] font-medium text-purple-300 bg-purple-500/15 px-2 py-0.5 rounded-full border border-purple-500/30">Voluntary</span>
              </div>
            </div>
            <Switch
              checked={!hideBadge}
              onCheckedChange={(checked) => {
                if (onToggleHideBadge) {
                  onToggleHideBadge(!checked);
                }
              }}
              className="data-[state=checked]:bg-purple-600 data-[state=unchecked]:bg-white/20 border border-white/20"
            />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <p className="text-xs text-slate-300 leading-relaxed">
              Display a subtle floating glass tag in the bottom corner of your live site linking to ArcAi. You can shut this off voluntarily anytime.
            </p>
            {isDeployed && onDeployClick && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDeployClick}
                className="text-[11px] text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg shrink-0 gap-1 h-7 px-2 border border-purple-500/20"
              >
                <span>Update Live App</span>
                <ExternalLink className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Cloud Manager Dashboard View */}
      <div className="rounded-2xl border border-white/10 bg-[#12141d]/95 overflow-hidden backdrop-blur-xl shadow-lg">
        <div className="bg-white/5 border-b border-white/10 px-4 py-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 text-slate-200">
            <Users className="h-3.5 w-3.5 text-purple-400" /> App User Accounts
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-medium">{mockUsers.length} registered</span>
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={() => setShowAddUser(!showAddUser)}
              className="h-6 px-2.5 text-[11px] rounded-lg gap-1 border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 font-medium"
            >
              <UserPlus className="h-3 w-3 text-purple-400" /> Add Account
            </Button>
          </div>
        </div>

        {showAddUser && (
          <form onSubmit={handleAddUserSubmit} className="p-3 bg-black/40 border-b border-white/10 flex flex-wrap gap-2 items-center">
            <input 
              type="text"
              placeholder="Name (e.g. Alex)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="h-8 px-2.5 rounded-lg bg-[#0b0c10] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500 flex-1 min-w-[120px]"
            />
            <input 
              type="email"
              required
              placeholder="Email (e.g. user@app.com)"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              className="h-8 px-2.5 rounded-lg bg-[#0b0c10] border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500 flex-1 min-w-[160px]"
            />
            <Button type="submit" size="sm" className="h-8 text-xs rounded-lg px-3 bg-purple-600 hover:bg-purple-500 text-white font-medium">
              Save Account
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddUser(false)} className="h-8 text-xs rounded-lg px-2 text-slate-400 hover:text-white">
              Cancel
            </Button>
          </form>
        )}

        <div className="divide-y divide-white/5">
          {mockUsers.length > 0 ? (
            mockUsers.map((user) => (
              <div key={user.id} className="px-4 py-3 flex items-center justify-between text-xs hover:bg-white/[0.02] transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-purple-500/20 text-purple-300 font-bold text-[11px] flex items-center justify-center border border-purple-500/30 uppercase">
                    {user.name ? user.name.slice(0, 2) : user.email.slice(0, 2)}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{user.name || user.email}</p>
                    <p className="text-[10px] text-slate-400">{user.email} • Joined {user.created_at}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/25 text-[10px] font-mono">{user.role}</span>
                  <button onClick={() => deleteUser(user.id)} className="text-slate-400 hover:text-red-400 transition-colors p-1" title="Delete user">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-slate-400 font-medium">No registered users in this app yet.</div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#12141d]/95 overflow-hidden backdrop-blur-xl shadow-lg">
        <div className="bg-white/5 border-b border-white/10 px-4 py-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 text-slate-200">
            <Database className="h-3.5 w-3.5 text-purple-400" /> Database Records & Collections
          </span>
          <span className="text-[11px] text-slate-400 font-medium">{Object.keys(dbRecords).length} keys</span>
        </div>
        <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto">
          {Object.keys(dbRecords).length > 0 ? (
            Object.entries(dbRecords).map(([key, val]) => (
              <div key={key} className="px-4 py-2.5 flex items-center justify-between text-xs hover:bg-white/[0.02] transition-colors">
                <div className="font-mono text-[11px] text-purple-300 font-medium truncate max-w-[200px] sm:max-w-xs">
                  {key}
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-slate-300 bg-white/5 border border-white/10 px-2 py-0.5 rounded text-[10px] max-w-[240px] truncate">
                    {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                  </span>
                  <button onClick={() => deleteDbRecord(key)} className="text-slate-400 hover:text-red-400 transition-colors shrink-0 p-1" title="Delete record">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-slate-400 font-medium">No records saved in the database yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

