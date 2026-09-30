import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { FingerPopupList } from '@/components/FingerPopup';

export function installFingerPopupMotionQA() {
  if (!import.meta.env.DEV) throw new Error('Local QA only');
  const host=document.createElement('div');host.id='arc-finger-popup-qa';document.body.append(host);const root=createRoot(host);
  const render=(ids: string[])=>flushSync(()=>root.render(<FingerPopupList popups={ids.map((id,index)=>({id,message:`Fixture notice ${id}`,x:220,y:250+index*70}))}/>));
  render(['one','two']);return {render,dispose:()=>{flushSync(()=>root.unmount());host.remove();}};
}
