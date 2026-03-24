import { useState, useRef, useEffect } from 'react';
import {
  Check, Copy, ExternalLink, Globe, Loader2, Rocket, Trash2, Upload, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { deployCodeBlock, DeployCodeBlockOpts } from '@/lib/deploy';
import { unpublishFromNetlify } from '@/lib/deploy';
import { savePublishedSite, updatePublishedSite, deletePublishedSite, PublishedSite } from '@/lib/publishedSites';
import { toast } from 'sonner';

const EMOJI_OPTIONS = ['🚀', '⚡', '🌟', '🎯', '🔥', '💎', '🎨', '🌈', '🦋', '🍀', '🎭', '🏆'];
const BG_OPTIONS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

function makeFaviconSvg(emoji: string, bg: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="${bg}"/><text x="50" y="68" text-anchor="middle" font-size="52" font-family="sans-serif" fill="white">${emoji}</text></svg>`;
}
function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}
function parseFaviconSvg(svg: string | null): { emoji: string; bg: string } {
  if (!svg) return { emoji: '🚀', bg: '#6366f1' };
  const emojiMatch = svg.match(/<text[^>]*>([^<]+)<\/text>/);
  const fillMatch = svg.match(/fill="(#[0-9a-fA-F]{6})"/);
  return {
    emoji: emojiMatch?.[1] ?? '🚀',
    bg: fillMatch?.[1] ?? '#6366f1',
  };
}

interface SiteManageModalProps {
  open: boolean;
  onClose: () => void;
  site: PublishedSite;
  onUpdated: (site: PublishedSite) => void;
  onUnpublished: () => void;
}

type FaviconMode = 'emoji' | 'upload';

export function SiteManageModal({ open, onClose, site, onUpdated, onUnpublished }: SiteManageModalProps) {
  const parsed = parseFaviconSvg(site.favicon_svg);

  const [title, setTitle] = useState(site.title);
  const [subdomain, setSubdomain] = useState(site.subdomain);
  const [subdomainEdited, setSubdomainEdited] = useState(true); // always manual for manage

  // Favicon
  const [faviconMode, setFaviconMode] = useState<FaviconMode>(site.favicon_data ? 'upload' : 'emoji');
  const [emoji, setEmoji] = useState(parsed.emoji);
  const [bg, setBg] = useState(parsed.bg);
  const [faviconData, setFaviconData] = useState<string | null>(site.favicon_data ?? null);
  const [faviconPreviewUrl, setFaviconPreviewUrl] = useState<string | null>(site.favicon_data ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // OG / Social
  const [ogTitle, setOgTitle] = useState(site.og_title ?? '');
  const [ogDescription, setOgDescription] = useState(site.og_description ?? '');
  const [ogImageUrl, setOgImageUrl] = useState(site.og_image_url ?? '');

  // Actions
  const [saving, setSaving] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [error, setError] = useState('');
  const [urlCopied, setUrlCopied] = useState(false);

  useEffect(() => {
    if (open) {
      const p = parseFaviconSvg(site.favicon_svg);
      setTitle(site.title);
      setSubdomain(site.subdomain);
      setFaviconMode(site.favicon_data ? 'upload' : 'emoji');
      setEmoji(p.emoji);
      setBg(p.bg);
      setFaviconData(site.favicon_data ?? null);
      setFaviconPreviewUrl(site.favicon_data ?? null);
      setOgTitle(site.og_title ?? '');
      setOgDescription(site.og_description ?? '');
      setOgImageUrl(site.og_image_url ?? '');
      setError('');
    }
  }, [open, site]);

  if (!open) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setFaviconData(dataUrl);
      setFaviconPreviewUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!subdomain.trim()) { setError('Site address is required'); return; }
    setError('');
    setSaving(true);
    try {
      const faviconSvg = faviconMode === 'emoji' ? makeFaviconSvg(emoji, bg) : null;

      // Redeploy with updated settings
      const opts: DeployCodeBlockOpts = {
        subdomain: subdomain.trim(),
        title: title.trim() || subdomain,
        faviconSvg: faviconSvg ?? undefined,
        faviconData: faviconMode === 'upload' && faviconData ? faviconData : undefined,
        ogTitle: ogTitle.trim() || undefined,
        ogDescription: ogDescription.trim() || undefined,
        ogImageUrl: ogImageUrl.trim() || undefined,
        siteId: site.netlify_site_id,
      };

      await deployCodeBlock(site.code ?? '', site.code_language ?? 'html', opts);

      // Update DB record — if id is empty the initial DB save failed, so insert instead
      const record = {
        subdomain: subdomain.trim(),
        title: title.trim() || subdomain,
        favicon_svg: faviconSvg,
        favicon_data: faviconMode === 'upload' ? faviconData : null,
        og_title: ogTitle.trim() || null,
        og_description: ogDescription.trim() || null,
        og_image_url: ogImageUrl.trim() || null,
      };
      const updated = site.id
        ? await updatePublishedSite(site.id, record)
        : await savePublishedSite({
            ...record,
            netlify_site_id: site.netlify_site_id,
            url: site.url,
            code: site.code,
            code_language: site.code_language,
          });
      onUpdated(updated);
      toast.success('Site updated!', {
        action: { label: 'View', onClick: () => window.open(updated.url, '_blank') },
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const handleUnpublish = async () => {
    if (!confirm('Unpublish this site? The URL will stop working.')) return;
    setUnpublishing(true);
    try {
      await unpublishFromNetlify(site.netlify_site_id);
      if (site.id) await deletePublishedSite(site.id);
      toast.success('Site unpublished');
      onUnpublished();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unpublish failed');
    } finally {
      setUnpublishing(false);
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(site.url);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  };

  const currentFaviconSvg = faviconMode === 'emoji' ? makeFaviconSvg(emoji, bg) : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal — full-screen sheet on mobile, account for bottom nav (~4rem) */}
      <div className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-border/30 bg-background shadow-2xl overflow-hidden max-h-[calc(92dvh-4rem)] sm:max-h-[92dvh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/20 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/15">
              <Globe className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight">Manage site</h2>
              <p className="text-xs text-muted-foreground">{site.subdomain}.froydingermedia.online</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* URL bar */}
          <div className="flex items-center gap-2 bg-muted/30 border border-border/30 rounded-xl px-4 py-3">
            <Globe className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="flex-1 text-sm font-mono truncate text-foreground">{site.url.replace('https://', '')}</span>
            <button
              onClick={copyUrl}
              className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              title="Copy URL"
            >
              {urlCopied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
            </button>
            <a href={site.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* Page details */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Site details</h3>
            <div className="space-y-2">
              <Label className="text-sm">Page title</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="My Awesome Site" className="bg-muted/30 border-border/30 text-[16px]" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Site address</Label>
              <div className="flex">
                <Input
                  value={subdomain}
                  onChange={e => { setSubdomainEdited(true); setSubdomain(slugify(e.target.value)); }}
                  className="bg-muted/30 border-border/30 rounded-r-none border-r-0 font-mono text-[16px]"
                />
                <div className="h-10 px-3 flex items-center bg-muted/50 border border-border/30 rounded-r-lg text-xs text-muted-foreground font-mono whitespace-nowrap">
                  .froydingermedia.online
                </div>
              </div>
            </div>
          </div>

          {/* Favicon */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Favicon / Icon</h3>

            {/* Mode toggle */}
            <div className="flex gap-1 bg-muted/30 p-1 rounded-lg w-fit">
              {(['emoji', 'upload'] as FaviconMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setFaviconMode(m)}
                  className={cn(
                    'px-3 py-1 rounded-md text-xs font-medium transition-all capitalize',
                    faviconMode === m ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
                  )}
                >{m}</button>
              ))}
            </div>

            {faviconMode === 'emoji' ? (
              <div className="flex gap-3">
                <div className="w-14 h-14 flex-shrink-0 rounded-xl flex items-center justify-center text-2xl shadow-inner" style={{ background: bg }}>
                  {emoji}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {EMOJI_OPTIONS.map(e => (
                      <button key={e} onClick={() => setEmoji(e)}
                        className={cn('w-8 h-8 rounded-lg text-lg transition-all hover:scale-110', emoji === e ? 'ring-2 ring-primary bg-primary/10' : 'hover:bg-white/10')}>
                        {e}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    {BG_OPTIONS.map(c => (
                      <button key={c} onClick={() => setBg(c)}
                        className={cn('w-6 h-6 rounded-full transition-all hover:scale-110', bg === c && 'ring-2 ring-offset-2 ring-offset-background ring-white')}
                        style={{ background: c }} />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 flex-shrink-0 rounded-xl border border-border/30 overflow-hidden bg-muted/30 flex items-center justify-center">
                  {faviconPreviewUrl
                    ? <img src={faviconPreviewUrl} alt="favicon" className="w-full h-full object-contain" />
                    : <Upload className="w-5 h-5 text-muted-foreground" />}
                </div>
                <div className="flex-1">
                  <input ref={fileInputRef} type="file" accept="image/*,.svg,.ico" className="hidden" onChange={handleFileUpload} />
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="rounded-lg text-xs">
                    <Upload className="w-3.5 h-3.5 mr-1.5" />
                    {faviconPreviewUrl ? 'Change image' : 'Upload image'}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1.5">PNG, JPG, SVG, ICO supported</p>
                </div>
              </div>
            )}
          </div>

          {/* Social / OG */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Social share</h3>
            <div className="space-y-2">
              <Label className="text-sm">OG title</Label>
              <Input value={ogTitle} onChange={e => setOgTitle(e.target.value)} placeholder="Same as page title" className="bg-muted/30 border-border/30 text-[16px]" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">OG description</Label>
              <Textarea value={ogDescription} onChange={e => setOgDescription(e.target.value)} placeholder="A short description for link previews…" rows={2} className="bg-muted/30 border-border/30 resize-none text-[16px]" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">OG image URL</Label>
              <Input value={ogImageUrl} onChange={e => setOgImageUrl(e.target.value)} placeholder="https://…" className="bg-muted/30 border-border/30 font-mono text-[16px]" />
              {ogImageUrl && (
                <img src={ogImageUrl} alt="OG preview" className="w-full rounded-lg border border-border/30 object-cover max-h-32" onError={e => (e.currentTarget.style.display = 'none')} />
              )}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-border/20 flex items-center justify-between gap-2 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUnpublish}
            disabled={unpublishing || saving}
            className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl gap-1.5"
          >
            {unpublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Unpublish
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving || unpublishing} className="rounded-xl">Cancel</Button>
            <Button onClick={handleSave} disabled={saving || unpublishing || !subdomain} className="rounded-xl gap-2">
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
                : <><Rocket className="w-4 h-4" />Save & Republish</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
