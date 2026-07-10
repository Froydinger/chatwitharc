import { useState, useEffect } from 'react';
import { Code2, Layers, Cloud, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { VirtualFileSystem } from '@/types/ide';
import { toast } from 'sonner';

interface IDEArtifactCardProps {
  prompt: string;
  fileCount?: number;
  projectId?: string;
  title?: string;
  className?: string;
}

export function IDEArtifactCard({
  prompt,
  fileCount: initialFileCount,
  projectId,
  title: propTitle,
  className
}: IDEArtifactCardProps) {
  const [resolvedFileCount, setResolvedFileCount] = useState(initialFileCount || 0);
  const [resolvedTitle, setResolvedTitle] = useState(propTitle || '');

  // Resolve the real file count from database
  useEffect(() => {
    if (projectId) {
      supabase
        .from('ide_projects')
        .select('files, title')
        .eq('id', projectId)
        .single()
        .then(({ data }) => {
          if (data?.files) {
            const files = data.files as Record<string, unknown>;
            setResolvedFileCount(Object.keys(files).length);
          }
          if (data?.title && data.title !== 'Untitled Project') {
            setResolvedTitle(data.title);
          }
        });
    }
  }, [projectId]);

  const handleOpen = () => {
    toast.info("App Builder is coming soon", {
      description: "Existing IDE artifacts are read-only while the workspace is offline.",
    });
  };

  return (
    <div
      className={cn(
        "group relative rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm",
        "transition-all duration-200 cursor-not-allowed overflow-hidden opacity-80",
        className
      )}
      onClick={handleOpen}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
        <div className="flex items-center gap-2 min-w-0">
          <Code2 className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="font-medium text-sm text-foreground truncate">
            {resolvedTitle || prompt.slice(0, 40) || 'App Builder'}
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary flex-shrink-0">
            IDE
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 flex-shrink-0">
            Coming soon
          </span>
          {projectId && (
            <Cloud className="w-3 h-3 flex-shrink-0 text-emerald-400" />
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-amber-500"
          disabled
          onClick={(e) => {
            e.stopPropagation();
            handleOpen();
          }}
        >
          <Wrench className="w-3.5 h-3.5 mr-1" />
          Soon
        </Button>
      </div>

      {/* Prompt Preview */}
      <div className="px-4 py-3 bg-muted/20">
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {prompt}
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground/70">
        <div className="flex items-center gap-1">
          <Layers className="w-3 h-3" />
          <span>{resolvedFileCount} files</span>
        </div>
        <span>React + TypeScript</span>
      </div>
    </div>
  );
}
