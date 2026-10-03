import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { needsSignedMacUpdate } from '@/lib/macUpdateNotice';

const dismissalKey = 'arcai-signed-mac-migration-notice-dismissed';
export function LegacyMacUpdateNotice() {
  const [open, setOpen] = useState(() => {
    if (typeof navigator === 'undefined' || !needsSignedMacUpdate(navigator.userAgent)) return false;
    try { return localStorage.getItem(dismissalKey) !== 'true'; } catch { return true; }
  });
  const dismiss = () => {
    setOpen(false);
    try { localStorage.setItem(dismissalKey, 'true'); } catch { /* Dismissal remains valid for this session. */ }
  };
  return <Dialog open={open} onOpenChange={next => { if (!next) dismiss(); }}>
    <DialogContent className="glass-card max-w-md">
      <DialogHeader>
        <DialogTitle>A Mac update is ready</DialogTitle>
        <DialogDescription>If Restart Now did not finish the update, download the signed installer and replace ArcAI in Applications. Your chats and settings stay with you.</DialogDescription>
      </DialogHeader>
      <Button asChild><a href="/downloads" onClick={dismiss}>Get the Mac update</a></Button>
      <Button variant="ghost" onClick={dismiss}>Later</Button>
    </DialogContent>
  </Dialog>;
}
