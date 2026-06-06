import { useState } from "react";
import { Folder, FolderOpen, Trash2, Plus, Edit2, Check, X } from "lucide-react";
import { useFoldersStore, type Folder as FolderType } from "@/store/useFoldersStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface FoldersSectionProps {
  onFolderSelect?: (folderId: string | null) => void;
  selectedFolderId?: string | null;
  compact?: boolean;
}

/**
 * Reusable folder management UI — shows folders, allows create/rename/delete,
 * and optional selection (for filtering chats by folder).
 */
export function FoldersSection({ onFolderSelect, selectedFolderId, compact }: FoldersSectionProps) {
  const { folders, loading, createFolder, updateFolder, deleteFolder, fetchFolders } = useFoldersStore();
  const { toast } = useToast();

  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newFolderName.trim()) return;
    const folder = await createFolder(newFolderName.trim());
    if (folder) {
      setNewFolderName("");
      setCreatingFolder(false);
      toast({ title: "Folder created", description: folder.name });
    }
  };

  const handleRename = async (id: string) => {
    if (!editingName.trim()) return;
    await updateFolder(id, editingName.trim());
    setEditingId(null);
    toast({ title: "Folder renamed" });
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    await deleteFolder(id);
    toast({ title: "Folder deleted" });
  };

  if (loading) {
    return <div className="text-xs text-muted-foreground px-2 py-1">Loading folders...</div>;
  }

  return (
    <div className={cn("space-y-2", compact && "text-xs")}>
      {/* Header + Create button */}
      <div className="flex items-center justify-between px-2">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Folders</span>
        <button
          onClick={() => setCreatingFolder(!creatingFolder)}
          className="text-[10px] text-primary/70 hover:text-primary transition-colors"
          aria-label="Create folder"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Create new folder input */}
      {creatingFolder && (
        <div className="flex gap-1 px-2 mb-2">
          <Input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setCreatingFolder(false);
            }}
            placeholder="Folder name"
            maxLength={100}
            className="h-7 text-xs"
          />
          <button
            onClick={handleCreate}
            disabled={!newFolderName.trim()}
            className="px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 text-xs"
          >
            Add
          </button>
        </div>
      )}

      {/* Folder list */}
      <div className="space-y-1">
        {folders.length === 0 ? (
          <div className="text-[10px] text-muted-foreground/60 px-2 py-2">No folders yet</div>
        ) : (
          folders.map((folder) => (
            <div
              key={folder.id}
              className={cn(
                "group flex items-center gap-2 px-2 py-1.5 rounded-md border border-transparent transition-all",
                selectedFolderId === folder.id
                  ? "bg-primary/10 border-primary/30"
                  : "hover:bg-muted/40 hover:border-border/30",
              )}
            >
              {/* Folder icon + name (or edit input) */}
              <FolderOpen className="h-3.5 w-3.5 text-primary/60 shrink-0" />

              {editingId === folder.id ? (
                <Input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(folder.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  maxLength={100}
                  className="h-6 text-xs flex-1"
                />
              ) : (
                <button
                  onClick={() => onFolderSelect?.(selectedFolderId === folder.id ? null : folder.id)}
                  className="flex-1 text-left text-xs text-foreground hover:text-primary transition-colors truncate"
                >
                  {folder.name}
                </button>
              )}

              {/* Edit / Delete buttons */}
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {editingId === folder.id ? (
                  <>
                    <button
                      onClick={() => handleRename(folder.id)}
                      className="p-1 hover:bg-primary/20 rounded text-primary"
                      aria-label="Save"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1 hover:bg-muted rounded text-muted-foreground"
                      aria-label="Cancel"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setEditingId(folder.id);
                        setEditingName(folder.name);
                      }}
                      className="p-1 hover:bg-muted/60 rounded text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Rename"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleDelete(folder.id)}
                      disabled={deleting === folder.id}
                      className="p-1 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
