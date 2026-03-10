import { useState, useEffect } from 'react';
import { Code2, ExternalLink, Layers, Cloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCanvasStore } from '@/store/useCanvasStore';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { VirtualFileSystem } from '@/types/ide';

interface IDEArtifactCardProps {
  prompt: string;
  fileCount?: number;
  projectId?: string;
  className?: string;
}

export function IDEArtifactCard({
  prompt,
  fileCount: initialFileCount,
  projectId,
  className
}: IDEArtifactCardProps) {
  const { reopenIDECanvas, openIDECanvas, ideFiles, ideProjectId } = useCanvasStore();
  const [resolvedFileCount, setResolvedFileCount] = useState(initialFileCount || 0);
  const [isLoading, setIsLoading] = useState(false);

  // Try to get real file count from store or database
  useEffect(() => {
    // If the store has files for this project, use that count
    if (ideFiles && ideProjectId === projectId && Object.keys(ideFiles).length > 0) {
      setResolvedFileCount(Object.keys(ideFiles).length);
      return;
    }

    // If we have a projectId, load count from database
    if (projectId) {
      supabase
        .from('ide_projects')
        .select('files')
        .eq('id', projectId)
        .single()
        .then(({ data }) => {
          if (data?.files) {
            const files = data.files as Record<string, unknown>;
            setResolvedFileCount(Object.keys(files).length);
          }
        });
    } else if (ideFiles && Object.keys(ideFiles).length > 0) {
      // Fallback: use current store files
      setResolvedFileCount(Object.keys(ideFiles).length);
    }
  }, [projectId, ideFiles, ideProjectId]);

  const handleOpen = async () => {
    // If we have a projectId, load from database and reopen (no agent trigger)
    if (projectId) {
      setIsLoading(true);
      try {
        const { data } = await supabase
          .from('ide_projects')
          .select('files')
          .eq('id', projectId)
          .single();

        if (data?.files) {
          const loadedFiles = data.files as unknown as VirtualFileSystem;
          reopenIDECanvas(projectId, loadedFiles);
        } else {
          // Fallback: open with store files
          if (ideFiles && Object.keys(ideFiles).length > 0) {
            reopenIDECanvas(projectId, ideFiles);
          } else {
            openIDECanvas(prompt);
          }
        }
      } catch {
        // Fallback to store files
        if (ideFiles && Object.keys(ideFiles).length > 0) {
          reopenIDECanvas(projectId, ideFiles);
        } else {
          openIDECanvas(prompt);
        }
      } finally {
        setIsLoading(false);
      }
    } else if (ideFiles && Object.keys(ideFiles).length > 0) {
      // No projectId but we have files in the store - reopen without triggering agent
      const tempId = ideProjectId || 'local';
      reopenIDECanvas(tempId, ideFiles);
    } else {
      // No files anywhere - this is a fresh start (shouldn't normally happen)
      openIDECanvas(prompt);
    }
  };

  return (
    <div
      className={cn(
        "group relative rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm",
        "hover:border-primary/30 hover:bg-card/80 transition-all duration-200",
        "cursor-pointer overflow-hidden",
        isLoading && "pointer-events-none opacity-70",
        className
      )}
      onClick={handleOpen}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
        <div className="flex items-center gap-2 min-w-0">
          <Code2 className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="font-medium text-sm text-foreground truncate">
            App Builder
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/15 text-primary flex-shrink-0">
            IDE
          </span>
          {projectId && (
            <Cloud className="w-3 h-3 flex-shrink-0 text-emerald-400" />
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            handleOpen();
          }}
        >
          <ExternalLink className="w-3.5 h-3.5 mr-1" />
          Open
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
