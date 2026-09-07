import { useState, useEffect } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Rocket, CheckCircle2, ExternalLink, AlertCircle, XCircle, Trash2, Pencil } from 'lucide-react';
import { PUBLISH_DOMAIN } from '@/lib/deploy';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { FAVICON_OPTIONS, type FaviconOption } from '@/constants/faviconOptions';
import { cn } from '@/lib/utils';

function optionToSvg(option: FaviconOption): string {
  const iconMarkup = renderToStaticMarkup(
    createElement(option.icon, { size: 24, color: option.color, strokeWidth: 2 })
  );
  // Extract the inner content of the SVG (everything between <svg ...> and </svg>)
  const innerMatch = iconMarkup.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  const innerContent = innerMatch ? innerMatch[1] : '';
  
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
    <rect width="48" height="48" rx="10" fill="${option.bg}"/>
    <g transform="translate(12,12)">${innerContent}</g>
  </svg>`;
}

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentAppTitle?: string | null;
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
  currentAppTitle,
  onEdit,
  onUnpublish,
  onClose,
}: {
  deployedUrl: string;
  currentSubdomain: string | null;
  currentAppTitle?: string | null;
  onEdit: () => void;
  onUnpublish: () => Promise<void>;
  onClose: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onConfirmUnpublish = () => {
    // Close both dialogs immediately — no blocking overlay
    setConfirmOpen(false);
    onClose();

    // Fire-and-forget with one background retry
    const attempt = () => onUnpublish();
    attempt().catch(() => {
      // Retry once after 2s
      setTimeout(() => {
        attempt().catch(() => {
          // Both attempts failed — already toasted from IDECanvasPanel
        });
      }, 2000);
    });
  };

  return (
    <>
      <div className="py-6 text-center space-y-4">
        <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
        <div className="space-y-1">
          <p className="font-semibold text-sm">{currentAppTitle || 'Your app is live'}</p>
          {deployedUrl && (
            <p className="text-xs text-muted-foreground">{deployedUrl.replace(/^https?:\/\//, '')}</p>
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
      </div>

      <DialogFooter className="flex-row justify-between sm:justify-between">
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" /> Unpublish
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unpublish app?</AlertDialogTitle>
              <AlertDialogDescription>
                This will take your app offline and delete it from the web. You can always republish later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={onConfirmUnpublish}
              >
                Unpublish
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button onClick={onEdit} className="gap-1.5">
          <Pencil className="h-3.5 w-3.5" /> Update App
        </Button>
      </DialogFooter>
    </>
  );
}

/* ── Edit / new-publish form ── */
function PublishForm({
  open,
  currentAppTitle,
  currentSubdomain,
  deployedUrl,
  siteId,
  onPublish,
  onOpenChange,
}: {
  open: boolean;
  currentAppTitle?: string | null;
  currentSubdomain: string | null;
  deployedUrl: string | null;
  siteId: string | null;
  onPublish: PublishDialogProps['onPublish'];
  onOpenChange: (open: boolean) => void;
}) {
  const isUpdate = !!deployedUrl;
  const [siteTitle, setSiteTitle] = useState(isUpdate ? (currentAppTitle || '') : '');
  const [subdomain, setSubdomain] = useState(currentSubdomain || (isUpdate && currentAppTitle ? slugify(currentAppTitle) : ''));
  const [subdomainManuallyEdited, setSubdomainManuallyEdited] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(currentSubdomain ? true : null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Sync state whenever dialog opens or edit mode starts
  useEffect(() => {
    if (open) {
      if (isUpdate) {
        setSiteTitle(currentAppTitle || '');
        setSubdomain(currentSubdomain || (currentAppTitle ? slugify(currentAppTitle) : ''));
      } else {
        setSiteTitle('');
        setSubdomain('');
        setSubdomainManuallyEdited(false);
        setTitleTouched(false);
      }
      setPublishedUrl(null);
      setPublishError(null);
    }
  }, [open, isUpdate, currentAppTitle, currentSubdomain]);

  useEffect(() => {
    const clean = slugify(subdomain);
    if (currentSubdomain && clean === currentSubdomain) { setIsAvailable(true); return; }
    if (clean.length === 0) { setIsAvailable(null); return; }
    if (clean.length < 3) { setIsAvailable(false); return; }
    setIsAvailable(true);
  }, [subdomain, currentSubdomain]);

  const handleTitleChange = (val: string) => {
    setSiteTitle(val);
    setTitleTouched(true);
    // On first publish, auto-sync subdomain with app name as long as user hasn't manually edited subdomain
    if (!subdomainManuallyEdited && !isUpdate) {
      setSubdomain(slugify(val));
      setPublishError(null);
    }
  };

  const handleSubdomainChange = (val: string) => {
    setSubdomain(val);
    setSubdomainManuallyEdited(true);
    setPublishError(null);
  };

  const cleanSubdomain = slugify(subdomain);
  const isTitleValid = siteTitle.trim().length > 0;
  const isSubdomainValid = cleanSubdomain.length >= 3;

  const handlePublish = async () => {
    if (!isTitleValid || !isSubdomainValid) return;
    setIsPublishing(true);
    setPublishError(null);
    try {
      const faviconSvg = optionToSvg(FAVICON_OPTIONS[selectedIndex]);
      await onPublish(cleanSubdomain, siteTitle.trim(), faviconSvg);
      setPublishedUrl(`https://${cleanSubdomain}.${PUBLISH_DOMAIN}`);
    } catch (err: any) {
      const msg = err?.message || 'Publish failed';
      setPublishError(msg.includes('already taken') ? `Subdomain "${cleanSubdomain}" is already taken. Try a different name.` : msg);
    } finally { setIsPublishing(false); }
  };

  if (publishedUrl) {
    return (
      <>
        <div className="py-6 text-center space-y-3">
          <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
          <p className="font-semibold text-sm">{isUpdate ? 'Updated successfully!' : 'Published successfully!'}</p>
          <a href={publishedUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="inline-flex items-center gap-1.5 text-primary hover:underline text-sm">
            <ExternalLink className="h-3.5 w-3.5" /> {publishedUrl}
          </a>
          <p className="text-xs text-muted-foreground">Your app is now live. Share this link with anyone!</p>
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
        Configure your app before {isUpdate ? 'updating' : 'publishing'} to <strong>{cleanSubdomain || '...'}.{PUBLISH_DOMAIN}</strong>
      </DialogDescription>

      <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-2.5 flex items-start gap-2 mt-2">
        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[10.5px] leading-normal text-amber-500/80">
          <strong>Beta warning:</strong> Multi-page applications are currently unstable. Please expect temporary routing or layout issues on deployed sites.
        </p>
      </div>

      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="siteTitle">App Name</Label>
            <span className="text-[10px] text-muted-foreground font-medium">Required</span>
          </div>
          <Input
            id="siteTitle"
            value={siteTitle}
            onChange={(e) => handleTitleChange(e.target.value)}
            onBlur={() => setTitleTouched(true)}
            placeholder="e.g. My Cool App"
            className={cn("text-sm", titleTouched && !isTitleValid && "border-destructive focus-visible:ring-destructive")}
            disabled={isPublishing}
            autoFocus={!isUpdate}
          />
          {titleTouched && !isTitleValid ? (
            <p className="text-[11px] text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> App name is required
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">Shown in the browser tab and app header</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Favicon</Label>
          <ScrollArea className="h-[120px] rounded-md border border-border/40 p-2">
            <div className="flex flex-wrap gap-1.5">
              {FAVICON_OPTIONS.map((opt, i) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setSelectedIndex(i)}
                    title={opt.label}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all border ${
                      selectedIndex === i
                        ? 'border-primary ring-2 ring-primary/30 scale-110'
                        : 'border-border/40 hover:border-primary/50'
                    }`}
                    style={{ backgroundColor: opt.bg }}
                    disabled={isPublishing}
                  >
                    <Icon size={18} color={opt.color} strokeWidth={2} />
                  </button>
                );
              })}
            </div>
          </ScrollArea>
          <p className="text-[11px] text-muted-foreground">
            Selected: <span className="font-medium text-foreground">{FAVICON_OPTIONS[selectedIndex].label}</span>
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="subdomain">Subdomain</Label>
          <div className="flex items-center gap-1">
            <Input
              id="subdomain"
              value={subdomain}
              onChange={(e) => handleSubdomainChange(e.target.value)}
              placeholder="my-cool-app"
              className="font-mono text-sm"
              disabled={isPublishing}
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">.{PUBLISH_DOMAIN}</span>
          </div>
          <div className="h-5 flex items-center gap-1.5">
            {!publishError && isAvailable === true && cleanSubdomain.length >= 3 && (
              <span className="text-xs text-primary flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Available
              </span>
            )}
            {!publishError && isAvailable === false && cleanSubdomain.length > 0 && (
              <span className="text-xs text-destructive flex items-center gap-1">
                <XCircle className="h-3 w-3" /> Too short — min 3 characters
              </span>
            )}
            {publishError && (
              <span className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" /> {publishError}
              </span>
            )}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button
          onClick={handlePublish}
          disabled={isPublishing || !isTitleValid || !isSubdomainValid || isAvailable === false}
          className="gap-1.5"
        >
          {isPublishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
          {isPublishing ? (isUpdate ? 'Updating…' : 'Publishing…') : (isUpdate ? 'Update' : 'Publish')}
        </Button>
      </DialogFooter>
    </>
  );
}

/* ── Main dialog ── */
export function PublishDialog({
  open, onOpenChange, currentAppTitle, currentSubdomain, deployedUrl, siteId, onPublish, onUnpublish,
}: PublishDialogProps) {
  const [showEditForm, setShowEditForm] = useState(false);

  useEffect(() => {
    if (!open) setShowEditForm(false);
  }, [open]);

  const isPublished = !!deployedUrl && !showEditForm;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md dark arc-ide-workspace bg-[#0f1117] border-white/10 text-foreground" style={{ colorScheme: 'dark' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-4 w-4" /> {isPublished ? 'Published App' : (deployedUrl ? 'Update App' : 'Publish App to Web')}
            <span className="text-[9px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider select-none">Beta</span>
          </DialogTitle>
        </DialogHeader>

        {isPublished ? (
          <PublishedStatusView
            deployedUrl={deployedUrl!}
            currentSubdomain={currentSubdomain}
            currentAppTitle={currentAppTitle}
            onEdit={() => setShowEditForm(true)}
            onUnpublish={onUnpublish}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <PublishForm
            open={open}
            currentAppTitle={currentAppTitle}
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
