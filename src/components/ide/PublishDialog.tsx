import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Rocket, CheckCircle2, ExternalLink, AlertCircle, XCircle, Trash2, Pencil } from 'lucide-react';

const FAVICON_OPTIONS = [
  { emoji: '🚀', label: 'Rocket' },
  { emoji: '⚡', label: 'Lightning' },
  { emoji: '🌐', label: 'Globe' },
  { emoji: '⭐', label: 'Star' },
  { emoji: '💎', label: 'Gem' },
  { emoji: '🎯', label: 'Target' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '💡', label: 'Idea' },
];

function emojiToSvg(emoji: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#6366f1"/><text x="50" y="72" text-anchor="middle" font-size="52" font-family="sans-serif">${emoji}</text></svg>`;
}

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  currentSubdomain: string | null;
  deployedUrl: string | null;
  siteId: string | null;
  onPublish: (subdomain: string, siteTitle: string, faviconSvg: string) => Promise<void>;
  onUnpublish: () => Promise<void>;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}

/* ── Status view for already-published sites ── */
function PublishedStatusView({
  deployedUrl,
  currentSubdomain,
  onEdit,
  onUnpublish,
  onClose,
}: {
  deployedUrl: string;
  currentSubdomain: string | null;
  onEdit: () => void;
  onUnpublish: () => Promise<void>;
  onClose: () => void;
}) {
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <div className="py-6 text-center space-y-4">
        <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
        <div className="space-y-1">
          <p className="font-semibold text-sm">Your site is live</p>
          {currentSubdomain && (
            <p className="text-xs text-muted-foreground">{currentSubdomain}.froydingermedia.online</p>
          )}
        </div>
        <a
          href={deployedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-primary hover:underline text-sm"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {deployedUrl}
        </a>
        {error && (
          <p className="text-xs text-destructive flex items-center justify-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> {error}
          </p>
        )}
      </div>

      <DialogFooter className="flex-row justify-between sm:justify-between">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="gap-1.5" disabled={isUnpublishing}>
              {isUnpublishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {isUnpublishing ? 'Unpublishing…' : 'Unpublish'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unpublish site?</AlertDialogTitle>
              <AlertDialogDescription>
                This will take your site offline and delete it from the web. You can always republish later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={async () => {
                  setIsUnpublishing(true);
                  setError(null);
                  try {
                    await onUnpublish();
                    onClose();
                  } catch {
                    setError('Failed to unpublish');
                  } finally {
                    setIsUnpublishing(false);
                  }
                }}
              >
                Unpublish
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button onClick={onEdit} className="gap-1.5">
          <Pencil className="h-3.5 w-3.5" /> Update Site
        </Button>
      </DialogFooter>
    </>
  );
}

/* ── Edit / new-publish form ── */
function PublishForm({
  projectName,
  currentSubdomain,
  deployedUrl,
  siteId,
  onPublish,
  onOpenChange,
}: {
  projectName: string;
  currentSubdomain: string | null;
  deployedUrl: string | null;
  siteId: string | null;
  onPublish: PublishDialogProps['onPublish'];
  onOpenChange: (open: boolean) => void;
}) {
  const isUpdate = !!deployedUrl;
  const [subdomain, setSubdomain] = useState(currentSubdomain || slugify(projectName));
  const [siteTitle, setSiteTitle] = useState(projectName);
  const [selectedEmoji, setSelectedEmoji] = useState('🚀');
  const [isAvailable, setIsAvailable] = useState<boolean | null>(currentSubdomain ? true : null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    const clean = slugify(subdomain);
    if (currentSubdomain && clean === currentSubdomain) { setIsAvailable(true); return; }
    if (clean.length < 3) { setIsAvailable(null); return; }
    setIsAvailable(true); // Custom domains are always available
  }, [subdomain, currentSubdomain]);

  const handlePublish = async () => {
    setIsPublishing(true);
    setPublishError(null);
    try {
      const faviconSvg = emojiToSvg(selectedEmoji);
      await onPublish(slugify(subdomain), siteTitle, faviconSvg);
      setPublishedUrl(`https://${slugify(subdomain)}.froydingermedia.online`);
    } catch (err: any) {
      const msg = err?.message || 'Publish failed';
      setPublishError(msg.includes('already taken') ? `Subdomain "${slugify(subdomain)}" is already taken. Try a different name.` : msg);
    } finally { setIsPublishing(false); }
  };

  const cleanSubdomain = slugify(subdomain);

  if (publishedUrl) {
    return (
      <>
        <div className="py-6 text-center space-y-3">
          <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
          <p className="font-semibold text-sm">{isUpdate ? 'Updated successfully!' : 'Published successfully!'}</p>
          <a href={publishedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline text-sm">
            <ExternalLink className="h-3.5 w-3.5" /> {publishedUrl}
          </a>
          <p className="text-xs text-muted-foreground">Your site is now live. Share this link with anyone!</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogDescription>
        Configure your site before {isUpdate ? 'updating' : 'publishing'} to <strong>{cleanSubdomain || '...'}.froydingermedia.online</strong>
      </DialogDescription>

      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="siteTitle">Site Title</Label>
          <Input id="siteTitle" value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} placeholder="My Cool App" className="text-sm" disabled={isPublishing} />
          <p className="text-[11px] text-muted-foreground">Shown in the browser tab</p>
        </div>

        <div className="space-y-2">
          <Label>Favicon</Label>
          <div className="flex flex-wrap gap-1.5">
            {FAVICON_OPTIONS.map(({ emoji, label }) => (
              <button key={emoji} type="button" onClick={() => setSelectedEmoji(emoji)} title={label}
                className={`w-9 h-9 rounded-md text-lg flex items-center justify-center transition-all border ${selectedEmoji === emoji ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border hover:border-primary/50 bg-background'}`}
                disabled={isPublishing}>{emoji}</button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="subdomain">Subdomain</Label>
          <div className="flex items-center gap-1">
            <Input id="subdomain" value={subdomain} onChange={(e) => { setSubdomain(e.target.value); setPublishError(null); }} placeholder="my-cool-app" className="font-mono text-sm" disabled={isPublishing} />
            <span className="text-xs text-muted-foreground whitespace-nowrap">.froydingermedia.online</span>
          </div>
          <div className="h-5 flex items-center gap-1.5">
            {!publishError && isAvailable === true && cleanSubdomain.length >= 3 && <span className="text-xs text-primary flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Available</span>}
            {!publishError && isAvailable === false && <span className="text-xs text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" /> Too short — min 3 characters</span>}
            {publishError && <span className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> {publishError}</span>}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button onClick={handlePublish} disabled={isPublishing || isAvailable !== true || cleanSubdomain.length < 3 || !siteTitle.trim()} className="gap-1.5">
          {isPublishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
          {isPublishing ? (isUpdate ? 'Updating…' : 'Publishing…') : (isUpdate ? 'Update' : 'Publish')}
        </Button>
      </DialogFooter>
    </>
  );
}

/* ── Main dialog ── */
export function PublishDialog({
  open, onOpenChange, projectName, currentSubdomain, deployedUrl, siteId, onPublish, onUnpublish,
}: PublishDialogProps) {
  const [showEditForm, setShowEditForm] = useState(false);

  useEffect(() => {
    if (!open) setShowEditForm(false);
  }, [open]);

  const isPublished = !!deployedUrl && !showEditForm;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-4 w-4" /> {isPublished ? 'Published Site' : 'Publish to Web'}
          </DialogTitle>
        </DialogHeader>

        {isPublished ? (
          <PublishedStatusView
            deployedUrl={deployedUrl!}
            currentSubdomain={currentSubdomain}
            onEdit={() => setShowEditForm(true)}
            onUnpublish={onUnpublish}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <PublishForm
            projectName={projectName}
            currentSubdomain={currentSubdomain}
            deployedUrl={deployedUrl}
            siteId={siteId}
            onPublish={onPublish}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
