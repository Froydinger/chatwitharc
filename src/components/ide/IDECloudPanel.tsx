import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { Database, Shield, Users, RefreshCw, Trash2, Key, ToggleLeft, ToggleRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { VirtualFileSystem } from '@/types/ide';

interface IDECloudPanelProps {
  files: VirtualFileSystem;
  setFiles: React.Dispatch<React.SetStateAction<VirtualFileSystem>>;
}

export function IDECloudPanel({ files, setFiles }: IDECloudPanelProps) {
  const [authEnabled, setAuthEnabled] = useState(false);
  const [dbEnabled, setDbEnabled] = useState(false);
  const [mockUsers, setMockUsers] = useState<any[]>([]);
  const [dbRecords, setDbRecords] = useState<Record<string, any>>({});

  useEffect(() => {
    // Check if auth component or database helper exists in files
    setAuthEnabled(!!files['src/components/NetlifyAuthModal.tsx']);
    setDbEnabled(!!files['src/lib/netlifyDb.ts']);
    loadMockData();
  }, [files]);

  const loadMockData = () => {
    try {
      const storedUsers = localStorage.getItem('netlify_mock_users');
      const storedDb = localStorage.getItem('netlify_mock_db');
      setMockUsers(storedUsers ? JSON.parse(storedUsers) : [
        { id: '1', email: 'jake@askarc.chat', role: 'Admin', status: 'Active', created_at: new Date().toLocaleDateString() },
        { id: '2', email: 'guest@askarc.chat', role: 'User', status: 'Pending', created_at: new Date().toLocaleDateString() }
      ]);
      setDbRecords(storedDb ? JSON.parse(storedDb) : {
        'settings:theme': 'dark',
        'dashboard:stats': { visitors: 1420, conversions: 88 }
      });
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
      // Injects the Custom Authentication Modal component into the virtual file system
      const authModalContent = `import React, { useState } from 'react';

export function NetlifyAuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    // Simulate Netlify Identity Authentication
    const mockUser = { email, token: 'mock-jwt-token' };
    
    // Save to simulated registry
    const users = JSON.parse(localStorage.getItem('netlify_mock_users') || '[]');
    if (!users.some(u => u.email === email)) {
      users.push({
        id: Math.random().toString(36).substring(7),
        email,
        role: 'User',
        status: 'Active',
        created_at: new Date().toLocaleDateString()
      });
      localStorage.setItem('netlify_mock_users', JSON.stringify(users));
    }

    onAuthSuccess(mockUser);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950 p-6 text-white shadow-2xl">
        <h3 className="text-xl font-bold mb-1">{isSignUp ? 'Create Account' : 'Sign In'}</h3>
        <p className="text-xs text-zinc-400 mb-4">Secured via Netlify Identity</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-zinc-400 mb-1">Email</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              placeholder="you@domain.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-zinc-400 mb-1">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              placeholder="••••••••"
            />
          </div>
          <button 
            type="submit" 
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg py-2 text-sm font-semibold transition-colors mt-2"
          >
            {isSignUp ? 'Register' : 'Connect'}
          </button>
        </form>

        <p className="text-xs text-center text-zinc-400 mt-4">
          {isSignUp ? 'Already have an account? ' : 'Need an account? '}
          <button 
            type="button" 
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-purple-400 hover:underline font-semibold"
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
}
`;
      setFiles(prev => ({
        ...prev,
        'src/components/NetlifyAuthModal.tsx': { content: authModalContent }
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
      // Injects simple localStorage KV Database SDK client
      const dbContent = `// Simulated Netlify Blobs Database Client SDK
export const netlifyDb = {
  get: (key: string) => {
    try {
      const db = JSON.parse(localStorage.getItem('netlify_mock_db') || '{}');
      return db[key];
    } catch {
      return null;
    }
  },
  
  set: (key: string, value: any) => {
    try {
      const db = JSON.parse(localStorage.getItem('netlify_mock_db') || '{}');
      db[key] = value;
      localStorage.setItem('netlify_mock_db', JSON.stringify(db));
      
      // Dispatch event to sync IDE panels if running
      window.dispatchEvent(new CustomEvent('netlify_db_update', { detail: { db } }));
      return true;
    } catch {
      return false;
    }
  },

  delete: (key: string) => {
    try {
      const db = JSON.parse(localStorage.getItem('netlify_mock_db') || '{}');
      delete db[key];
      localStorage.setItem('netlify_mock_db', JSON.stringify(db));
      window.dispatchEvent(new CustomEvent('netlify_db_update', { detail: { db } }));
      return true;
    } catch {
      return false;
    }
  }
};
`;
      setFiles(prev => ({
        ...prev,
        'src/lib/netlifyDb.ts': { content: dbContent }
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

  const deleteUser = (id: string) => {
    const next = mockUsers.filter(u => u.id !== id);
    saveMockData(next, dbRecords);
    toast.success("User deleted from registry");
  };

  const deleteDbRecord = (key: string) => {
    const next = { ...dbRecords };
    delete next[key];
    saveMockData(mockUsers, next);
    toast.success("Record deleted");
  };

  return (
    <div className="p-5 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Cloud className="h-4 w-4 text-primary" /> Netlify Cloud Integrations
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Configure database states and user registers</p>
        </div>
        <Button size="sm" variant="outline" onClick={loadMockData} className="gap-1.5 rounded-lg">
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Auth Config */}
        <GlassCard className="p-4 border-glass-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Shield className="h-4 w-4 text-primary" /> Netlify Identity
            </span>
            <Button 
              size="sm" 
              variant={authEnabled ? "default" : "outline"}
              onClick={handleToggleAuth}
              className="h-8 rounded-lg"
            >
              {authEnabled ? "Enabled" : "Enable"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Automatically injects <code>NetlifyAuthModal.tsx</code> custom dialog component. Perfect for user sign-in and access gates.
          </p>
        </GlassCard>

        {/* Database Config */}
        <GlassCard className="p-4 border-glass-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4 text-primary" /> Netlify Blob DB SDK
            </span>
            <Button 
              size="sm" 
              variant={dbEnabled ? "default" : "outline"}
              onClick={handleToggleDb}
              className="h-8 rounded-lg"
            >
              {dbEnabled ? "Enabled" : "Enable"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Injects <code>netlifyDb.ts</code> helper directly to easily load and save persistent key-value attributes via standard SDK API.
          </p>
        </GlassCard>
      </div>

      {/* Cloud Manager Dashboard View */}
      <GlassCard className="border-glass-border overflow-hidden">
        <div className="bg-white/5 border-b border-border/10 px-4 py-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Identity Registrations
          </span>
          <span className="text-[10px] text-muted-foreground">{mockUsers.length} users</span>
        </div>
        <div className="divide-y divide-border/10">
          {mockUsers.length > 0 ? (
            mockUsers.map((user) => (
              <div key={user.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                <div>
                  <p className="font-semibold text-foreground">{user.email}</p>
                  <p className="text-[10px] text-muted-foreground">Joined {user.created_at}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px]">{user.role}</span>
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

      <GlassCard className="border-glass-border overflow-hidden">
        <div className="bg-white/5 border-b border-border/10 px-4 py-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" /> Database KV records
          </span>
        </div>
        <div className="divide-y divide-border/10">
          {Object.keys(dbRecords).length > 0 ? (
            Object.entries(dbRecords).map(([key, val]) => (
              <div key={key} className="px-4 py-2.5 flex items-center justify-between text-xs">
                <div className="font-mono text-[11px] text-primary">
                  {key}
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-muted-foreground bg-white/5 px-2 py-0.5 rounded text-[10px]">
                    {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                  </span>
                  <button onClick={() => deleteDbRecord(key)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-6 text-center text-xs text-muted-foreground">No records saved in the database.</div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
