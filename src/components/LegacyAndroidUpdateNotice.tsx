import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ANDROID_APK_URL } from '@/lib/androidDownload';
import { needsAndroidMigrationUpdate } from '@/lib/androidUpdateNotice';

const dismissalKey = 'arcai-android-native-updater-migration-dismissed';
export function LegacyAndroidUpdateNotice() {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined' || !needsAndroidMigrationUpdate(navigator.userAgent, window.location.search)) return false;
    try { return localStorage.getItem(dismissalKey) !== 'true'; } catch { return true; }
  });
  const dismiss = () => {
    setOpen(false);
    try { localStorage.setItem(dismissalKey, 'true'); } catch { /* Dismissal remains valid for this session. */ }
  };
  return <Dialog open={open} onOpenChange={next => { if (!next) dismiss(); }}>
    <DialogContent className="glass-card max-w-md">
      <DialogHeader>
        <DialogTitle>An Android update is ready</DialogTitle>
        <DialogDescription>Download the latest ArcAI app, then open Downloads and tap the APK to install the update. Future versions can notify you in the app.</DialogDescription>
      </DialogHeader>
      <Button asChild><a href={ANDROID_APK_URL} onClick={dismiss}>Download the Android update</a></Button>
      <Button variant="ghost" onClick={dismiss}>Later</Button>
    </DialogContent>
  </Dialog>;
}
