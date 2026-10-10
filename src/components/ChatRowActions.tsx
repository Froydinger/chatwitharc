import { Input } from '@/components/ui/input';
import { useRef, useState } from 'react';
import { Check, Folder, MoreHorizontal, Pin, PinOff, Trash2, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

type ChatFolderOption = { id: string; name: string };

export function ChatRowActions({ title = "", onRename, pinned, onPin, onDelete, folders = [], folderId, onMove, workspaceUI = false }: { workspaceUI?: boolean; title?: string; onRename?: (title: string) => Promise<void>; pinned: boolean; onPin: (value: boolean) => Promise<void>; onDelete: () => Promise<void> | void; folders?: ChatFolderOption[]; folderId?: string; onMove?: (folderId: string | null) => Promise<void> }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuClass = workspaceUI ? "workspace-ui ws-menu ws-chat-actions-menu" : undefined;
  const dialogClass = workspaceUI ? "workspace-ui ws-chat-actions-dialog" : undefined;
  const restoreFocus = (event: Event) => { if (workspaceUI) { event.preventDefault(); triggerRef.current?.focus(); } };
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(title);
  const moveTo = (targetFolderId: string | null) => {
    if (!onMove) return;
    setBusy(true);
    void onMove(targetFolderId).catch(() => toast.error('Could not move this chat. Please try again.')).finally(() => setBusy(false));
  };
  return (
    <div className={workspaceUI ? "ws-chat-row-actions" : "w-11 shrink-0"} onClick={event => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button ref={triggerRef} size="icon" variant="ghost" className={workspaceUI ? "ws-icon-button ws-chat-options" : "h-11 w-11 rounded-full"} aria-label={workspaceUI ? `Options for ${title || 'Untitled chat'}` : "Chat options"} disabled={busy}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className={menuClass} collisionPadding={workspaceUI ? 12 : undefined} onCloseAutoFocus={workspaceUI ? event => { if (renaming || confirm) event.preventDefault(); } : undefined}>
          <DropdownMenuItem onSelect={() => { setBusy(true); void onPin(!pinned).catch(() => toast.error('Could not save the pin. Please try again.')).finally(() => setBusy(false)); }}>{pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}{pinned ? 'Unpin chat' : 'Pin chat'}</DropdownMenuItem>
          {onMove && <DropdownMenuSub>
            <DropdownMenuSubTrigger><Folder className="mr-2 h-4 w-4" />Move to folder</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className={workspaceUI ? menuClass : "w-56"} collisionPadding={workspaceUI ? 12 : undefined}>
              {folderId && <DropdownMenuItem onSelect={() => moveTo(null)}><X className="mr-2 h-4 w-4" />Remove from folder</DropdownMenuItem>}
              {folderId && folders.length > 0 && <DropdownMenuSeparator />}
              {folders.length === 0 ? <DropdownMenuItem disabled>No folders yet</DropdownMenuItem> : folders.map(folder => <DropdownMenuItem key={folder.id} disabled={folder.id === folderId} onSelect={() => moveTo(folder.id)}><Folder className="mr-2 h-4 w-4" /><span className="min-w-0 flex-1 truncate">{folder.name}</span>{folder.id === folderId && <><span className="sr-only">Current folder</span><Check aria-hidden="true" className="ml-2 h-4 w-4" /></>}</DropdownMenuItem>)}
            </DropdownMenuSubContent>
          </DropdownMenuSub>}
          {onRename && <DropdownMenuItem onSelect={() => { setDraft(title); setRenaming(true); }}><Pencil className="mr-2 h-4 w-4" /> Rename chat</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => setConfirm(true)}><Trash2 className="mr-2 h-4 w-4" /> Delete chat</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={renaming} onOpenChange={setRenaming}>
        <AlertDialogContent className={dialogClass} layer={workspaceUI ? 12030 : undefined} onCloseAutoFocus={restoreFocus}><AlertDialogHeader><AlertDialogTitle>Rename chat</AlertDialogTitle><AlertDialogDescription>Choose a name for this saved conversation.</AlertDialogDescription></AlertDialogHeader><Input aria-label="Chat name" value={draft} maxLength={120} onChange={event => setDraft(event.target.value)} /><AlertDialogFooter><AlertDialogCancel className="rounded-full" disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction className="rounded-full" disabled={busy || !draft.trim()} onClick={event => { event.preventDefault(); if (!onRename || !draft.trim()) return; setBusy(true); void onRename(draft.trim()).then(() => setRenaming(false)).catch(() => toast.error('Could not save the chat name.')).finally(() => setBusy(false)); }}>Save name</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent className={dialogClass} layer={workspaceUI ? 12030 : undefined} onCloseAutoFocus={restoreFocus}><AlertDialogHeader><AlertDialogTitle>Delete this chat?</AlertDialogTitle><AlertDialogDescription>This removes the saved conversation. You cannot undo this action.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel><AlertDialogAction className="rounded-full" onClick={() => { setBusy(true); void Promise.resolve(onDelete()).catch(() => toast.error('Could not delete this chat.')).finally(() => setBusy(false)); }}>Delete chat</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
