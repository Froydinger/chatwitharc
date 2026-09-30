import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { WidthPanel } from '@/components/transitions/WidthPanel';
import { CanvasVersionHistory } from '@/components/CanvasVersionHistory';

export function installCanvasWidthMotionQA() {
  if (!import.meta.env.DEV) throw new Error('Local QA only');
  const host=document.createElement('div');host.id='arc-canvas-width-qa';
  Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'10000',background:'hsl(var(--background))',padding:'12px'});document.body.append(host);const root=createRoot(host);const calls:number[]=[];
  function Fixture(){
    const [open,setOpen]=useState(false);const [active,setActive]=useState(0);const [pane,setPane]=useState(false);const [width,setWidth]=useState('60%');const [instant,setInstant]=useState(false);
    return <><button data-qa-history onClick={()=>setOpen(value=>!value)}>Toggle history</button><button data-qa-pane onClick={()=>setPane(value=>!value)}>Toggle pane</button><button data-qa-resize onClick={()=>{setInstant(true);setWidth('80%');}}>Resize immediately</button>
      <div className="flex h-72 border mt-4" data-qa-history-shell><div className="flex-1">Synthetic editor</div><CanvasVersionHistory open={open} charCount={123} versions={[{id:'one',content:'First',label:'First version',timestamp:0},{id:'two',content:'Second',label:'Second version',timestamp:1}]} activeVersionIndex={active} onRestore={index=>{calls.push(index);setActive(index);}} /></div>
      <div className="flex h-32 border mt-4" style={{width:'100%'}} data-qa-pane-shell><div className="flex-1">Chat</div><WidthPanel open={pane} width={width} minWidth={120} instant={instant} className="flex-shrink-0 overflow-hidden bg-muted">Synthetic Canvas pane</WidthPanel></div>
    </>;
  }
  flushSync(()=>root.render(<Fixture/>));return {calls,dispose:()=>{flushSync(()=>root.unmount());host.remove();}};
}
