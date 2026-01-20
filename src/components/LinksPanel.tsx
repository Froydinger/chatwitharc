// src/components/LinksPanel.tsx
import { useState } from "react";
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export function LinksPanel() {
  const { lists, createList, deleteList, renameList, removeLink } = useSearchStore();
  const { toast } = useToast();
  
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set(['default']));
  const [showNewListDialog, setShowNewListDialog] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editListName, setEditListName] = useState("");

  const totalLinks = lists.reduce((acc, list) => acc + list.links.length, 0);

  const toggleList = (listId: string) => {
    setExpandedLists((prev) => {
      const next = new Set(prev);
      if (next.has(listId)) {
        next.delete(listId);
      } else {
        next.add(listId);
      }
      return next;
    });
  };

  const handleCreateList = () => {
    if (!newListName.trim()) return;
    createList(newListName.trim());
    setNewListName("");
    setShowNewListDialog(false);
    toast({ title: "List created" });
  };

  const handleRenameList = (listId: string) => {
    if (!editListName.trim()) return;
    renameList(listId, editListName.trim());
    setEditingListId(null);
    setEditListName("");
    toast({ title: "List renamed" });
  };

  const handleDeleteList = (listId: string, listName: string) => {
    deleteList(listId);
    toast({ title: `Deleted "${listName}"` });
  };

  const handleRemoveLink = (listId: string, linkId: string) => {
    removeLink(listId, linkId);
    toast({ title: "Link removed" });
  };

  const getFaviconUrl = (url: string) => {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch {
      return null;
    }
  };

  const getHostname = (url: string) => {
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return url;
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-medium text-foreground">Saved Links</h2>
            <span className="text-xs text-muted-foreground">({totalLinks})</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setShowNewListDialog(true)}
          >
          </Button>
        </div>
      </div>
    </div>
  );
}
