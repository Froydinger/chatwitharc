import { Component, Suspense, lazy, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { ArrowUpRight, Check, Copy, Globe2, Loader2, Search, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import './workspace-web-search.css';

const SearchAnswer = lazy(() => import('./WorkspaceSearchAnswer'));

export interface WebSearchSource {
  title?: string;
  url: string;
  snippet?: string;
  content?: string;
}

interface Props {
  content?: string;
  sources: WebSearchSource[];
  query?: string;
  initialTab?: 'answer' | 'sources';
  children?: ReactNode;
}

function sourceLocation(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return { href: url.href, host: url.hostname.replace(/^www\./, '') };
  } catch { return null; }
}

class AnswerBoundary extends Component<{ children: ReactNode; onClose: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="wsw-empty" role="alert"><p>The answer couldn’t be displayed here.</p><span>You can still read the reply in your chat and open its sources.</span><button type="button" className="wsw-text-button" onClick={this.props.onClose}>Back to chat</button></div>;
    return this.props.children;
  }
}

/** Read-only view of the result already attached to a reply. Opening this
 * dialog never repeats the search, changes models, or consumes an allowance. */
export function WorkspaceWebSearchDialog({ content = '', sources, query, initialTab = 'answer', children }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState(initialTab);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const copyAttempt = useRef(0);
  const filterId = useId();
  const hasAnswer = content.trim().length > 0;
  const visibleSources = sources.map((source, index) => ({ ...source, index, location: sourceLocation(source.url) }))
    .filter(source => `${source.title || ''} ${source.url} ${source.snippet || source.content || ''}`.toLowerCase().includes(filter.trim().toLowerCase()));

  useEffect(() => () => { copyAttempt.current += 1; }, []);
  const changeOpen = (next: boolean) => {
    copyAttempt.current += 1;
    setOpen(next);
    setCopyState('idle');
    if (next) { setFilter(''); setTab(hasAnswer ? initialTab : 'sources'); }
  };
  const copyAnswer = async () => {
    const attempt = ++copyAttempt.current;
    try {
      await navigator.clipboard.writeText(content);
      if (attempt === copyAttempt.current) setCopyState('copied');
    } catch {
      if (attempt === copyAttempt.current) setCopyState('failed');
    }
  };

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild>{children || <button type="button" className="wsw-open-sources"><Globe2 aria-hidden="true" /><span>{sources.length} source{sources.length === 1 ? '' : 's'}</span><ArrowUpRight aria-hidden="true" /></button>}</DialogTrigger>
    <DialogContent hideCloseButton className="wsw-dialog" onOpenAutoFocus={event => { event.preventDefault(); headingRef.current?.focus(); }}>
      <header className="wsw-heading">
        <div className="wsw-heading-copy"><p className="wsw-eyebrow"><Globe2 aria-hidden="true" />Web search</p><DialogTitle ref={headingRef} tabIndex={-1}>{query?.trim() || 'A closer look at this search'}</DialogTitle><DialogDescription>The answer and sources attached to this reply.</DialogDescription></div>
        <DialogClose asChild><button type="button" className="wsw-icon-button" aria-label="Close web search"><X aria-hidden="true" /></button></DialogClose>
      </header>
      <Tabs.Root value={tab} onValueChange={value => setTab(value as 'answer' | 'sources')} className="wsw-tabs">
        <div className="wsw-toolbar"><Tabs.List aria-label="Search result view" className="wsw-tab-list"><Tabs.Trigger value="answer" disabled={!hasAnswer}>Answer</Tabs.Trigger><Tabs.Trigger value="sources">Sources <span>{sources.length}</span></Tabs.Trigger></Tabs.List>{hasAnswer && <button type="button" className="wsw-copy" onClick={copyAnswer} aria-label={copyState === 'copied' ? 'Answer copied' : 'Copy answer'}>{copyState === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}<span>{copyState === 'copied' ? 'Copied' : 'Copy answer'}</span></button>}</div>
        <p className="wsw-copy-status" role="status" aria-live="polite">{copyState === 'failed' ? 'Copy didn’t work. Select the answer text to copy it.' : copyState === 'copied' ? 'Answer copied to clipboard.' : ''}</p>
        <Tabs.Content value="answer" className="wsw-panel wsw-answer-panel">
          <AnswerBoundary onClose={() => changeOpen(false)}><Suspense fallback={<div className="wsw-empty" role="status"><Loader2 className="wsw-spinner" aria-hidden="true" /><p>Loading answer…</p></div>}><SearchAnswer content={content} /></Suspense></AnswerBoundary>
        </Tabs.Content>
        <Tabs.Content value="sources" className="wsw-panel wsw-sources-panel">
          {sources.length > 0 && <div className="wsw-filter"><label className="sr-only" htmlFor={filterId}>Filter sources</label><Search aria-hidden="true" /><input id={filterId} type="search" autoComplete="off" spellCheck={false} placeholder="Filter by title, website, or text…" value={filter} onChange={event => setFilter(event.target.value)} />{filter && <button type="button" className="wsw-icon-button" aria-label="Clear source filter" onClick={() => setFilter('')}><X aria-hidden="true" /></button>}</div>}
          <p className="wsw-source-count" role="status" aria-live="polite">{filter ? `${visibleSources.length} of ${sources.length} sources` : `${sources.length} source${sources.length === 1 ? '' : 's'} in this reply`}</p>
          {visibleSources.length ? <ol className="wsw-source-list">{visibleSources.map(source => <li key={`${source.url}-${source.index}`}>
            <span className="wsw-source-number" aria-hidden="true">{source.index + 1}</span><div className="wsw-source-copy"><p className="wsw-source-host"><Globe2 aria-hidden="true" />{source.location?.host || 'Source link unavailable'}</p>{source.location ? <a href={source.location.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{source.title || source.location.host}<ArrowUpRight aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a> : <p className="wsw-source-title">{source.title || 'Untitled source'}</p>}{(source.snippet || source.content) && <p className="wsw-source-snippet">{source.snippet || source.content}</p>}</div>
          </li>)}</ol> : <div className="wsw-empty"><Globe2 aria-hidden="true" /><p>{filter ? 'No sources match your filter.' : 'No source links were attached.'}</p><span>{filter ? 'Try another title, website, or keyword.' : 'Read the reply in chat. You can ask Arc to search again if you need sources.'}</span>{filter && <button type="button" className="wsw-text-button" onClick={() => setFilter('')}>Clear filter</button>}</div>}
        </Tabs.Content>
      </Tabs.Root>
      <footer className="wsw-footer"><span>Check the original sources for context.</span><DialogClose asChild><button type="button" className="wsw-text-button">Back to chat</button></DialogClose></footer>
    </DialogContent>
  </Dialog>;
}
