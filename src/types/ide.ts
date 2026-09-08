export interface VirtualFile {
  content: string;
  language: string;
}

export interface VirtualFileSystem {
  [path: string]: VirtualFile;
}

export interface AgentAction {
  id: string;
  type: 'status' | 'action' | 'action_complete' | 'error';
  action?: string;
  path?: string;
  message?: string;
  success?: boolean;
  prompt?: string;
  timestamp: number;
}

export const DEFAULT_FILES: VirtualFileSystem = {
  'src/main.tsx': {
    content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
    language: 'typescript',
  },
  'src/App.tsx': {
    content: `import React from 'react';

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">
          Hello World
        </h1>
        <p className="text-gray-400">
          Start building something amazing!
        </p>
      </div>
    </div>
  );
}`,
    language: 'typescript',
  },
  'src/lib/netlifyDb.ts': {
    content: `// ⚡ Arc & Netlify Database + Netlify Identity SDK
export interface AppUser {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  role?: string;
  token?: string;
  created_at: string;
}

function resolveAppId(): string {
  if (typeof window !== 'undefined') {
    if ((window as any).__ARC_PROJECT_ID__) return (window as any).__ARC_PROJECT_ID__;
    if ((window as any).__ARC_APP_ID__) return (window as any).__ARC_APP_ID__;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const paramId = urlParams.get('appId') || urlParams.get('projectId');
      if (paramId) return paramId;
    } catch {}
    const host = window.location?.hostname || '';
    if (host && !host.includes('localhost') && !host.startsWith('127.') && host !== 'askarc.chat' && !host.includes('csb.app')) {
      return host.split('.')[0];
    }
  }
  return 'default';
}

export const APP_ID = resolveAppId();

const getDbPrefix = () => \`netlify_db:\${resolveAppId()}:\`;
const getCurrentUserKey = () => \`netlify_current_user:\${resolveAppId()}\`;
const getTokenKey = () => \`netlify_identity_token:\${resolveAppId()}\`;
const getMockUsersKey = () => \`netlify_mock_users:\${resolveAppId()}\`;

function getSupabaseUrl(): string {
  if (typeof window !== 'undefined' && (window as any).__ARC_SUPABASE_URL__) {
    return (window as any).__ARC_SUPABASE_URL__;
  }
  return 'https://olhptgffasqrmeyqjtrq.supabase.co';
}

function syncCloud(action: string, payload: any) {
  if (typeof window === 'undefined') return;
  try {
    const projectId = (window as any).__ARC_PROJECT_ID__ || (window as any).__ARC_APP_ID__ || resolveAppId();
    let subdomain = (window as any).__ARC_SUBDOMAIN__;
    if (!subdomain && window.location?.hostname && !window.location.hostname.includes('csb.app') && !window.location.hostname.includes('localhost')) {
      subdomain = window.location.hostname.split('.')[0];
    }
    const supabaseUrl = getSupabaseUrl();
    if (!supabaseUrl) return;

    fetch(\`\${supabaseUrl}/functions/v1/app-backend\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        subdomain,
        action,
        payload,
      }),
    }).catch(() => {});
  } catch {}
}

function notifyHost(action: string, payload: any) {
  if (typeof window === 'undefined') return;
  const currentAppId = resolveAppId();
  const eventDetail = { appId: currentAppId, ...payload };
  try {
    window.dispatchEvent(new CustomEvent('netlify-auth-change', { detail: eventDetail }));
  } catch {}
  try {
    const msg = {
      source: 'arc-netlify-db',
      appId: currentAppId,
      action,
      payload,
    };
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, '*');
    }
    if (window.top && window.top !== window && window.top !== window.parent) {
      window.top.postMessage(msg, '*');
    }
  } catch {}
}

function getIdentityEndpoint(): string {
  if (typeof window !== 'undefined' && (window as any).__NETLIFY_IDENTITY_URL__) {
    return (window as any).__NETLIFY_IDENTITY_URL__;
  }
  return '/.netlify/identity';
}

export const netlifyDb = {
  // Key-Value Store
  get: <T = any>(key: string, defaultValue: T | null = null): T | null => {
    try {
      const data = localStorage.getItem(\`\${getDbPrefix()}\${key}\`);
      return data ? JSON.parse(data) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  set: <T = any>(key: string, value: T): boolean => {
    try {
      localStorage.setItem(\`\${getDbPrefix()}\${key}\`, JSON.stringify(value));
      window.dispatchEvent(new CustomEvent('netlify-db-change', { detail: { appId: resolveAppId(), key, value } }));
      notifyHost('db-set', { key, value });
      syncCloud('db-set', { key, value });
      return true;
    } catch (e) {
      console.error('[netlifyDb] Set error:', e);
      return false;
    }
  },

  delete: (key: string): boolean => {
    try {
      localStorage.removeItem(\`\${getDbPrefix()}\${key}\`);
      window.dispatchEvent(new CustomEvent('netlify-db-change', { detail: { appId: resolveAppId(), key, deleted: true } }));
      notifyHost('db-delete', { key });
      syncCloud('db-delete', { key });
      return true;
    } catch {
      return false;
    }
  },

  list: (prefix: string = ''): Record<string, any> => {
    const records: Record<string, any> = {};
    const dbPrefix = getDbPrefix();
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const fullKey = localStorage.key(i);
        if (fullKey && fullKey.startsWith(dbPrefix)) {
          const rawKey = fullKey.slice(dbPrefix.length);
          if (!prefix || rawKey.startsWith(prefix)) {
            records[rawKey] = netlifyDb.get(rawKey);
          }
        }
      }
    } catch (e) {
      console.error('[netlifyDb] List error:', e);
    }
    return records;
  },

  // Document Collections / Tables (e.g. netlifyDb.collection('posts'))
  collection: <T extends { id?: string }>(collectionName: string) => {
    const collectionKey = \`collection:\${collectionName}\`;

    const getItems = (): T[] => {
      return netlifyDb.get<T[]>(collectionKey, []) || [];
    };

    const saveItems = (items: T[]) => {
      netlifyDb.set(collectionKey, items);
      window.dispatchEvent(new CustomEvent(\`netlify-collection:\${collectionName}\`, { detail: items }));
      notifyHost('collection-change', { collection: collectionName, items });
      syncCloud('collection-change', { collection: collectionName, items });
    };

    return {
      find: (filter?: (item: T) => boolean): T[] => {
        const items = getItems();
        return filter ? items.filter(filter) : items;
      },

      findById: (id: string): T | null => {
        const items = getItems();
        return items.find((item: any) => item.id === id) || null;
      },

      insert: (doc: Omit<T, 'id'> & { id?: string }): T => {
        const items = getItems();
        const newRecord = {
          ...doc,
          id: doc.id || Math.random().toString(36).substring(2, 10),
          created_at: (doc as any).created_at || new Date().toISOString(),
        } as T;
        saveItems([newRecord, ...items]);
        return newRecord;
      },

      update: (id: string, updates: Partial<T>): T | null => {
        const items = getItems();
        let updated: T | null = null;
        const next = items.map((item: any) => {
          if (item.id === id) {
            updated = { ...item, ...updates, updated_at: new Date().toISOString() };
            return updated;
          }
          return item;
        });
        if (updated) saveItems(next);
        return updated;
      },

      remove: (id: string): boolean => {
        const items = getItems();
        const next = items.filter((item: any) => item.id !== id);
        if (next.length !== items.length) {
          saveItems(next);
          return true;
        }
        return false;
      },

      subscribe: (callback: (items: T[]) => void) => {
        const handler = (e: any) => callback(e.detail || []);
        window.addEventListener(\`netlify-collection:\${collectionName}\`, handler);
        return () => window.removeEventListener(\`netlify-collection:\${collectionName}\`, handler);
      },
    };
  },

  // Netlify Identity Authentication (Endpoints + Custom Auth Screens, No Widget Needed)
  auth: {
    currentUser: (): AppUser | null => {
      try {
        const raw = localStorage.getItem(getCurrentUserKey());
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },

    signUp: async (params: { email: string; password?: string; name?: string; avatar?: string }): Promise<{ user: AppUser | null; error: string | null }> => {
      const email = params.email.trim().toLowerCase();
      const password = params.password || 'password123';
      const name = params.name || email.split('@')[0];
      const avatar = params.avatar || \`https://api.dicebear.com/7.x/adventurer/svg?seed=\${encodeURIComponent(email)}\`;
      if (!email) return { user: null, error: 'Email is required' };

      // 1. Try Netlify Identity endpoint
      try {
        const endpoint = getIdentityEndpoint();
        const res = await fetch(\`\${endpoint}/signup\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            user_metadata: { full_name: name, avatar_url: avatar },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const newUser: AppUser = {
            id: data.id || Math.random().toString(36).substring(2, 11),
            email: data.email || email,
            name: data.user_metadata?.full_name || name,
            avatar: data.user_metadata?.avatar_url || avatar,
            role: 'User',
            created_at: data.created_at || new Date().toISOString(),
          };
          localStorage.setItem(getCurrentUserKey(), JSON.stringify(newUser));
          let userList: any[] = [];
          try {
            const rawUsers = localStorage.getItem(getMockUsersKey());
            userList = rawUsers ? JSON.parse(rawUsers) : [];
            if (!userList.some((u: any) => u.email === newUser.email)) {
              userList.unshift({
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
                role: 'User',
                status: 'Active',
                created_at: new Date().toLocaleDateString(),
              });
              localStorage.setItem(getMockUsersKey(), JSON.stringify(userList));
            }
          } catch {}
          window.dispatchEvent(new CustomEvent('netlify-auth-change', { detail: { appId: resolveAppId(), user: newUser, users: userList } }));
          notifyHost('auth-signup', { user: newUser, users: userList });
          syncCloud('auth-signup', { user: newUser, users: userList });
          return { user: newUser, error: null };
        } else if (res.status !== 404) {
          const errData = await res.json().catch(() => ({ msg: 'Sign up failed' }));
          return { user: null, error: errData.msg || errData.error_description || 'Sign up failed' };
        }
      } catch {
        // Fallback for sandboxed preview
      }

      // 2. Sandboxed preview fallback
      const newUser: AppUser = {
        id: Math.random().toString(36).substring(2, 11),
        email,
        name,
        avatar,
        role: 'User',
        created_at: new Date().toISOString(),
      };
      localStorage.setItem(getCurrentUserKey(), JSON.stringify(newUser));
      let userList: any[] = [];
      try {
        const rawUsers = localStorage.getItem(getMockUsersKey());
        userList = rawUsers ? JSON.parse(rawUsers) : [];
        if (!userList.some((u: any) => u.email === newUser.email)) {
          userList.unshift({
            id: newUser.id,
            email: newUser.email,
            name: newUser.name,
            role: 'User',
            status: 'Active',
            created_at: new Date().toLocaleDateString(),
          });
          localStorage.setItem(getMockUsersKey(), JSON.stringify(userList));
        }
      } catch {}
      window.dispatchEvent(new CustomEvent('netlify-auth-change', { detail: { appId: resolveAppId(), user: newUser, users: userList } }));
      notifyHost('auth-signup', { user: newUser, users: userList });
      syncCloud('auth-signup', { user: newUser, users: userList });
      return { user: newUser, error: null };
    },

    signIn: async (emailInput: string, passwordInput?: string): Promise<{ user: AppUser | null; error: string | null }> => {
      const email = emailInput.trim().toLowerCase();
      const password = passwordInput || 'password123';
      if (!email) return { user: null, error: 'Email is required' };

      // 1. Try Netlify Identity token endpoint
      try {
        const endpoint = getIdentityEndpoint();
        const formParams = new URLSearchParams();
        formParams.append('grant_type', 'password');
        formParams.append('username', email);
        formParams.append('password', password);

        const res = await fetch(\`\${endpoint}/token\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formParams.toString(),
        });

        if (res.ok) {
          const data = await res.json();
          const userMeta = data.user?.user_metadata || {};
          const user: AppUser = {
            id: data.user?.id || Math.random().toString(36).substring(2, 11),
            email: data.user?.email || email,
            name: userMeta.full_name || userMeta.name || email.split('@')[0],
            avatar: userMeta.avatar_url || userMeta.avatar || \`https://api.dicebear.com/7.x/adventurer/svg?seed=\${encodeURIComponent(email)}\`,
            role: data.user?.app_metadata?.roles?.[0] || 'User',
            token: data.access_token,
            created_at: data.user?.created_at || new Date().toISOString(),
          };
          localStorage.setItem(getCurrentUserKey(), JSON.stringify(user));
          if (data.access_token) localStorage.setItem(getTokenKey(), data.access_token);
          let userList: any[] = [];
          try {
            const rawUsers = localStorage.getItem(getMockUsersKey());
            userList = rawUsers ? JSON.parse(rawUsers) : [];
            if (!userList.some((u: any) => u.email === user.email)) {
              userList.unshift({
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role || 'User',
                status: 'Active',
                created_at: new Date().toLocaleDateString(),
              });
              localStorage.setItem(getMockUsersKey(), JSON.stringify(userList));
            }
          } catch {}
          window.dispatchEvent(new CustomEvent('netlify-auth-change', { detail: { appId: resolveAppId(), user, users: userList } }));
          notifyHost('auth-signin', { user, users: userList });
          syncCloud('auth-signin', { user, users: userList });
          return { user, error: null };
        } else if (res.status !== 404) {
          const errData = await res.json().catch(() => ({ error_description: 'Invalid email or password' }));
          return { user: null, error: errData.error_description || errData.msg || 'Invalid credentials' };
        }
      } catch {
        // Fallback for sandboxed preview
      }

      // 2. Sandboxed preview fallback
      const user: AppUser = {
        id: Math.random().toString(36).substring(2, 11),
        email,
        name: email.split('@')[0],
        avatar: \`https://api.dicebear.com/7.x/adventurer/svg?seed=\${encodeURIComponent(email)}\`,
        role: 'User',
        created_at: new Date().toISOString(),
      };
      localStorage.setItem(getCurrentUserKey(), JSON.stringify(user));
      let userList: any[] = [];
      try {
        const rawUsers = localStorage.getItem(getMockUsersKey());
        userList = rawUsers ? JSON.parse(rawUsers) : [];
        if (!userList.some((u: any) => u.email === user.email)) {
          userList.unshift({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role || 'User',
            status: 'Active',
            created_at: new Date().toLocaleDateString(),
          });
          localStorage.setItem(getMockUsersKey(), JSON.stringify(userList));
        }
      } catch {}
      window.dispatchEvent(new CustomEvent('netlify-auth-change', { detail: { appId: resolveAppId(), user, users: userList } }));
      notifyHost('auth-signin', { user, users: userList });
      syncCloud('auth-signin', { user, users: userList });
      return { user, error: null };
    },

    signOut: async (): Promise<void> => {
      try {
        const token = localStorage.getItem(getTokenKey());
        if (token) {
          const endpoint = getIdentityEndpoint();
          await fetch(\`\${endpoint}/logout\`, {
            method: 'POST',
            headers: { 'Authorization': \`Bearer \${token}\` },
          }).catch(() => {});
        }
      } catch {}
      localStorage.removeItem(getCurrentUserKey());
      localStorage.removeItem(getTokenKey());
      window.dispatchEvent(new CustomEvent('netlify-auth-change', { detail: { appId: resolveAppId(), user: null, users: [] } }));
      notifyHost('auth-signout', { user: null });
    },

    onAuthStateChange: (callback: (user: AppUser | null) => void) => {
      const handler = (e: any) => {
        if (!e.detail || e.detail.appId === undefined || e.detail.appId === resolveAppId()) {
          callback(e.detail?.user || null);
        }
      };
      window.addEventListener('netlify-auth-change', handler);
      return () => window.removeEventListener('netlify-auth-change', handler);
    },
  },
};

// Initial state announcement to host window
try {
  if (typeof window !== 'undefined') {
    const cur = netlifyDb.auth.currentUser();
    const rawUsers = localStorage.getItem(getMockUsersKey());
    const initialUsers = rawUsers ? JSON.parse(rawUsers) : [];
    notifyHost('app-init', { user: cur, users: initialUsers });
  }
} catch {}
`,
    language: 'typescript',
  },
  'src/components/NetlifyAuthModal.tsx': {
    content: `import React, { useState, useEffect } from 'react';
import { netlifyDb, type AppUser } from '../lib/netlifyDb';

interface NetlifyAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (user: AppUser) => void;
}

export function NetlifyAuthModal({ isOpen, onClose, onSuccess }: NetlifyAuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        const { user, error: signUpError } = await netlifyDb.auth.signUp({
          email,
          password,
          name,
          avatar,
        });
        if (signUpError || !user) {
          setError(signUpError || 'Failed to create account');
          setLoading(false);
          return;
        }
        onSuccess?.(user);
        onClose();
      } else {
        const { user, error: signInError } = await netlifyDb.auth.signIn(email, password);
        if (signInError || !user) {
          setError(signInError || 'Failed to sign in');
          setLoading(false);
          return;
        }
        onSuccess?.(user);
        onClose();
      }
    } catch {
      setError('An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="bg-[#0f1117] border border-white/10 w-full max-w-md rounded-2xl p-6 shadow-2xl relative text-left">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors text-sm"
        >
          ✕
        </button>

        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <h3 className="text-lg font-bold text-white">
            {isSignUp ? 'Create User Account' : 'Sign In to App'}
          </h3>
        </div>
        <p className="text-xs text-white/60 mb-5">
          {isSignUp
            ? 'Create an account to store personalized data in this app.'
            : 'Access your profile and saved records.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/25 text-red-400 text-xs rounded-xl">
              {error}
            </div>
          )}

          {isSignUp && (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-white/60 mb-1 uppercase tracking-wider">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-white/60 mb-1 uppercase tracking-wider">
                  Avatar Image URL (Optional)
                </label>
                <input
                  type="url"
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/60 transition-colors"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-white/60 mb-1 uppercase tracking-wider">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/60 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/60 mb-1 uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/60 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm rounded-xl py-2.5 transition-all mt-3 shadow-lg disabled:opacity-50"
          >
            {loading ? 'Processing...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="mt-5 pt-3.5 border-t border-white/10 text-center">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            className="text-xs text-primary/80 hover:text-primary transition-colors"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
          </button>
        </div>
      </div>
    </div>
  );
}`,
    language: 'typescript',
  },
};
