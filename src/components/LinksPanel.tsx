// src/components/LinksPanel.tsx
import React, { useMemo, useState } from "react";
import { Link2, Trash2, ChevronDown, ChevronRight, Pencil, X, Plus } from "lucide-react";

// UI components (assumed available in your project)
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";

// Hooks (assumed available)
import { useToast } from "@/hooks/use-toast";
import { useSearchStore } from "@/store/useSearchStore"; // adjust path if different

// A defensive, typed shape to help readability
type LinkItem = {
  id: string;
  url: string;
  title?: string;
  timestamp?: number;
};

type LinkList = {
  id: string;
  name: string;
  links: LinkItem[];
};

export function LinksPanel() {
  const { lists, createList, deleteList, renameList, removeLink } = useSearchStore();
  const { toast } = useToast();

  // Track which lists are expanded
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set(["default"]));
  // New list dialog
  const [showNewListDialog, setShowNewListDialog] = useState(false);
  const [newListName, setNewListName] = useState("");
  // Inline rename
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editListName, setEditListName] = useState("");

  const totalLinks = useMemo(
    () => lists.reduce((acc: number, list: LinkList) => acc + (list.links?.length ?? 0), 0),
    [lists],
  );

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
    const name = newListName.trim();
    if (!name) {
      toast({ title: "Please enter a list name" });
      return;
    }
    try {
      createList(name);
      setNewListName("");
      setShowNewListDialog(false);
      toast({ title: "List created" });
    } catch (err) {
      toast({ title: "Failed to create list" });
    }
  };

  const handleStartRename = (listId: string, currentName: string) => {
    setEditingListId(listId);
    setEditListName(currentName);
  };

  const handleRenameList = (listId: string) => {
    const name = editListName.trim();
    if (!name) {
      toast({ title: "Please enter a valid name" });
      return;
    }
    try {
      renameList(listId, name);
      setEditingListId(null);
      setEditListName("");
      toast({ title: "List renamed" });
    } catch (err) {
      toast({ title: "Failed to rename list" });
    }
  };

  const handleCancelRename = () => {
    setEditingListId(null);
    setEditListName("");
  };

  const handleDeleteList = (listId: string, listName: string) => {
    const confirmed = window.confirm(`Delete list "${listName}"? This cannot be undone.`);
    if (!confirmed) return;
    try {
      deleteList(listId);
      // If it was expanded, collapse state is fine; no need to adjust
      toast({ title: `Deleted "${listName}"` });
    } catch (err) {
      toast({ title: "Failed to delete list" });
    }
  };

  const handleRemoveLink = (listId: string, linkId: string) => {
    try {
      removeLink(listId, linkId);
      toast({ title: "Link removed" });
    } catch (err) {
      toast({ title: "Failed to remove link" });
    }
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
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "";
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
            aria-label="Create new list"
            title="Create new list"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Lists */}
      <div className="flex-1 overflow-auto px-2 py-2">
        {lists.length === 0 ? (
          <div className="text-sm text-muted-foreground px-2 py-6">No lists yet. Create one with the + button.</div>
        ) : (
          <div className="space-y-2">
            {lists.map((list: LinkList) => {
              const isOpen = expandedLists.has(list.id);
              const isEditing = editingListId === list.id;

              return (
                <div key={list.id} className="rounded-md border border-border/30 bg-background/50">
                  <Collapsible open={isOpen} onOpenChange={() => toggleList(list.id)}>
                    <div className="flex items-center justify-between px-3 py-2">
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-2 hover:opacity-80"
                          onClick={() => toggleList(list.id)}
                          aria-expanded={isOpen}
                          aria-controls={`list-${list.id}-content`}
                        >
                          {isOpen ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={editListName}
                                onChange={(e) => setEditListName(e.target.value)}
                                className="h-7 w-40"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleRenameList(list.id);
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    handleCancelRename();
                                  }
                                }}
                              />
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-7"
                                onClick={() => handleRenameList(list.id)}
                              >
                                Save
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7" onClick={handleCancelRename}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-sm font-medium text-foreground">
                              {list.name}{" "}
                              <span className="text-xs text-muted-foreground">({list.links?.length ?? 0})</span>
                            </span>
                          )}
                        </button>
                      </CollapsibleTrigger>

                      <div className="flex items-center gap-1">
                        {!isEditing && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleStartRename(list.id, list.name)}
                            aria-label={`Rename ${list.name}`}
                            title="Rename list"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                          onClick={() => handleDeleteList(list.id, list.name)}
                          aria-label={`Delete ${list.name}`}
                          title="Delete list"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <CollapsibleContent id={`list-${list.id}-content`}>
                      <Separator className="opacity-50" />
                      <div className="px-3 py-2 space-y-2">
                        {list.links?.length ? (
                          list.links.map((link) => {
                            const favicon = getFaviconUrl(link.url);
                            const hostname = getHostname(link.url);
                            const date = formatDate(link.timestamp);

                            return (
                              <div
                                key={link.id}
                                className="flex items-center justify-between rounded-sm px-2 py-2 hover:bg-muted/30"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {favicon ? (
                                    <img
                                      src={favicon}
                                      alt=""
                                      className="w-4 h-4 rounded-sm"
                                      loading="lazy"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <div className="w-4 h-4 rounded-sm bg-muted" />
                                  )}
                                  <div className="flex flex-col min-w-0">
                                    <a
                                      href={link.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-sm text-foreground truncate hover:underline"
                                      title={link.title || link.url}
                                    >
                                      {link.title || link.url}
                                    </a>
                                    <div className="text-xs text-muted-foreground truncate">
                                      {hostname}
                                      {date ? ` • ${date}` : ""}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => handleRemoveLink(list.id, link.id)}
                                    aria-label="Remove link"
                                    title="Remove link"
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-xs text-muted-foreground px-1 py-2">No links in this list.</div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New List Dialog */}
      <Dialog open={showNewListDialog} onOpenChange={setShowNewListDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create new list</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Input
              placeholder="List name"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateList();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowNewListDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateList}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
