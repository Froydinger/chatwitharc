import { useState, useEffect, useMemo } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  Loader2, Rocket, CheckCircle2, ExternalLink, AlertCircle, XCircle, Trash2,
  Pencil, Sparkles, Globe, Copy, Check, Eye, Tag
} from 'lucide-react';
import { PUBLISH_DOMAIN, checkSubdomainAvailability } from '@/lib/deploy';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { FAVICON_OPTIONS, type FaviconOption, getFaviconByLabel } from '@/constants/faviconOptions';
import { generateAppSeoMetadata } from '@/services/generateAppSeo';
import type { VirtualFileSystem } from '@/types/ide';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function optionToSvg(option: FaviconOption): string {
  const iconMarkup = renderToStaticMarkup(
    createElement(option.icon, { size: 24, color: option.color, strokeWidth: 2 })
  );
  const innerMatch = iconMarkup.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  const innerContent = innerMatch ? innerMatch[1] : '';
  
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
    <rect width="48" height="48" rx="10" fill="${option.bg}"/>
    <g transform="translate(12,12)">${innerContent}</g>
  </svg>`;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 45);
}

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentAppTitle?: string | null;
  currentSubdomain: string | null;
  deployedUrl: string | null;
  siteId: string | null;
  prompt?: string;
  files?: VirtualFileSystem;
  initialFaviconLabel?: string | null;
  initialSeoDescription?: string | null;
  initialHideBadge?: boolean;
  onPublish: (
    subdomain: string,
    siteTitle: string,
    faviconSvg: string,
    faviconLabel?: string,
    seoDescription?: string,
    hideBadge?: boolean
  ) => Promise<void>;
  onUnpublish: () => Promise<void>;
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
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(deployedUrl);
    setCopied(true);
    toast.success('Live link copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const onConfirmUnpublish = () => {
    setConfirmOpen(false);
    onClose();
    const attempt = () => onUnpublish();
    attempt().catch(() => {
      setTimeout(() => { attempt().catch(() => {}); }, 2000);
    });
  };

  return (
    <div className="space-y-5 py-2">
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 mb-3 shadow-lg shadow-emerald-500/10">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="font-semibold text-base text-foreground">
          {currentAppTitle || 'Your App is Live'}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Accessible worldwide on high-speed global Netlify edge
        </p>

        <div className="mt-4 flex items-center justify-center gap-2">
          <a
            href={deployedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-background/80 hover:bg-background border border-white/10 px-3.5 py-2 text-xs font-mono font-medium text-emerald-400 hover:text-emerald-300 transition-colors shadow-sm"
          >
            <Globe className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate max-w-[220px]">{deployedUrl.replace(/^https?:\/\//, '')}</span>
            <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
          </a>
          <Button
            size="icon"
            variant="outline"
            onClick={handleCopy}
            className="h-8 w-8 rounded-xl border-white/10 hover:bg-white/10 shrink-0"
            title="Copy link"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
          </Button>
        </div>
      </div>

      <DialogFooter className="flex-row justify-between sm:justify-between pt-2">
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl">
              <Trash2 className="h-3.5 w-3.5" /> Unpublish
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="border-white/10 bg-[#0f1117] text-foreground">
            <AlertDialogHeader>
              <AlertDialogTitle>Unpublish app from the web?</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground text-xs">
                This will take your app offline and delete its deployment. You can always republish it later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-white/10 hover:bg-white/5 rounded-xl text-xs">Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl text-xs"
                onClick={onConfirmUnpublish}
              >
                Unpublish
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button onClick={onEdit} className="gap-1.5 rounded-xl text-xs bg-primary hover:bg-primary/90 text-primary-foreground">
          <Pencil className="h-3.5 w-3.5" /> Update App Settings
        </Button>
      </DialogFooter>
    </div>
  );
}

/* ── Edit / new-publish form ── */
function PublishForm({
  open,
  currentAppTitle,
  currentSubdomain,
  deployedUrl,
  prompt,
  files,
  initialFaviconLabel,
  initialSeoDescription,
  initialHideBadge,
  onPublish,
  onOpenChange,
}: {
  open: boolean;
  currentAppTitle?: string | null;
  currentSubdomain: string | null;
  deployedUrl: string | null;
  prompt?: string;
  files?: VirtualFileSystem;
  initialFaviconLabel?: string | null;
  initialSeoDescription?: string | null;
  initialHideBadge?: boolean;
  onPublish: PublishDialogProps['onPublish'];
  onOpenChange: (open: boolean) => void;
}) {
  const isUpdate = !!deployedUrl;
  const [siteTitle, setSiteTitle] = useState(isUpdate ? (currentAppTitle || '') : '');
  const [subdomain, setSubdomain] = useState(currentSubdomain || (isUpdate && currentAppTitle ? slugify(currentAppTitle) : ''));
  const [seoDescription, setSeoDescription] = useState(initialSeoDescription || '');
  const [hideBadge, setHideBadge] = useState(initialHideBadge || false);
  const [subdomainManuallyEdited, setSubdomainManuallyEdited] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);

  // Favicon selection
  const initialFaviconIndex = useMemo(() => {
    if (initialFaviconLabel) {
      const idx = FAVICON_OPTIONS.findIndex(o => o.label === initialFaviconLabel);
      if (idx >= 0) return idx;
    }
    return 0;
  }, [initialFaviconLabel]);

  const [selectedIndex, setSelectedIndex] = useState(initialFaviconIndex);
  const [aiPickLabel, setAiPickLabel] = useState<string | null>(null);
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(currentSubdomain ? true : null);
  const [isCheckingSubdomain, setIsCheckingSubdomain] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [faviconCategory, setFaviconCategory] = useState<string>('all');

  // Sync state whenever dialog opens
  useEffect(() => {
    if (open) {
      if (isUpdate) {
        setSiteTitle(currentAppTitle || '');
        setSubdomain(currentSubdomain || (currentAppTitle ? slugify(currentAppTitle) : ''));
        setSeoDescription(initialSeoDescription || '');
        setHideBadge(initialHideBadge || false);
      } else {
        setSiteTitle(currentAppTitle || '');
        setSubdomain(currentSubdomain || (currentAppTitle ? slugify(currentAppTitle) : ''));
        setSubdomainManuallyEdited(false);
        setTitleTouched(false);
      }
      setPublishedUrl(null);
      setPublishError(null);
    }
  }, [open, isUpdate, currentAppTitle, currentSubdomain, initialSeoDescription, initialHideBadge]);

  // Real-time Subdomain Availability Checker
  useEffect(() => {
    const clean = slugify(subdomain);
    if (currentSubdomain && clean === currentSubdomain) {
      setIsAvailable(true);
      return;
    }
    if (clean.length === 0) {
      setIsAvailable(null);
      return;
    }
    if (clean.length < 3) {
      setIsAvailable(false);
      return;
    }

    let cancelled = false;
    setIsCheckingSubdomain(true);

    const timer = setTimeout(async () => {
      try {
        const available = await checkSubdomainAvailability(clean);
        if (!cancelled) {
          setIsAvailable(available);
          setIsCheckingSubdomain(false);
        }
      } catch {
        if (!cancelled) {
          setIsAvailable(true);
          setIsCheckingSubdomain(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [subdomain, currentSubdomain]);

  const handleTitleChange = (val: string) => {
    setSiteTitle(val);
    setTitleTouched(true);
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

  // AI Auto-Generate with Luna
  const handleAiGenerate = async () => {
    setIsGeneratingSeo(true);
    try {
      toast.info('Luna is crafting app identity & SEO metadata...');
      const result = await generateAppSeoMetadata({
        prompt: prompt || siteTitle,
        currentTitle: siteTitle,
        files,
      });

      if (result.title) {
        setSiteTitle(result.title);
        setTitleTouched(true);
      }
      if (result.description) {
        setSeoDescription(result.description);
      }
      if (result.subdomain && !isUpdate) {
        setSubdomain(result.subdomain);
      }
      if (result.faviconLabel) {
        const idx = FAVICON_OPTIONS.findIndex(o => o.label === result.faviconLabel);
        if (idx >= 0) {
          setSelectedIndex(idx);
          setAiPickLabel(result.faviconLabel);
        }
      }
      toast.success('Generated metadata & favicon with Luna!');
    } catch (err) {
      toast.error('Could not generate metadata. Using current inputs.');
    } finally {
      setIsGeneratingSeo(false);
    }
  };

  const cleanSubdomain = slugify(subdomain);
  const isTitleValid = siteTitle.trim().length > 0;
  const isSubdomainValid = cleanSubdomain.length >= 3;

  const handlePublish = async () => {
    if (!isTitleValid || !isSubdomainValid) return;
    setIsPublishing(true);
    setPublishError(null);
    try {
      const selectedFavicon = FAVICON_OPTIONS[selectedIndex];
      const faviconSvg = optionToSvg(selectedFavicon);
      await onPublish(
        cleanSubdomain,
        siteTitle.trim(),
        faviconSvg,
        selectedFavicon.label,
        seoDescription.trim(),
        hideBadge
      );
      setPublishedUrl(`https://${cleanSubdomain}.${PUBLISH_DOMAIN}`);
    } catch (err: any) {
      const msg = err?.message || 'Publish failed';
      setPublishError(msg.includes('already taken') ? `Subdomain "${cleanSubdomain}" is already taken. Try a different name.` : msg);
    } finally {
      setIsPublishing(false);
    }
  };

  const selectedFaviconOption = FAVICON_OPTIONS[selectedIndex];
  const SelectedIcon = selectedFaviconOption.icon;

  if (publishedUrl) {
    return (
      <div className="py-6 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <div>
          <p className="font-semibold text-base text-foreground">{isUpdate ? 'Updated successfully!' : 'Published successfully!'}</p>
          <p className="text-xs text-muted-foreground mt-1">Your web application is now active on the web.</p>
        </div>
        <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-2">
          <Globe className="h-4 w-4 text-emerald-400 shrink-0" />
          <a href={publishedUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-emerald-400 hover:underline truncate max-w-[280px]">
            {publishedUrl}
          </a>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" className="rounded-xl border-white/10 hover:bg-white/5 text-xs w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-1">
      {/* AI Auto-generate Hero Pill */}
      <div className="relative overflow-hidden rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-500/15 via-primary/10 to-transparent p-3.5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-400 shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <span>AI Smart Setup</span>
                <span className="text-[8px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1 py-0.2 rounded uppercase">
                  Luna
                </span>
              </h4>
              <p className="text-[10.5px] text-muted-foreground truncate">
                Generate title, favicon, SEO description, and clean URL
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleAiGenerate}
            disabled={isGeneratingSeo || isPublishing}
            className="h-7 px-2.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 text-[11px] font-medium gap-1.5 shrink-0 shadow-sm transition-all"
          >
            {isGeneratingSeo ? (
              <Loader2 className="h-3 w-3 animate-spin text-purple-300" />
            ) : (
              <Sparkles className="h-3 w-3 text-purple-300" />
            )}
            <span>{isGeneratingSeo ? 'Analyzing…' : 'Generate'}</span>
          </Button>
        </div>
      </div>

      {/* Live Social / Google Search Preview Card */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium px-1">
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3 text-primary" /> Live Search & Social Preview
          </span>
          <span className="text-[10px]">Google & OpenGraph</span>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#12141c] p-3 shadow-inner space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
            <div
              className="h-3.5 w-3.5 rounded flex items-center justify-center shrink-0"
              style={{ backgroundColor: selectedFaviconOption.bg }}
            >
              <SelectedIcon size={9} color={selectedFaviconOption.color} />
            </div>
            <span className="truncate max-w-[260px]">https://{cleanSubdomain || 'your-app'}.{PUBLISH_DOMAIN}</span>
          </div>
          <h5 className="text-xs font-semibold text-purple-400 hover:underline cursor-pointer truncate">
            {siteTitle.trim() || 'Your App Title'}
          </h5>
          <p className="text-[11px] text-muted-foreground/90 line-clamp-2 leading-relaxed">
            {seoDescription.trim() || `${siteTitle.trim() || 'Your App'} — Modern web application built with ArcAi.`}
          </p>
        </div>
      </div>

      {/* Main Form Fields */}
      <div className="space-y-3">
        {/* App Title */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="siteTitle" className="text-xs font-medium">App Name</Label>
            <span className="text-[10px] text-muted-foreground">Required</span>
          </div>
          <Input
            id="siteTitle"
            value={siteTitle}
            onChange={(e) => handleTitleChange(e.target.value)}
            onBlur={() => setTitleTouched(true)}
            placeholder="e.g. SoundWave Studio"
            className={cn("h-8 text-xs bg-background/50 border-white/10 rounded-xl", titleTouched && !isTitleValid && "border-destructive focus-visible:ring-destructive")}
            disabled={isPublishing}
            autoFocus={!isUpdate}
          />
          {titleTouched && !isTitleValid && (
            <p className="text-[10px] text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> App name is required
            </p>
          )}
        </div>

        {/* Subdomain */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="subdomain" className="text-xs font-medium">Public URL Subdomain</Label>
            <span className="text-[10px] text-muted-foreground">.{PUBLISH_DOMAIN}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Input
                id="subdomain"
                value={subdomain}
                onChange={(e) => handleSubdomainChange(e.target.value)}
                placeholder="my-cool-app"
                className="h-8 font-mono text-xs bg-background/50 border-white/10 rounded-xl pr-6"
                disabled={isPublishing}
              />
              {isCheckingSubdomain && (
                <Loader2 className="absolute right-2 top-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
            <span className="text-xs font-mono text-muted-foreground/80 px-2 py-1 bg-white/5 border border-white/10 rounded-xl select-none shrink-0">
              .{PUBLISH_DOMAIN}
            </span>
          </div>
          <div className="h-4 flex items-center gap-1.5 text-[10px]">
            {!publishError && !isCheckingSubdomain && isAvailable === true && cleanSubdomain.length >= 3 && (
              <span className="text-emerald-400 flex items-center gap-1 font-medium">
                <CheckCircle2 className="h-3 w-3" /> Subdomain available
              </span>
            )}
            {!publishError && !isCheckingSubdomain && isAvailable === false && cleanSubdomain.length > 0 && (
              <span className="text-destructive flex items-center gap-1 font-medium">
                <XCircle className="h-3 w-3" /> Subdomain unavailable or too short
              </span>
            )}
            {publishError && (
              <span className="text-destructive flex items-center gap-1 font-medium truncate">
                <AlertCircle className="h-3 w-3 shrink-0" /> {publishError}
              </span>
            )}
          </div>
        </div>

        {/* SEO Description */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="seoDescription" className="text-xs font-medium">SEO & Meta Description</Label>
            <span className="text-[10px] text-muted-foreground">{seoDescription.length}/155</span>
          </div>
          <Textarea
            id="seoDescription"
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value.slice(0, 160))}
            placeholder="Briefly describe what your app does for search engines and social links..."
            rows={2}
            className="text-xs bg-background/50 border-white/10 rounded-xl resize-none min-h-[52px]"
            disabled={isPublishing}
          />
        </div>

        {/* Favicon Selector */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">App Icon & Favicon</Label>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              Active: <strong className="text-foreground">{selectedFaviconOption.label}</strong>
              {aiPickLabel === selectedFaviconOption.label && (
                <span className="text-[8px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1 rounded uppercase font-mono">
                  AI Pick
                </span>
              )}
            </span>
          </div>
          <ScrollArea className="h-[96px] rounded-xl border border-white/10 bg-background/40 p-2">
            <div className="grid grid-cols-8 gap-1.5">
              {FAVICON_OPTIONS.map((opt, i) => {
                const Icon = opt.icon;
                const isSelected = selectedIndex === i;
                const isAiPick = aiPickLabel === opt.label;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setSelectedIndex(i)}
                    title={`${opt.label}${isAiPick ? ' (Luna recommendation)' : ''}`}
                    className={cn(
                      "relative h-8 w-8 rounded-lg flex items-center justify-center transition-all border shrink-0",
                      isSelected
                        ? "border-primary ring-2 ring-primary/40 scale-105 shadow-md shadow-primary/20"
                        : "border-white/10 hover:border-white/30 hover:scale-102 opacity-80 hover:opacity-100"
                    )}
                    style={{ backgroundColor: opt.bg }}
                    disabled={isPublishing}
                  >
                    <Icon size={15} color={opt.color} strokeWidth={2} />
                    {isAiPick && !isSelected && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-purple-500 animate-ping" />
                    )}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Built with ArcAi Voluntary Toggle */}
        <div className="flex items-center justify-between p-2.5 rounded-xl border border-white/10 bg-background/40">
          <div className="space-y-0.5 pr-2">
            <div className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-xs font-semibold text-foreground">"Built with ArcAi" Badge</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-tight">
              Displays a subtle floating glass tag in the bottom corner of your live site. Can be shut off voluntarily anytime.
            </p>
          </div>
          <Switch
            checked={!hideBadge}
            onCheckedChange={(checked) => setHideBadge(!checked)}
            disabled={isPublishing}
          />
        </div>
      </div>

      <DialogFooter className="pt-2">
        <Button
          onClick={handlePublish}
          disabled={isPublishing || !isTitleValid || !isSubdomainValid || isAvailable === false}
          className="gap-2 rounded-xl text-xs bg-gradient-to-r from-primary to-primary/85 hover:opacity-95 text-primary-foreground font-semibold w-full sm:w-auto h-9 shadow-lg shadow-primary/15"
        >
          {isPublishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
          {isPublishing ? (isUpdate ? 'Updating Live App…' : 'Publishing to Web…') : (isUpdate ? 'Update App' : 'Publish Live')}
        </Button>
      </DialogFooter>
    </div>
  );
}

/* ── Main dialog ── */
export function PublishDialog({
  open,
  onOpenChange,
  currentAppTitle,
  currentSubdomain,
  deployedUrl,
  siteId,
  prompt,
  files,
  initialFaviconLabel,
  initialSeoDescription,
  initialHideBadge,
  onPublish,
  onUnpublish,
}: PublishDialogProps) {
  const [showEditForm, setShowEditForm] = useState(false);

  useEffect(() => {
    if (!open) setShowEditForm(false);
  }, [open]);

  const isPublished = !!deployedUrl && !showEditForm;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg dark arc-ide-workspace bg-[#0d0e14] border-white/10 text-foreground shadow-2xl rounded-2xl overflow-hidden p-5" style={{ colorScheme: 'dark' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Rocket className="h-4 w-4 text-primary" />
            <span>{isPublished ? 'Live App Management' : (deployedUrl ? 'Update Web App' : 'Publish App to Web')}</span>
            <span className="text-[9px] font-mono font-bold bg-primary/15 text-primary border border-primary/25 px-1.5 py-0.2 rounded uppercase tracking-wider select-none">
              Netlify
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {isPublished
              ? 'Your app is currently live and serving traffic.'
              : `Deploy your React application directly to ${PUBLISH_DOMAIN}.`}
          </DialogDescription>
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
            prompt={prompt}
            files={files}
            initialFaviconLabel={initialFaviconLabel}
            initialSeoDescription={initialSeoDescription}
            initialHideBadge={initialHideBadge}
            onPublish={onPublish}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
