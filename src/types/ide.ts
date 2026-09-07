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
    content: `// ⚡ Arc & Netlify Cloud Database + User Accounts SDK
export interface AppUser {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  role?: string;
  created_at: string;
}

const DB_PREFIX = 'netlify_db:';
const USERS_KEY = 'netlify_mock_users';
const CURRENT_USER_KEY = 'netlify_current_user';

export const netlifyDb = {
  // Key-Value Store
  get: <T = any>(key: string, defaultValue: T | null = null): T | null => {
    try {
      const data = localStorage.getItem(\`\${DB_PREFIX}\${key}\`);
      return data ? JSON.parse(data) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  set: <T = any>(key: string, value: T): boolean => {
    try {
      localStorage.setItem(\`\${DB_PREFIX}\${key}\`, JSON.stringify(value));
      window.dispatchEvent(new CustomEvent('netlify-db-change', { detail: { key, value } }));
      return true;
    } catch (e) {
      console.error('[netlifyDb] Set error:', e);
      return false;
    }
  },

  delete: (key: string): boolean => {
    try {
      localStorage.removeItem(\`\${DB_PREFIX}\${key}\`);
      window.dispatchEvent(new CustomEvent('netlify-db-change', { detail: { key, deleted: true } }));
      return true;
    } catch {
      return false;
    }
  },

  list: (prefix: string = ''): Record<string, any> => {
    const records: Record<string, any> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const fullKey = localStorage.key(i);
        if (fullKey && fullKey.startsWith(DB_PREFIX)) {
          const rawKey = fullKey.slice(DB_PREFIX.length);
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

  // Document Collections / Tables (e.g. netlifyDb.collection('todos'))
  collection: <T extends { id?: string }>(collectionName: string) => {
    const collectionKey = \`collection:\${collectionName}\`;

    const getItems = (): T[] => {
      return netlifyDb.get<T[]>(collectionKey, []) || [];
    };

    const saveItems = (items: T[]) => {
      netlifyDb.set(collectionKey, items);
      window.dispatchEvent(new CustomEvent(\`netlify-collection:\${collectionName}\`, { detail: items }));
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
    };
  },

  // User Accounts & Authentication
  auth: {
    currentUser: (): AppUser | null => {
      try {
        const raw = localStorage.getItem(CURRENT_USER_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },

    listUsers: (): AppUser[] => {
      try {
        const raw = localStorage.getItem(USERS_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    },

    signUp: async (params: { email: string; password?: string; name?: string; avatar?: string }): Promise<{ user: AppUser | null; error: string | null }> => {
      try {
        const users = netlifyDb.auth.listUsers();
        const email = params.email.trim().toLowerCase();
        if (!email) return { user: null, error: 'Email is required' };

        if (users.some((u) => u.email.toLowerCase() === email)) {
          return { user: null, error: 'User with this email already exists' };
        }

        const newUser: AppUser = {
          id: Math.random().toString(36).substring(2, 11),
          email,
          name: params.name || email.split('@')[0],
          avatar: params.avatar || \`https://api.dicebear.com/7.x/adventurer/svg?seed=\${encodeURIComponent(email)}\`,
          role: users.length === 0 ? 'Admin' : 'User',
          created_at: new Date().toISOString(),
        };

        users.push(newUser);
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser));
        window.dispatchEvent(new CustomEvent('netlify-auth-change', { detail: { user: newUser } }));
        return { user: newUser, error: null };
      } catch (err: any) {
        return { user: null, error: err?.message || 'Sign up failed' };
      }
    },

    signIn: async (email: string, _password?: string): Promise<{ user: AppUser | null; error: string | null }> => {
      try {
        const users = netlifyDb.auth.listUsers();
        const cleanEmail = email.trim().toLowerCase();
        const user = users.find((u) => u.email.toLowerCase() === cleanEmail);
        if (!user) {
          return { user: null, error: 'Account not found. Please sign up.' };
        }
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
        window.dispatchEvent(new CustomEvent('netlify-auth-change', { detail: { user } }));
        return { user, error: null };
      } catch (err: any) {
        return { user: null, error: err?.message || 'Sign in failed' };
      }
    },

    signOut: (): void => {
      localStorage.removeItem(CURRENT_USER_KEY);
      window.dispatchEvent(new CustomEvent('netlify-auth-change', { detail: { user: null } }));
    },

    onAuthStateChange: (callback: (user: AppUser | null) => void) => {
      const handler = (e: any) => callback(e.detail?.user || null);
      window.addEventListener('netlify-auth-change', handler);
      return () => window.removeEventListener('netlify-auth-change', handler);
    },
  },
};
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
