import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { Rocket, Globe, Loader2, X, Check, AlertCircle, Upload, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { checkSubdomainAvailability, PUBLISH_DOMAIN } from '@/lib/deploy';
import { useSubscription } from '@/hooks/useSubscription';

const DEFAULT_FAVICON_SRC = '/arc-logo-cropped.png';
const MAX_ICON_BYTES = 1024 * 1024;
const MAX_ICON_DIMENSION = 4096;
const NORMALIZED_ICON_SIZE = 128;

type SupportedIconMime = 'image/png' | 'image/jpeg' | 'image/webp';

const SUPPORTED_ICON_TYPES = new Set<SupportedIconMime>([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export interface PublishOpts {
  subdomain: string;
  title: string;
  faviconData?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImageUrl?: string;
}

interface PublishModalProps {
  open: boolean;
  onClose: () => void;
  onPublish: (opts: PublishOpts) => Promise<void>;
  defaultTitle?: string;
}

function detectImageType(bytes: Uint8Array): SupportedIconMime | null {
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

async function normalizeIcon(file: File): Promise<string> {
  if (file.size <= 0) {
    throw new Error('That image is empty. Choose another file.');
  }
  if (file.size > MAX_ICON_BYTES) {
    throw new Error('Icon must be 1 MB or smaller.');
  }

  const declaredType = file.type.toLowerCase();
  if (declaredType && !SUPPORTED_ICON_TYPES.has(declaredType as SupportedIconMime)) {
    throw new Error('Choose a PNG, JPEG, or WebP image.');
  }

  const buffer = await file.arrayBuffer();
  const detectedType = detectImageType(new Uint8Array(buffer));
  if (!detectedType || (declaredType && declaredType !== detectedType)) {
    throw new Error('That file is not a valid PNG, JPEG, or WebP image.');
  }

  const sourceUrl = URL.createObjectURL(new Blob([buffer], { type: detectedType }));
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = sourceUrl;
    await image.decode();

    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error('That image has invalid dimensions.');
    }
    if (image.naturalWidth > MAX_ICON_DIMENSION || image.naturalHeight > MAX_ICON_DIMENSION) {
      throw new Error('Icon dimensions must be 4096 × 4096 or smaller.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = NORMALIZED_ICON_SIZE;
    canvas.height = NORMALIZED_ICON_SIZE;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Your browser could not process that image.');
    }

    const scale = Math.min(
      NORMALIZED_ICON_SIZE / image.naturalWidth,
      NORMALIZED_ICON_SIZE / image.naturalHeight,
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const x = Math.round((NORMALIZED_ICON_SIZE - width) / 2);
    const y = Math.round((NORMALIZED_ICON_SIZE - height) / 2);

    context.clearRect(0, 0, NORMALIZED_ICON_SIZE, NORMALIZED_ICON_SIZE);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, x, y, width, height);

    const dataUrl = canvas.toDataURL('image/png');
    if (!dataUrl.startsWith('data:image/png;base64,')) {
      throw new Error('Your browser could not process that image.');
    }
    return dataUrl;
  } catch (err) {
    if (err instanceof Error && err.message) throw err;
    throw new Error('Arc could not read that image. Try another PNG, JPEG, or WebP.');
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

type AvailabilityState = 'idle' | 'checking' | 'available' | 'taken';

export function PublishModal({ open, onClose, onPublish, defaultTitle = '' }: PublishModalProps) {
  const { hasBoost, openCheckout } = useSubscription();
  const iconInputRef = useRef<HTMLInputElement>(null);
  const iconRequestRef = useRef(0);
  const [title, setTitle] = useState(defaultTitle || 'My Site');
  const [subdomain, setSubdomain] = useState('');
  const [subdomainEdited, setSubdomainEdited] = useState(false);
  const [faviconData, setFaviconData] = useState<string>();
  const [iconProcessing, setIconProcessing] = useState(false);
  const [iconError, setIconError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [availability, setAvailability] = useState<AvailabilityState>('idle');

  // Auto-derive subdomain from title unless user has manually edited it
  useEffect(() => {
    if (!subdomainEdited) {
      setSubdomain(slugify(title) || 'my-site');
    }
  }, [title, subdomainEdited]);

  // Reset when reopened
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle || 'My Site');
      setSubdomainEdited(false);
      setFaviconData(undefined);
      setIconProcessing(false);
      setIconError('');
      setPublishing(false);
      setError('');
      setAvailability('idle');
      iconRequestRef.current += 1;
      if (iconInputRef.current) iconInputRef.current.value = '';
    }
  }, [open, defaultTitle]);

  // Debounced availability check
  useEffect(() => {
    if (!open) return;
    const sub = subdomain.trim();
    if (!sub || sub.length < 2) {
      setAvailability('idle');
      return;
    }
    setAvailability('checking');
    const handle = setTimeout(async () => {
      const ok = await checkSubdomainAvailability(sub);
      setAvailability(ok ? 'available' : 'taken');
    }, 400);
    return () => clearTimeout(handle);
  }, [subdomain, open]);

  if (!open) return null;

  if (!hasBoost) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-md rounded-2xl border border-border/30 bg-background shadow-2xl overflow-hidden p-6 text-center">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/15 mb-4">
            <Rocket className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">Publishing requires Boost</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Upgrade to ArcAI Boost for $10/month to publish live web apps to custom Arc links, get higher Luna limits, and use GPT-Image-2.
          </p>
          <div className="flex flex-col gap-2.5">
            <Button onClick={() => { onClose(); openCheckout(); }} className="w-full rounded-xl">
              Upgrade to Boost ($10/mo)
            </Button>
            <Button variant="ghost" onClick={onClose} className="w-full rounded-xl">
              Maybe later
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const previewUrl = `${subdomain || 'my-site'}.${PUBLISH_DOMAIN}`;

  const handleIconUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const requestId = iconRequestRef.current + 1;
    iconRequestRef.current = requestId;
    setIconError('');
    setIconProcessing(true);
    try {
      const normalized = await normalizeIcon(file);
      if (iconRequestRef.current !== requestId) return;
      setFaviconData(normalized);
    } catch (err) {
      if (iconRequestRef.current !== requestId) return;
      setIconError(err instanceof Error ? err.message : 'Arc could not process that image.');
    } finally {
      if (iconRequestRef.current === requestId) setIconProcessing(false);
    }
  };

  const resetIcon = () => {
    iconRequestRef.current += 1;
    setFaviconData(undefined);
    setIconProcessing(false);
    setIconError('');
    if (iconInputRef.current) iconInputRef.current.value = '';
  };

  const handlePublish = async () => {
    if (!subdomain.trim()) { setError('Site name is required'); return; }
    if (availability === 'taken') { setError('That address is already taken, pick a different one.'); return; }
    setError('');
    setPublishing(true);
    try {
      await onPublish({
        subdomain: subdomain.trim(),
        title: title.trim() || subdomain,
        ...(faviconData ? { faviconData } : {}),
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Publish failed';
      setError(msg);
      // If server says taken, mark it
      if (/already taken|taken, pick/i.test(msg)) setAvailability('taken');
    } finally {
      setPublishing(false);
    }
  };

  const disablePublish = publishing || iconProcessing || !subdomain || availability === 'checking' || availability === 'taken';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-2xl border border-border/30 bg-background shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border/20">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/15">
              <Rocket className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-base font-semibold">Publish to web</h2>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Site icon */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Site icon</Label>
            <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-muted/20 p-3">
              <div className="relative w-14 h-14 flex-shrink-0 rounded-xl border border-border/30 overflow-hidden bg-background/60 p-1.5">
                <img
                  src={faviconData || DEFAULT_FAVICON_SRC}
                  alt="Site icon preview"
                  className="w-full h-full object-contain rounded-lg"
                />
                {iconProcessing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/75 backdrop-blur-sm">
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{faviconData ? 'Custom icon' : 'Arc icon'}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">PNG, JPEG, or WebP · 1 MB max</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    ref={iconInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                    onChange={handleIconUpload}
                    className="sr-only"
                    aria-label="Choose a custom site icon"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg gap-1.5"
                    onClick={() => iconInputRef.current?.click()}
                    disabled={iconProcessing || publishing}
                  >
                    {iconProcessing
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Processing…</>
                      : <><Upload className="w-3.5 h-3.5" />{faviconData ? 'Replace' : 'Upload'}</>}
                  </Button>
                  {faviconData && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-lg gap-1.5 text-muted-foreground"
                      onClick={resetIcon}
                      disabled={iconProcessing || publishing}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />Use Arc icon
                    </Button>
                  )}
                </div>
              </div>
            </div>
            {iconError && (
              <p className="flex items-start gap-1.5 text-xs text-destructive" role="alert">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>{iconError}</span>
              </p>
            )}
          </div>

          {/* Page title */}
          <div className="space-y-1.5">
            <Label htmlFor="pub-title" className="text-sm font-medium">Page title</Label>
            <Input
              id="pub-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="My Awesome Site"
              className="bg-muted/30 border-border/30"
            />
          </div>

          {/* Subdomain */}
          <div className="space-y-1.5">
            <Label htmlFor="pub-subdomain" className="text-sm font-medium">Site address</Label>
            <div className="flex items-center gap-0">
              <Input
                id="pub-subdomain"
                value={subdomain}
                onChange={e => {
                  setSubdomainEdited(true);
                  setSubdomain(slugify(e.target.value));
                }}
                placeholder="my-site"
                className="bg-muted/30 border-border/30 rounded-r-none border-r-0 font-mono text-sm"
              />
              <div className="h-10 px-3 flex items-center bg-muted/50 border border-border/30 rounded-r-lg text-xs text-muted-foreground font-mono whitespace-nowrap">
                .{PUBLISH_DOMAIN}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 min-h-[18px]">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                <Globe className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{previewUrl}</span>
              </p>
              {availability === 'checking' && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 flex-shrink-0">
                  <Loader2 className="w-3 h-3 animate-spin" /> checking…
                </span>
              )}
              {availability === 'available' && (
                <span className="text-xs text-emerald-400 flex items-center gap-1 flex-shrink-0">
                  <Check className="w-3 h-3" /> available
                </span>
              )}
              {availability === 'taken' && (
                <span className="text-xs text-destructive flex items-center gap-1 flex-shrink-0">
                  <AlertCircle className="w-3 h-3" /> taken
                </span>
              )}
            </div>
          </div>

          {/* Notice: updates allowed */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-3 space-y-1">
            <p className="text-xs font-medium text-amber-500/90">Before you publish</p>
            <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
              <li>Your site goes live at a <span className="font-mono">.{PUBLISH_DOMAIN}</span> URL</li>
              <li>You can re-publish to push updates to the same URL anytime</li>
              <li>It stays live until you choose to unpublish it</li>
              <li>Unpublishing is the only destructive action, once gone, the URL can't be recovered</li>
            </ul>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <div className="px-6 pb-5 flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={publishing} className="rounded-xl">
            Cancel
          </Button>
          <Button onClick={handlePublish} disabled={disablePublish} className="rounded-xl gap-2">
            {publishing
              ? <><Loader2 className="w-4 h-4 animate-spin" />Publishing…</>
              : <><Rocket className="w-4 h-4" />Publish</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
