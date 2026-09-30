import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { SubagentProgress } from '@/components/SubagentProgress';
import { useSubagentStore } from '@/store/useSubagentStore';

export function installSubagentMotionQA() {
  if (!import.meta.env.DEV) throw new Error('Local QA only');
  const previous = useSubagentStore.getState().run;
  const host = document.createElement('div');
  host.id = 'arc-subagent-motion-qa';
  Object.assign(host.style, {position:'fixed',inset:'0',zIndex:'10000',background:'hsl(var(--background))',padding:'24px'});
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => { useSubagentStore.setState({run:null}); root.render(<SubagentProgress />); });
  return {store:useSubagentStore,dispose:()=>{
    flushSync(()=>root.unmount());host.remove();useSubagentStore.setState({run:previous});
  }};
}
