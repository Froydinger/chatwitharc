import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { Database, Shield, Users, RefreshCw, Trash2, Key, ToggleLeft, ToggleRight, Sparkles, Cloud, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { VirtualFileSystem } from '@/types/ide';
import { DEFAULT_FILES } from '@/types/ide';

interface IDECloudPanelProps {
  files: VirtualFileSystem;
  setFiles: React.Dispatch<React.SetStateAction<VirtualFileSystem>>;
}

export function IDECloudPanel({ files, setFiles }: IDECloudPanelProps) {
  const [authEnabled, setAuthEnabled] = useState(false);
  const [dbEnabled, setDbEnabled] = useState(false);
  const [mockUsers, setMockUsers] = useState<any[]>([]);
  const [dbRecords, setDbRecords] = useState<Record<string, any>>({});
  const [showAddUser, setShowAddUser] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    // Check if auth component or database helper exists in files
    setAuthEnabled(!!files['src/components/NetlifyAuthModal.tsx']);
    setDbEnabled(!!files['src/lib/netlifyDb.ts']);
    loadMockData();
  }, [files]);

  const loadMockData = () => {
    try {
      const storedUsers = localStorage.getItem('netlify_mock_users');
      const parsedUsers = storedUsers ? JSON.parse(storedUsers) : [
        { id: '1', email: 'jake@askarc.chat', name: 'Jake', role: 'Admin', status: 'Active', created_at: new Date().toLocaleDateString() },
        { id: '2', email: 'guest@askarc.chat', name: 'Guest', role: 'User', status: 'Active', created_at: new Date().toLocaleDateString() }
      ];
      setMockUsers(parsedUsers);

      const records: Record<string, any> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const fullKey = localStorage.key(i);
        if (fullKey && fullKey.startsWith('netlify_db:')) {
          const rawKey = fullKey.replace('netlify_db:', '');
          try {
            records[rawKey] = JSON.parse(localStorage.getItem(fullKey) || 'null');
          } catch {
            records[rawKey] = localStorage.getItem(fullKey);
          }
        }
      }
      const legacyDb = localStorage.getItem('netlify_mock_db');
      if (legacyDb) {
        try {
          Object.assign(records, JSON.parse(legacyDb));
        } catch {}
      }

      if (Object.keys(records).length === 0) {
        records['settings:theme'] = 'dark';
        records['dashboard:stats'] = { visitors: 1420, conversions: 88 };
      }
      setDbRecords(records);
    } catch (e) {
      console.error('Failed to load mock data:', e);
    }
  };

  const saveMockData = (users: any[], db: Record<string, any>) => {
    localStorage.setItem('netlify_mock_users', JSON.stringify(users));
    localStorage.setItem('netlify_mock_db', JSON.stringify(db));
    setMockUsers(users);
    setDbRecords(db);
  };

  const handleToggleAuth = () => {
    if (!authEnabled) {
      setFiles(prev => ({
        ...prev,
        'src/components/NetlifyAuthModal.tsx': DEFAULT_FILES['src/components/NetlifyAuthModal.tsx']
      }));
      toast.success("Injected Netlify Authentication widget to src/components/NetlifyAuthModal.tsx!");
    } else {
      setFiles(prev => {
        const next = { ...prev };
        delete next['src/components/NetlifyAuthModal.tsx'];
        return next;
      });
      toast.error("Removed Netlify Authentication widget.");
    }
    setAuthEnabled(!authEnabled);
  };

  const handleToggleDb = () => {
    if (!dbEnabled) {
      setFiles(prev => ({
        ...prev,
        'src/lib/netlifyDb.ts': DEFAULT_FILES['src/lib/netlifyDb.ts']
      }));
      toast.success("Injected netlifyDb helper to src/lib/netlifyDb.ts!");
    } else {
      setFiles(prev => {
        const next = { ...prev };
        delete next['src/lib/netlifyDb.ts'];
        return next;
      });
      toast.error("Removed netlifyDb helper.");
    }
    setDbEnabled(!dbEnabled);
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
    localStorage.removeItem(`netlify_db:${key}`);
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
              className="h-8 rounded-xl"
            >
              {authEnabled ? "Enabled" : "Enable"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Injects <code>NetlifyAuthModal.tsx</code> custom dialog component. Enables user sign-in, account creation, and user-scoped data.
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
              className="h-8 rounded-xl"
            >
              {dbEnabled ? "Enabled" : "Enable"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Injects <code>netlifyDb.ts</code> helper with collections, CRUD operations, and user auth state. Works in preview and deployed apps.
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

