import { useEffect, useState } from "react";
import { Folder as FolderIcon } from "lucide-react";
import { useFoldersStore } from "@/store/useFoldersStore";
import { useArcStore } from "@/store/useArcStore";
import { FoldersSection } from "@/components/FoldersSection";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";

/**
 * Dashboard folder management: shows all folders with chat counts, and the
 * FoldersSection for create/rename/delete operations.
 */
export function FolderManager() {
  const { folders, fetchFolders } = useFoldersStore();
  const { chatSessions } = useArcStore();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  useEffect(() => {
    fetchFolders();
  }, []);

  // Count chats per folder
  const folderStats = folders.map((folder) => ({
    folder,
    chatCount: chatSessions.filter((s) => (s as any).folder_id === folder.id).length,
  }));

  const unfiledCount = chatSessions.filter((s) => !(s as any).folder_id).length;

  return (
    <div className="space-y-4">
      <GlassCard className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-xl bg-primary/15 border border-primary/30">
            <FolderIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Folders</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Organize your chats</p>
          </div>
        </div>

        {/* Folder management section */}
        <div className="space-y-3">
          <FoldersSection onFolderSelect={setSelectedFolderId} selectedFolderId={selectedFolderId} />
        </div>
      </GlassCard>

      {/* Folder stats */}
      <GlassCard className="p-5">
        <h4 className="text-sm font-semibold text-foreground mb-3">Folder Overview</h4>
        <div className="space-y-2">
          {/* Unfiled */}
          <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/40 transition-colors">
            <div className="text-sm text-foreground">Unfiled</div>
            <div className="text-xs px-2 py-1 rounded-full bg-muted/50 text-muted-foreground font-medium">
              {unfiledCount}
            </div>
          </div>

          {/* Folder entries */}
          {folderStats.length === 0 ? (
            <div className="text-xs text-muted-foreground/60 py-2">No folders yet</div>
          ) : (
            folderStats.map(({ folder, chatCount }) => (
              <div
                key={folder.id}
                onClick={() => setSelectedFolderId(selectedFolderId === folder.id ? null : folder.id)}
                className={cn(
                  "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors",
                  selectedFolderId === folder.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/40",
                )}
              >
                <div className="text-sm text-foreground">{folder.name}</div>
                <div className="text-xs px-2 py-1 rounded-full bg-muted/50 text-muted-foreground font-medium">
                  {chatCount}
                </div>
              </div>
            ))
          )}
        </div>
      </GlassCard>
    </div>
  );
}
