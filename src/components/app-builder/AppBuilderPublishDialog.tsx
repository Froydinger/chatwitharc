import { useEffect, useMemo, useState } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Check, ExternalLink, Globe, LoaderCircle, Rocket } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FAVICON_OPTIONS, type FaviconOption } from '@/constants/faviconOptions';
import { checkSubdomainAvailability, PUBLISH_DOMAIN } from '@/lib/deploy';

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 45);

function faviconSvg(option: FaviconOption): string {
  const markup = renderToStaticMarkup(createElement(option.icon, { size: 24, color: option.color, strokeWidth: 2 }));
  const inner = markup.match(/<svg[^>]*>([\s\S]*)<\/svg>/)?.[1] ?? '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="${option.bg}"/><g transform="translate(12,12)">${inner}</g></svg>`;
}

interface Props {
  open: boolean;
  demo?: boolean;
  onOpenChange: (open: boolean) => void;
  currentTitle: string;
  currentSubdomain: string | null;
  currentDescription: string;
  currentHideBadge: boolean;
  currentFavicon: string;
  publishedUrl: string | null;
  onPublish: (input: { title: string; subdomain: string; description: string; hideBadge: boolean; faviconLabel: string; faviconSvg: string }) => Promise<void>;
}

export function AppBuilderPublishDialog({ open, demo = false, onOpenChange, currentTitle, currentSubdomain, currentDescription, currentHideBadge, currentFavicon, publishedUrl, onPublish }: Props) {
  const [title, setTitle] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [description, setDescription] = useState('');
  const [hideBadge, setHideBadge] = useState(false);
  const [faviconLabel, setFaviconLabel] = useState(FAVICON_OPTIONS[0]?.label ?? 'Rocket');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [successUrl, setSuccessUrl] = useState<string | null>(null);
  const selectedFavicon = useMemo(() => FAVICON_OPTIONS.find(item => item.label === faviconLabel) ?? FAVICON_OPTIONS[0], [faviconLabel]);
  const cleanedSubdomain = slugify(subdomain);
  const isUpdate = Boolean(publishedUrl);

  useEffect(() => {
    if (!open) return;
    setTitle(currentTitle || '');
    setSubdomain(currentSubdomain || slugify(currentTitle || ''));
    setDescription(currentDescription || '');
    setHideBadge(currentHideBadge);
    setFaviconLabel(FAVICON_OPTIONS.find(option => option.label === currentFavicon)?.label || FAVICON_OPTIONS[0]?.label || 'Rocket');
    setAvailable(currentSubdomain ? true : null);
    setSuccessUrl(null);
    setError('');
  }, [open, currentTitle, currentSubdomain, currentDescription, currentHideBadge, currentFavicon]);

  useEffect(() => {
    if (demo) {
      setAvailable(null);
      setChecking(false);
      return;
    }
    if (!open || isUpdate && cleanedSubdomain === currentSubdomain) {
      setAvailable(currentSubdomain ? true : null);
      return;
    }
    if (cleanedSubdomain.length < 3) { setAvailable(false); return; }
    let active = true;
    setChecking(true);
    const timer = window.setTimeout(() => {
      void checkSubdomainAvailability(cleanedSubdomain).then(value => {
        if (active) setAvailable(value);
      }).catch(() => {
        if (active) setAvailable(null);
      }).finally(() => {
        if (active) setChecking(false);
      });
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [demo, open, cleanedSubdomain, currentSubdomain, isUpdate]);

  const submit = async () => {
    if (title.trim().length === 0 || cleanedSubdomain.length < 3 || available === false || !selectedFavicon) return;
    setPublishing(true);
    setError('');
    try {
      await onPublish({ title: title.trim(), subdomain: cleanedSubdomain, description: description.trim(), hideBadge, faviconLabel: selectedFavicon.label, faviconSvg: faviconSvg(selectedFavicon) });
      setSuccessUrl(`https://${cleanedSubdomain}.${PUBLISH_DOMAIN}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Publishing failed. Try again.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="app-builder-publish-dialog flex flex-col overflow-hidden border-white/10 bg-[#111211] p-0 text-white shadow-2xl sm:max-w-lg">
        <div className="flex min-h-0 flex-1 flex-col p-5 sm:p-7">
          <DialogHeader className="shrink-0 text-left">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06]"><Rocket className="h-4 w-4" /></div>
            <DialogTitle className="text-xl font-semibold tracking-tight">{successUrl ? 'Your app is live' : isUpdate ? 'Update your app' : 'Publish your app'}</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-white/45">{successUrl ? 'Your Arc App Builder site has been published.' : demo ? 'Local preview only. This sample will not be published.' : `Publish a secure, shareable link on *.${PUBLISH_DOMAIN}.`}</DialogDescription>
          </DialogHeader>

          {successUrl ? (
            <div className="mt-6 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-center gap-2 text-sm text-emerald-300"><Check className="h-4 w-4" /> Published</div>
              <a className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-black/30 px-3 py-3 text-xs text-white/75 hover:text-white" href={successUrl} target="_blank" rel="noreferrer"><span className="truncate">{successUrl}</span><ExternalLink className="h-3.5 w-3.5 shrink-0" /></a>
              <Button onClick={() => onOpenChange(false)} className="mt-4 w-full bg-white text-black hover:bg-white/90">Done</Button>
            </div>
          ) : (
            <>
            <div className="mt-6 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
              <label className="block space-y-1.5"><span className="text-xs font-medium text-white/70">App name</span><Input value={title} onChange={event => setTitle(event.target.value)} maxLength={100} placeholder="Morrow Habits" className="h-11 border-white/10 bg-black/25 text-white placeholder:text-white/25" /></label>
              <label className="block space-y-1.5"><span className="text-xs font-medium text-white/70">Your askarc.chat link</span><div className="flex items-center overflow-hidden rounded-xl border border-white/10 bg-black/25 focus-within:border-white/25"><Input value={subdomain} onChange={event => setSubdomain(event.target.value)} maxLength={45} placeholder="morrow-habits" className="h-11 rounded-none border-0 bg-transparent text-white focus-visible:ring-0" /><span className="pr-3 text-xs text-white/35">.{PUBLISH_DOMAIN}</span></div><span className="flex min-h-4 items-center gap-1.5 text-[11px] text-white/40">{demo ? 'Availability checks are disabled in this local preview.' : checking ? <><LoaderCircle className="h-3 w-3 animate-spin" /> Checking link</> : available === true ? <><Check className="h-3 w-3 text-emerald-300" /> Link is available</> : available === false ? 'Use at least 3 letters and check that the link is available.' : 'Link availability will be checked before publishing.'}</span></label>
              <label className="block space-y-1.5"><span className="text-xs font-medium text-white/70">Short description</span><Textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={180} rows={2} placeholder="What should people know about your app?" className="resize-none border-white/10 bg-black/25 text-sm text-white placeholder:text-white/25" /></label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-white/70">Site icon</span>
                    <span className="text-[10px] text-white/40">{selectedFavicon?.label || 'Arc mark'}</span>
                  </div>
                  <div role="radiogroup" aria-label="Site icon" className="grid max-h-40 grid-cols-5 gap-2 overflow-y-auto rounded-xl border border-white/[0.08] bg-black/20 p-2 sm:max-h-44 sm:grid-cols-8">
                    {FAVICON_OPTIONS.map(option => {
                      const Icon = option.icon;
                      const selected = faviconLabel === option.label;
                      return (
                        <button
                          key={option.label}
                          type="button"
                          role="radio"
                          aria-label={option.label}
                          aria-checked={selected}
                          title={option.label}
                          onClick={() => setFaviconLabel(option.label)}
                          className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition ${selected ? 'border-white/80 ring-2 ring-white/35' : 'border-white/10 hover:border-white/40'}`}
                          style={{ backgroundColor: option.bg }}
                        >
                          <Icon aria-hidden="true" className="h-4 w-4" style={{ color: option.color }} strokeWidth={2} />
                          {selected && <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-black"><Check className="h-2.5 w-2.5" /></span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5"><input type="checkbox" checked={hideBadge} onChange={event => setHideBadge(event.target.checked)} className="accent-white" /><span><span className="block text-xs font-medium text-white/75">Hide Arc badge</span><span className="mt-0.5 block text-[10px] text-white/35">Remove “Built with Arc”</span></span></label>
              </div>
              {error && <p role="alert" className="rounded-xl border border-red-400/15 bg-red-400/5 px-3 py-2 text-xs text-red-200">{error}</p>}
              <div className="flex items-center gap-3 pt-1"><Globe className="h-4 w-4 shrink-0 text-white/35" /><p className="text-[11px] leading-relaxed text-white/40">This link is hosted by Arc for App Builder projects. Git projects use your own hosting account.</p></div>
            </div>
            <Button onClick={() => void submit()} disabled={demo || publishing || checking || !title.trim() || cleanedSubdomain.length < 3 || available === false} className="mt-3 h-11 w-full shrink-0 rounded-xl bg-white text-black hover:bg-white/90 disabled:bg-white/20 disabled:text-white/40">{demo ? 'Preview only' : publishing ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Publishing…</> : <><Rocket className="h-4 w-4" /> {isUpdate ? 'Publish update' : 'Publish app'}</>}</Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
