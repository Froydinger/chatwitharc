import { useState, useEffect } from 'react';
import { Rocket, Globe, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

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

export function PublishModal({ open, onClose, onPublish, defaultTitle = '' }: PublishModalProps) {
  const [title, setTitle] = useState(defaultTitle || 'My Site');
  const [subdomain, setSubdomain] = useState('');
  const [subdomainEdited, setSubdomainEdited] = useState(false);
  const [emoji, setEmoji] = useState('🚀');
  const [bg, setBg] = useState('#6366f1');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

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
    }
  }, [open, defaultTitle]);

  if (!open) return null;

  const previewUrl = `${subdomain || 'my-site'}.froydingermedia.online`;
  const faviconSvg = makeFaviconSvg(emoji, bg);

  const handlePublish = async () => {
    if (!subdomain.trim()) { setError('Site name is required'); return; }
    setError('');
    setPublishing(true);
    try {
      await onPublish({ subdomain: subdomain.trim(), title: title.trim() || subdomain, faviconSvg });
      onClose();
      // Note: ogTitle / ogDescription / ogImageUrl can be set after publishing via the manage modal
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl border border-border/30 bg-background shadow-2xl overflow-hidden">
        {/* Header */}
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
              {/* Preview */}
              <div
                className="w-14 h-14 flex-shrink-0 rounded-xl flex items-center justify-center text-2xl shadow-inner"
                style={{ background: bg }}
              >
                {emoji}
              </div>

              <div className="flex-1 space-y-2">
                {/* Emoji grid */}
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
                {/* Color swatches */}
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
                .froydingermedia.online
              </div>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Globe className="w-3 h-3" />
              {previewUrl}
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={publishing} className="rounded-xl">
            Cancel
          </Button>
          <Button onClick={handlePublish} disabled={publishing || !subdomain} className="rounded-xl gap-2">
            {publishing
              ? <><Loader2 className="w-4 h-4 animate-spin" />Publishing…</>
              : <><Rocket className="w-4 h-4" />Publish</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
