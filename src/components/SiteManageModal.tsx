import { useState } from 'react';
import {
  Check, Copy, ExternalLink, Globe, Loader2, RefreshCw, Trash2, X, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deployCodeBlock, unpublishFromNetlify } from '@/lib/deploy';
import { deletePublishedSite, updatePublishedSite, PublishedSite } from '@/lib/publishedSites';
import { toast } from 'sonner';

interface SiteManageModalProps {
  open: boolean;
  onClose: () => void;
  site: PublishedSite;
  /** Latest code to push on update. Defaults to whatever was saved with the site. */
  currentCode?: string;
  currentCodeLanguage?: string;
  onUpdated: (site: PublishedSite) => void;
  onUnpublished: () => void;
}

/**
 * Published-site management modal.
 *
 * Sites can be re-published (update in place) or unpublished. Re-deploying
 * reuses the same Netlify site id + subdomain so the live URL stays stable.
 * Unpublishing is permanent — the URL is released.
 */
export function SiteManageModal({
  open, onClose, site, currentCode, currentCodeLanguage,
  onUpdated, onUnpublished,
}: SiteManageModalProps) {
  const [unpublishing, setUnpublishing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [error, setError] = useState('');
  const [urlCopied, setUrlCopied] = useState(false);

  if (!open) return null;

  const codeToDeploy = currentCode ?? site.code ?? '';
  const langToDeploy = currentCodeLanguage ?? site.code_language ?? 'html';

  const handleUpdate = async () => {
    if (!codeToDeploy.trim()) {
      setError('No code to publish');
      return;
    }
    setUpdating(true);
    setError('');
    try {
      const result = await deployCodeBlock(codeToDeploy, langToDeploy, {
        subdomain: site.subdomain,
        title: site.title,
        faviconSvg: site.favicon_svg || undefined,
        faviconData: site.favicon_data || undefined,
        ogTitle: site.og_title || undefined,
        ogDescription: site.og_description || undefined,
        ogImageUrl: site.og_image_url || undefined,
        siteId: site.netlify_site_id,
      });
      // Persist the updated code snapshot
      try {
        if (site.id) {
          const updated = await updatePublishedSite(site.id, {
            code: codeToDeploy,
            code_language: langToDeploy,
            url: result.url,
            netlify_site_id: result.siteId,
            subdomain: result.subdomain,
          });
          onUpdated(updated);
        } else {
          onUpdated({ ...site, code: codeToDeploy, code_language: langToDeploy });
        }
      } catch {
        onUpdated({ ...site, code: codeToDeploy, code_language: langToDeploy });
      }
      toast.success('Site updated — your changes are live.', {
        action: { label: 'View', onClick: () => window.open(result.url, '_blank') },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setUpdating(false);
    }
  };

  const handleUnpublish = async () => {
    if (!confirmUnpublish) {
      setConfirmUnpublish(true);
      return;
    }
    setUnpublishing(true);
    setError('');
    try {
      await unpublishFromNetlify(site.netlify_site_id);
      if (site.id) await deletePublishedSite(site.id);
      toast.success('Site unpublished — the URL is gone.');
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

  const busy = unpublishing || updating;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={busy ? undefined : onClose} />

      <div className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border/30 bg-background shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/20">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 rounded-lg bg-emerald-500/15">
              <Globe className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-tight">Live site</h2>
              <p className="text-xs text-muted-foreground truncate">{site.subdomain}.froydingermedia.online</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors flex-shrink-0 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* URL bar */}
          <div className="flex items-center gap-2 bg-muted/30 border border-border/30 rounded-xl px-4 py-3">
            <Globe className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="flex-1 text-sm font-mono truncate text-foreground">{site.url.replace('https://', '')}</span>
            <button onClick={copyUrl} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" title="Copy URL">
              {urlCopied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
            </button>
            <a href={site.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* Update notice */}
          <div className="rounded-xl border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground space-y-1.5">
            <p>
              <span className="text-foreground font-medium">Update site</span> pushes the latest code to the same URL.
              The link, subdomain, and any shared references stay the same.
            </p>
            <p>
              <span className="text-foreground font-medium">Unpublish</span> takes the site offline immediately and releases the URL. This is permanent.
            </p>
          </div>

          {/* Confirm-unpublish warning */}
          {confirmUnpublish && (
            <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive flex gap-2 items-start">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Are you sure?</p>
                <p className="opacity-90 mt-0.5">This removes the live site immediately and is permanent. Click Unpublish again to confirm.</p>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-border/20 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy} className="rounded-xl">
            Close
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleUpdate}
              disabled={busy || !codeToDeploy.trim()}
              className="rounded-xl gap-1.5"
            >
              {updating
                ? <><Loader2 className="w-4 h-4 animate-spin" />Updating…</>
                : <><RefreshCw className="w-4 h-4" />Update site</>}
            </Button>
            <Button
              variant={confirmUnpublish ? 'destructive' : 'ghost'}
              onClick={handleUnpublish}
              disabled={busy}
              className="rounded-xl gap-1.5"
            >
              {unpublishing
                ? <><Loader2 className="w-4 h-4 animate-spin" />Unpublishing…</>
                : <><Trash2 className="w-4 h-4" />{confirmUnpublish ? 'Yes, unpublish' : 'Unpublish'}</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
