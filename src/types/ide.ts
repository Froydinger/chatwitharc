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
    content: `export const netlifyDb = {
  get: (key: string): any => {
    try {
      const data = localStorage.getItem(\`netlify_db:\${key}\`);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },
  set: (key: string, value: any): void => {
    try {
      localStorage.setItem(\`netlify_db:\${key}\`, JSON.stringify(value));
      window.dispatchEvent(new CustomEvent('netlify-db-change', { detail: { key, value } }));
    } catch (e) {
      console.error(e);
    }
  }
};`,
    language: 'typescript',
  },
  'src/components/NetlifyAuthModal.tsx': {
    content: `import React, { useState } from 'react';

interface User {
  id: string;
  email: string;
  avatar?: string;
  name?: string;
  created_at: string;
}

interface NetlifyAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
}

export function NetlifyAuthModal({ isOpen, onClose, onSuccess }: NetlifyAuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    try {
      const usersRaw = localStorage.getItem('netlify_mock_users');
      const users: User[] = usersRaw ? JSON.parse(usersRaw) : [];

      if (isSignUp) {
        if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
          setError('User with this email already exists.');
          return;
        }

        const newUser: User = {
          id: Math.random().toString(36).substring(2, 11),
          email,
          name: name || email.split('@')[0],
          avatar: avatar || \`https://api.dicebear.com/7.x/adventurer/svg?seed=\${encodeURIComponent(email)}\`,
          created_at: new Date().toISOString()
        };

        users.push(newUser);
        localStorage.setItem('netlify_mock_users', JSON.stringify(users));
        localStorage.setItem('netlify_current_user', JSON.stringify(newUser));
        onSuccess(newUser);
        onClose();
      } else {
        const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (!user) {
          setError('Invalid email or password.');
          return;
        }

        localStorage.setItem('netlify_current_user', JSON.stringify(user));
        onSuccess(user);
        onClose();
      }
    } catch (err) {
      setError('An error occurred during authentication.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-2xl p-6 shadow-2xl relative text-left">
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors"
        >
          ✕
        </button>
        <h3 className="text-xl font-bold text-white mb-2">
          {isSignUp ? 'Create Account' : 'Sign In'}
        </h3>
        <p className="text-xs text-neutral-400 mb-6 font-normal">
          {isSignUp ? 'Set up sandbox credentials for your mock app' : 'Enter mock credentials to access your preview'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/25 text-red-400 text-xs rounded-lg">
              {error}
            </div>
          )}

          {isSignUp && (
            <>
              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase">Full Name</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)}
                  placeholder="John Doe" 
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase">Avatar URL (Optional)</label>
                <input 
                  type="url" 
                  value={avatar} 
                  onChange={e => setAvatar(e.target.value)}
                  placeholder="https://example.com/photo.jpg" 
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase">Email Address</label>
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" 
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-400 mb-1.5 uppercase">Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" 
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          <button 
            type="submit" 
            className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm rounded-lg p-2.5 transition-colors mt-2"
          >
            {isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-neutral-800 text-center">
          <button 
            onClick={() => setIsSignUp(!isSignUp)} 
            className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );
}`,
    language: 'typescript',
  },
};
