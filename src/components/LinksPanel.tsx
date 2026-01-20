import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Link2,
  Trash2,
  ExternalLink,
  Plus,
  FolderPlus,
  ChevronRight,
  MoreHorizontal,
  Edit2,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useSearchStore, LinkList, SavedLink } from "@/store/useSearchStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
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
            <FolderPlus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Lists */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {lists.length === 0 ? (
            <div className="text-center py-8">
              <Link2 className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No saved links yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Save links from search results
              </p>
            </div>
          ) : (
            lists.map((list) => (
              <Collapsible
                key={list.id}
                open={expandedLists.has(list.id)}
                onOpenChange={() => toggleList(list.id)}
              >
                <div className="rounded-lg border border-border/30 bg-card/30 overflow-hidden">
                  {/* List Header */}
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between px-3 py-2 hover:bg-muted/30 cursor-pointer group">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <motion.div
                          animate={{ rotate: expandedLists.has(list.id) ? 90 : 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </motion.div>
                        
                        {editingListId === list.id ? (
                          <Input
                            value={editListName}
                            onChange={(e) => setEditListName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenameList(list.id);
                              if (e.key === "Escape") setEditingListId(null);
                            }}
                            onBlur={() => handleRenameList(list.id)}
                            className="h-6 text-sm py-0 px-2"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="text-sm font-medium text-foreground truncate">
                            {list.name}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          ({list.links.length})
                        </span>
                      </div>

                      {list.id !== 'default' && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingListId(list.id);
                                setEditListName(list.name);
                              }}
                            >
                              <Edit2 className="w-3.5 h-3.5 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteList(list.id, list.name);
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </CollapsibleTrigger>

                  {/* Links */}
                  <CollapsibleContent>
                    <AnimatePresence>
                      {list.links.length === 0 ? (
                        <div className="px-3 py-4 text-center border-t border-border/20">
                          <p className="text-xs text-muted-foreground">No links in this list</p>
                        </div>
                      ) : (
                        <div className="border-t border-border/20">
                          {list.links.map((link, index) => (
                            <motion.div
                              key={link.id}
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="group/link"
                            >
                              <div className="flex items-start gap-2 px-3 py-2 hover:bg-muted/20 border-b border-border/10 last:border-b-0">
                                <div className="flex-shrink-0 w-4 h-4 mt-0.5">
                                  {getFaviconUrl(link.url) ? (
                                    <img
                                      src={getFaviconUrl(link.url)!}
                                      alt=""
                                      className="w-4 h-4 rounded"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = "none";
                                      }}
                                    />
                                  ) : (
                                    <Globe className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <a
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-medium text-foreground hover:text-primary line-clamp-1 transition-colors"
                                  >
                                    {link.title}
                                  </a>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-xs text-muted-foreground truncate">
                                      {getHostname(link.url)}
                                    </span>
                                    <span className="text-xs text-muted-foreground/60">
                                      · {formatDate(link.savedAt)}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 opacity-0 group-hover/link:opacity-100 transition-opacity">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => window.open(link.url, "_blank")}
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                    onClick={() => handleRemoveLink(list.id, link.id)}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </AnimatePresence>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))
          )}
        </div>
      </ScrollArea>

      {/* New List Dialog */}
      <Dialog open={showNewListDialog} onOpenChange={setShowNewListDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Create New List</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="List name..."
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateList();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewListDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateList} disabled={!newListName.trim()}>
              <Plus className="w-4 h-4 mr-1" />
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
