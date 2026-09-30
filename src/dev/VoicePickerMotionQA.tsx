import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { VoiceMagneticPicker } from '@/components/VoiceMagneticPicker';
import type { VoiceName } from '@/store/useVoiceModeStore';

export function installVoicePickerMotionQA(compact:boolean){
  if(!import.meta.env.DEV)throw new Error('Local QA only');
  const host=document.createElement('div');host.id='arc-voice-picker-qa';
  Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'10000',overflow:'auto',background:'hsl(var(--background))',padding:'32px'});
  document.body.append(host);const root=createRoot(host);const calls:string[]=[];
  function Fixture(){const [voice,setVoice]=useState<VoiceName>('marin');return <VoiceMagneticPicker compact={compact} selectedVoice={voice} onSelect={value=>{calls.push(value);setVoice(value);}}/>;}
  flushSync(()=>root.render(<Fixture/>));return {calls,dispose:()=>{flushSync(()=>root.unmount());host.remove();}};
}
