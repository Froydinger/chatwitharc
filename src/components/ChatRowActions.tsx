import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { MoreHorizontal, Pin, PinOff, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

export function ChatRowActions({ title = "", onRename, pinned, onPin, onDelete }: { title?: string; onRename?: (title: string) => Promise<void>; pinned: boolean; onPin: (value: boolean) => Promise<void>; onDelete: () => Promise<void> | void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(title);
  return (
    <div className="w-11 shrink-0" onClick={event => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-11 w-11 rounded-full" aria-label="Chat options" disabled={busy}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => { setBusy(true); void onPin(!pinned).catch(() => toast.error('Could not save the pin. Please try again.')).finally(() => setBusy(false)); }}>{pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}{pinned ? 'Unpin chat' : 'Pin chat'}</DropdownMenuItem>
          {onRename && <DropdownMenuItem onSelect={() => { setDraft(title); setRenaming(true); }}><Pencil className="mr-2 h-4 w-4" /> Rename chat</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => setConfirm(true)}><Trash2 className="mr-2 h-4 w-4" /> Delete chat</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={renaming} onOpenChange={setRenaming}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Rename chat</AlertDialogTitle><AlertDialogDescription>Choose a name for this saved conversation.</AlertDialogDescription></AlertDialogHeader><Input aria-label="Chat name" value={draft} maxLength={120} onChange={event => setDraft(event.target.value)} /><AlertDialogFooter><AlertDialogCancel className="rounded-full" disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction className="rounded-full" disabled={busy || !draft.trim()} onClick={event => { event.preventDefault(); if (!onRename || !draft.trim()) return; setBusy(true); void onRename(draft.trim()).then(() => setRenaming(false)).catch(() => toast.error('Could not save the chat name.')).finally(() => setBusy(false)); }}>Save name</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this chat?</AlertDialogTitle><AlertDialogDescription>This removes the saved conversation. You cannot undo this action.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel><AlertDialogAction className="rounded-full" onClick={() => { setBusy(true); void Promise.resolve(onDelete()).catch(() => toast.error('Could not delete this chat.')).finally(() => setBusy(false)); }}>Delete chat</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
