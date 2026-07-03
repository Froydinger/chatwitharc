import { useState, useEffect } from 'react';
import { Rocket, Globe, Loader2, X, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { checkSubdomainAvailability, PUBLISH_DOMAIN } from '@/lib/deploy';
import { useSubscription } from '@/hooks/useSubscription';

const EMOJI_OPTIONS = ['🚀', '⚡', '🌟', '🎯', '🔥', '💎', '🎨', '🌈', '🦋', '🍀', '🎭', '🏆'];
const BG_OPTIONS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export interface PublishOpts {
  subdomain: string;
  title: string;
  faviconSvg: string;
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

function makeFaviconSvg(emoji: string, bg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="${bg}"/><text x="50" y="68" text-anchor="middle" font-size="52" font-family="sans-serif" fill="white">${emoji}</text></svg>`;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

type AvailabilityState = 'idle' | 'checking' | 'available' | 'taken';

export function PublishModal({ open, onClose, onPublish, defaultTitle = '' }: PublishModalProps) {
  const { hasBoost, openCheckout } = useSubscription();
  const [title, setTitle] = useState(defaultTitle || 'My Site');
  const [subdomain, setSubdomain] = useState('');
  const [subdomainEdited, setSubdomainEdited] = useState(false);
  const [emoji, setEmoji] = useState('🚀');
  const [bg, setBg] = useState('#6366f1');
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
      setPublishing(false);
      setError('');
      setAvailability('idle');
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
            Upgrade to ArcAI Boost for $7/month to publish your web creations to custom URLs, get unlimited Smarter reasoning chats, and generate up to 30 images a day.
          </p>
          <div className="flex flex-col gap-2.5">
            <Button onClick={() => { onClose(); openCheckout(); }} className="w-full rounded-xl">
              Upgrade to Boost ($7/mo)
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
  const faviconSvg = makeFaviconSvg(emoji, bg);

  const handlePublish = async () => {
    if (!subdomain.trim()) { setError('Site name is required'); return; }
    if (availability === 'taken') { setError('That address is already taken — pick a different one.'); return; }
    setError('');
    setPublishing(true);
    try {
      await onPublish({ subdomain: subdomain.trim(), title: title.trim() || subdomain, faviconSvg });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Publish failed';
      setError(msg);
      // If server says taken, mark it
      if (/already taken|taken — pick/i.test(msg)) setAvailability('taken');
    } finally {
      setPublishing(false);
    }
  };

  const disablePublish = publishing || !subdomain || availability === 'checking' || availability === 'taken';

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
          {/* Favicon picker */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Icon</Label>
            <div className="flex gap-3">
              <div
                className="w-14 h-14 flex-shrink-0 rounded-xl flex items-center justify-center text-2xl shadow-inner"
                style={{ background: bg }}
              >
                {emoji}
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {EMOJI_OPTIONS.map(e => (
                    <button
                      key={e}
                      onClick={() => setEmoji(e)}
                      className={cn(
                        "w-8 h-8 rounded-lg text-lg transition-all hover:scale-110",
                        emoji === e ? "ring-2 ring-primary bg-primary/10" : "hover:bg-white/10"
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  {BG_OPTIONS.map(c => (
                    <button
                      key={c}
                      onClick={() => setBg(c)}
                      className={cn(
                        "w-6 h-6 rounded-full transition-all hover:scale-110",
                        bg === c && "ring-2 ring-offset-2 ring-offset-background ring-white"
                      )}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
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

          {/* Notice — updates allowed */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-3 space-y-1">
            <p className="text-xs font-medium text-amber-500/90">Before you publish</p>
            <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
              <li>Your site goes live at a <span className="font-mono">.{PUBLISH_DOMAIN}</span> URL</li>
              <li>You can re-publish to push updates to the same URL anytime</li>
              <li>It stays live until you choose to unpublish it</li>
              <li>Unpublishing is the only destructive action — once gone, the URL can't be recovered</li>
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
