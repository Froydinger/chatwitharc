import type { VirtualFileSystem } from '@/types/ide';

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
  language?: string;
}

interface TreeBuilder {
  [key: string]: TreeBuilder | { __isFile: true; language?: string };
}

export function buildFileTree(files: VirtualFileSystem): FileTreeNode[] {
  const root: TreeBuilder = {};
  const paths = Object.keys(files).sort();

  for (const path of paths) {
    const parts = path.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      if (isFile) {
        current[part] = { __isFile: true, language: files[path]?.language };
      } else {
        if (!current[part] || (current[part] as { __isFile?: boolean }).__isFile) {
          current[part] = {};
        }
        current = current[part] as TreeBuilder;
      }
    }
  }

  function buildNodes(obj: TreeBuilder, basePath = ''): FileTreeNode[] {
    const nodes: FileTreeNode[] = [];
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      const fullPath = basePath ? `${basePath}/${key}` : key;
      if ((value as { __isFile?: boolean }).__isFile) {
        nodes.push({ name: key, path: fullPath, type: 'file', language: (value as { language?: string }).language });
      } else {
        nodes.push({ name: key, path: fullPath, type: 'folder', children: buildNodes(value as TreeBuilder, fullPath) });
      }
    }
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  return buildNodes(root);
}

export function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'tsx': case 'ts': return '📘';
    case 'jsx': case 'js': return '📙';
    case 'css': return '🎨';
    case 'json': return '📋';
    case 'html': return '🌐';
    case 'md': return '📝';
    default: return '📄';
  }
}

export function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'tsx': case 'ts': return 'typescript';
    case 'jsx': case 'js': return 'javascript';
    case 'css': return 'css';
    case 'json': return 'json';
    case 'html': return 'html';
    case 'md': return 'markdown';
    default: return 'plaintext';
  }
}
