import { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react';
import type { VirtualFileSystem } from '@/types/ide';
import { buildFileTree, getFileIcon, type FileTreeNode } from '@/lib/file-tree';
import { cn } from '@/lib/utils';

interface FileExplorerProps {
  files: VirtualFileSystem;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}

function TreeNode({
  node, depth, selectedFile, onSelectFile, expandedFolders, toggleFolder,
}: {
  node: FileTreeNode; depth: number; selectedFile: string | null;
  onSelectFile: (path: string) => void; expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
}) {
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedFile === node.path;
  const isFolder = node.type === 'folder';

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 cursor-pointer text-xs hover:bg-white/5 transition-colors rounded-sm',
          isSelected && 'bg-primary/10 text-primary'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => isFolder ? toggleFolder(node.path) : onSelectFile(node.path)}
      >
        {isFolder ? (
          <>
            {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
            {isExpanded ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary/80" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          </>
        ) : (
          <>
            <span className="w-3" />
            <span className="text-xs">{getFileIcon(node.name)}</span>
          </>
        )}
        <span className="truncate">{node.name}</span>
      </div>
      {isFolder && isExpanded && node.children?.map(child => (
        <TreeNode key={child.path} node={child} depth={depth + 1} selectedFile={selectedFile}
          onSelectFile={onSelectFile} expandedFolders={expandedFolders} toggleFolder={toggleFolder} />
      ))}
    </div>
  );
}

export function FileExplorer({ files, selectedFile, onSelectFile }: FileExplorerProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['src']));
  const tree = buildFileTree(files);

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col bg-background/50">
      <div className="px-3 py-2.5 border-b border-border/30">
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Explorer</h3>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {tree.map(node => (
          <TreeNode key={node.path} node={node} depth={0} selectedFile={selectedFile}
            onSelectFile={onSelectFile} expandedFolders={expandedFolders} toggleFolder={toggleFolder} />
        ))}
      </div>
    </div>
  );
}
