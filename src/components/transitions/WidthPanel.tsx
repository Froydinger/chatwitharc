import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Native horizontal reveal without an extra layout wrapper. Closing content
 * stays inert until its width transition finishes; reopening cancels removal. */
export function WidthPanel({ open, width, minWidth = 0, instant = false, className, children }: {
  open: boolean; width: number | string; minWidth?: number; instant?: boolean; className?: string; children: ReactNode;
}) {
  const node = useRef<HTMLDivElement>(null);
  const previous = useRef(children);
  const [retained,setRetained] = useState(open);
  const [entered,setEntered] = useState(false);
  useLayoutEffect(()=>{if(open)previous.current=children;});
  useLayoutEffect(()=>{
    if(open) {
      setRetained(true);
      if(window.matchMedia('(prefers-reduced-motion: reduce)').matches || instant) {setEntered(true);return;}
      // Resolve the initial zero width before enabling the transition.
      if(node.current) void node.current.offsetWidth;
      const frame=requestAnimationFrame(()=>setEntered(true));
      return()=>cancelAnimationFrame(frame);
    }
    setEntered(false);
    if(!node.current){setRetained(false);return;}
    const css=getComputedStyle(node.current);
    const durations=css?.transitionDuration.split(',').map(value=>(Number.parseFloat(value)||0)*(value.trim().endsWith('ms')?1:1000))??[0];
    const timer=window.setTimeout(()=>setRetained(false),Math.max(...durations));
    return()=>window.clearTimeout(timer);
  },[open,instant]);
  if(!open&&!retained)return null;
  const visible=open&&entered;
  return <div ref={node} className={`arc-width-panel ${className||''}`} data-open={visible} data-instant={instant}
    aria-hidden={!open||undefined} {...(!open?{inert:''}:{})}
    style={{width:visible?width:0,minWidth:visible?minWidth:0,opacity:visible?1:0}}
    onTransitionEnd={event=>{if(!open&&event.target===event.currentTarget&&event.propertyName==='width')setRetained(false);}}
  >{open?children:previous.current}</div>;
}
