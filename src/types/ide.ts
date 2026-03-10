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
};
