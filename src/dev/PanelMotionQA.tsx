import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { SequencedTransition } from '@/components/transitions/SequencedTransition';

export function installPanelMotionQA() {
  if (!import.meta.env.DEV) throw new Error('Local QA only');
  const host = document.createElement('div');
  host.id = 'arc-panel-motion-qa';
  Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '10000', background: 'hsl(var(--background))' });
  document.body.append(host);
  const root = createRoot(host);
  const render = (key: string, open = true) => flushSync(() => root.render(
    <div data-open={open} className="arc-history-drawer w-80 h-full p-8 bg-background" aria-hidden={!open} {...(!open ? { inert: '' } : {})}>
      <SequencedTransition contentKey={key} className="h-full"><button data-page={key}>{key}</button></SequencedTransition>
    </div>
  ));
  render('history');
  return { render, dispose: () => { flushSync(() => root.unmount()); host.remove(); } };
}
