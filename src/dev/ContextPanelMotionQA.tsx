import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ContextBlocksPanelView } from '@/components/ContextBlocksPanel';
import type { ContextBlock } from '@/hooks/useContextBlocks';

export function installContextPanelMotionQA() {
  if (!import.meta.env.DEV) throw new Error('Local QA only');
  const host = document.createElement('div');
  host.id = 'arc-context-panel-qa';
  Object.assign(host.style, {position:'fixed',inset:'0',zIndex:'10000',background:'hsl(var(--background))'});
  document.body.append(host);
  const root = createRoot(host);
  const calls: {kind: string; content?: string; id?: string}[] = [];
  function Fixture() {
    const [open, setOpen] = useState(true);
    const [blocks, setBlocks] = useState<ContextBlock[]>([]);
    const block = (content: string): ContextBlock => ({id:'fixture-memory',content,source:'manual',created_at:null,updated_at:null});
    return <><button data-qa-open onClick={() => setOpen(true)}>Open memory</button>
      <ContextBlocksPanelView isOpen={open} onClose={() => setOpen(false)} memory={{blocks,loading:false,
        addBlock:async content => {calls.push({kind:'add',content});const saved=block(content);setBlocks([saved]);return saved;},
        updateBlock:async (id,content) => {calls.push({kind:'edit',id,content});setBlocks([block(content)]);},
        clearAll:async () => {calls.push({kind:'clear'});setBlocks([]);},
      }} /></>;
  }
  flushSync(() => root.render(<Fixture />));
  return {calls,dispose:()=>{flushSync(()=>root.unmount());host.remove();}};
}
