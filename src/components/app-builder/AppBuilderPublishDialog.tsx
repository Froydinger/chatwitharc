import { useEffect, useMemo, useState } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Check, ExternalLink, Globe, LoaderCircle, Rocket, Sparkles } from 'lucide-react';
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
      <DialogContent className="app-builder-publish-dialog flex w-[calc(100vw-24px)] flex-col overflow-hidden border-white/12 bg-[#101110] p-0 text-white shadow-[0_28px_100px_rgba(0,0,0,.7)] sm:max-w-xl">
        <div className="app-builder-publish-content relative z-10 flex min-h-0 flex-1 flex-col">
          <DialogHeader className="shrink-0 border-b border-white/[0.09] bg-gradient-to-br from-white/[0.055] to-transparent px-5 py-5 text-left sm:px-7 sm:py-6">
            <div className="flex items-start gap-3.5 pr-8">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/[0.13] bg-white/[0.07] text-white/90 shadow-inner"><Rocket className="h-[18px] w-[18px]" /></div>
              <div className="min-w-0 pt-0.5">
                <DialogTitle className="text-[20px] font-semibold tracking-tight sm:text-[22px]">{successUrl ? 'Your app is live' : isUpdate ? 'Update your app' : 'Publish your app'}</DialogTitle>
                <DialogDescription className="mt-1.5 text-[13px] leading-relaxed text-white/65">{successUrl ? 'Your Arc App Builder site has been published.' : demo ? 'This is a local preview. Publishing is disabled for this sample.' : `Give your app a name and publish it at a shareable ${PUBLISH_DOMAIN} link.`}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {successUrl ? (
            <div className="app-builder-publish-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-7">
              <div className="rounded-2xl border border-emerald-200/15 bg-emerald-100/[0.045] p-4 sm:p-5">
                <div className="flex items-center gap-2.5 text-sm font-medium text-emerald-200"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-200/10"><Check className="h-4 w-4" /></span>Published and ready to share</div>
                <a className="mt-4 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-white/[0.09] bg-black/35 px-3.5 py-3 text-[13px] text-white/90 transition hover:border-white/20 hover:bg-black/50" href={successUrl} target="_blank" rel="noreferrer"><span className="truncate">{successUrl}</span><ExternalLink className="h-4 w-4 shrink-0 text-white/55" /></a>
              </div>
              <Button onClick={() => onOpenChange(false)} className="mt-5 h-12 w-full rounded-xl bg-white text-black hover:bg-white/90">Done</Button>
            </div>
          ) : (
            <>
              <div className="app-builder-publish-scroll min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
                {demo && <div className="flex items-start gap-2.5 rounded-xl border border-white/[0.11] bg-white/[0.045] px-3.5 py-3"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-white/70" /><p className="text-[12px] leading-relaxed text-white/70"><span className="font-semibold text-white/90">Preview mode.</span> These settings are for display only and won’t go live.</p></div>}
                <label className="block space-y-2"><span className="text-[12px] font-semibold text-white/85">App name</span><Input value={title} onChange={event => setTitle(event.target.value)} maxLength={100} placeholder="Morrow Habits" className="app-builder-publish-field h-12 scroll-mt-5 rounded-xl border-white/[0.16] bg-[#080908] px-3.5 text-[14px] text-white placeholder:text-white/35 shadow-none focus-visible:border-white/45 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-0" /></label>

                <label className="block space-y-2"><span className="text-[12px] font-semibold text-white/85">Your app link</span><div className="app-builder-publish-link flex min-h-12 items-center overflow-hidden rounded-xl border border-white/[0.16] bg-[#080908] focus-within:border-white/45 focus-within:ring-2 focus-within:ring-white/20"><Input value={subdomain} onChange={event => setSubdomain(event.target.value)} maxLength={45} placeholder="morrow-habits" aria-label="App link name" className="app-builder-publish-field h-12 min-w-0 flex-1 scroll-mt-5 rounded-none border-0 bg-transparent px-3.5 text-[14px] text-white placeholder:text-white/35 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0" /><span className="shrink-0 border-l border-white/[0.09] px-3 text-[11px] font-medium text-white/65">.{PUBLISH_DOMAIN}</span></div><span aria-live="polite" className="flex min-h-5 items-center gap-1.5 text-[11px] text-white/60">{demo ? 'Link availability is not checked in preview mode.' : checking ? <><LoaderCircle className="h-3 w-3 animate-spin" /> Checking link</> : available === true ? <><Check className="h-3 w-3 text-emerald-300" /> This link is available</> : available === false ? 'Use at least 3 characters and choose an available link.' : 'We’ll check the link before publishing.'}</span></label>

                <label className="block space-y-2"><span className="flex items-center justify-between text-[12px] font-semibold text-white/85"><span>Short description</span><span className="font-normal text-white/40">Optional · {description.length}/180</span></span><Textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={180} rows={3} placeholder="What should visitors know about your app?" className="app-builder-publish-field min-h-[96px] scroll-mt-5 resize-y rounded-xl border-white/[0.16] bg-[#080908] px-3.5 py-3 text-[14px] leading-relaxed text-white placeholder:text-white/35 shadow-none focus-visible:border-white/45 focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-0" /></label>

                <section aria-label="Site icon" className="rounded-2xl border border-white/[0.11] bg-white/[0.025] p-3.5 sm:p-4">
                  <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[12px] font-semibold text-white/85">Site icon</p><p className="mt-0.5 text-[10px] text-white/50">Choose the icon visitors see in their browser.</p></div><span className="rounded-full border border-white/[0.1] bg-black/25 px-2.5 py-1 text-[10px] font-medium text-white/65">{selectedFavicon?.label || 'Arc mark'}</span></div>
                  <div role="radiogroup" aria-label="Choose a site icon" className="app-builder-publish-icons grid max-h-36 grid-cols-5 gap-2 overflow-y-auto overscroll-contain rounded-xl bg-black/25 p-2.5 sm:max-h-40 sm:grid-cols-8">
                    {FAVICON_OPTIONS.map(option => {
                      const Icon = option.icon;
                      const selected = faviconLabel === option.label;
                      return <button key={option.label} type="button" role="radio" aria-label={option.label} aria-checked={selected} title={option.label} onClick={() => setFaviconLabel(option.label)} className={`relative mx-auto flex h-10 w-10 items-center justify-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#101110] ${selected ? 'border-white/90 ring-2 ring-white/35' : 'border-white/[0.12] hover:border-white/45'}`} style={{ backgroundColor: option.bg }}><Icon aria-hidden="true" className="h-[17px] w-[17px]" style={{ color: option.color }} strokeWidth={2} />{selected && <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-black"><Check className="h-2.5 w-2.5" /></span>}</button>;
                    })}
                  </div>
                </section>

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.12] bg-white/[0.025] px-3.5 py-3 transition hover:border-white/25 hover:bg-white/[0.045]"><input type="checkbox" checked={hideBadge} onChange={event => setHideBadge(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-white" /><span><span className="block text-[12px] font-semibold text-white/85">Hide the Arc badge</span><span className="mt-1 block text-[11px] leading-relaxed text-white/55">Remove the “Built with Arc” mark from your published app.</span></span></label>

                {error && <p role="alert" className="rounded-xl border border-red-300/20 bg-red-300/[0.07] px-3.5 py-3 text-[12px] leading-relaxed text-red-100">{error}</p>}
                <div className="flex items-start gap-3 rounded-xl border border-white/[0.09] bg-black/20 px-3.5 py-3"><Globe className="mt-0.5 h-4 w-4 shrink-0 text-white/60" /><p className="text-[11px] leading-relaxed text-white/60">App Builder publishes to an Arc-hosted <span className="font-medium text-white/80">askarc.chat</span> link. Git exports use your own hosting account.</p></div>
              </div>
              <div className="shrink-0 border-t border-white/[0.09] bg-[#101110] px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-4 sm:px-7">
                <Button onClick={() => void submit()} disabled={demo || publishing || checking || !title.trim() || cleanedSubdomain.length < 3 || available === false} className="h-12 w-full rounded-xl bg-white text-[13px] font-semibold text-black shadow-[0_3px_18px_rgba(255,255,255,.08)] hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#101110] disabled:bg-white/15 disabled:text-white/40 disabled:shadow-none">{demo ? 'Preview only' : publishing ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Publishing…</> : <><Rocket className="h-4 w-4" /> {isUpdate ? 'Publish update' : 'Publish app'}</>}</Button>
                {!demo && <p className="mt-2 text-center text-[10px] text-white/45">{isUpdate ? 'This replaces the current live version at your link.' : 'You can change these details or publish an update later.'}</p>}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
