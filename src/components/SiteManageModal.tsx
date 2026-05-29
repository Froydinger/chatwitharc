import { useState } from 'react';
import {
  Check, Copy, ExternalLink, Globe, Loader2, Trash2, X, Lock, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { unpublishFromNetlify } from '@/lib/deploy';
import { deletePublishedSite, PublishedSite } from '@/lib/publishedSites';
import { toast } from 'sonner';

interface SiteManageModalProps {
  open: boolean;
  onClose: () => void;
  site: PublishedSite;
  onUpdated: (site: PublishedSite) => void;
  onUnpublished: () => void;
}

/**
 * Published-site management modal.
 *
 * IMPORTANT: Publications are intentionally **immutable** after launch — once
 * a site goes live, the only allowed action is Unpublish (which is permanent
 * and cannot be reversed). No editing, no re-publishing. This holds even for
 * active Boost subscribers. See PricingPage for the user-facing explanation.
 *
 * `onUpdated` is kept on the props for backward compatibility with callers,
 * but is no longer invoked from this modal.
 */
export function SiteManageModal({ open, onClose, site, onUnpublished }: SiteManageModalProps) {
  const [unpublishing, setUnpublishing] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [error, setError] = useState('');
  const [urlCopied, setUrlCopied] = useState(false);

  if (!open) return null;

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
      toast.success('Site unpublished — this is permanent. The URL is gone.');
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

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-border/30 bg-background shadow-2xl overflow-hidden">
        {/* Header */}
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
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors flex-shrink-0"
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

          {/* Immutability notice */}
          <div className="rounded-xl border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground space-y-1.5">
            <div className="flex items-center gap-1.5 text-foreground font-medium">
              <Lock className="h-3.5 w-3.5" />
              This publication is final
            </div>
            <p>Published sites cannot be edited or re-published. If you change the underlying code, the live version will not update.</p>
            <p>You can unpublish at any time, but unpublished sites are gone for good — you cannot bring them back, and the subdomain cannot be reused for this code.</p>
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
        <div className="px-5 pb-5 pt-3 border-t border-border/20 flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={onClose} disabled={unpublishing} className="rounded-xl">
            Close
          </Button>
          <Button
            variant={confirmUnpublish ? 'destructive' : 'outline'}
            onClick={handleUnpublish}
            disabled={unpublishing}
            className="rounded-xl gap-1.5"
          >
            {unpublishing
              ? <><Loader2 className="w-4 h-4 animate-spin" />Unpublishing…</>
              : <><Trash2 className="w-4 h-4" />{confirmUnpublish ? 'Yes, unpublish permanently' : 'Unpublish'}</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
