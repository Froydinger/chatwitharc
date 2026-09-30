import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { BenchoNowPlaying } from '@/components/music/BenchoNowPlaying';
import { useMusicStore } from '@/store/useMusicStore';

export function installMusicMotionQA(){
  if(!import.meta.env.DEV)throw new Error('Local QA only');
  const previous=useMusicStore.getState();const saved=localStorage.getItem('arc-music-storage');const calls:string[]=[];
  useMusicStore.setState({isPlaying:false,isLoading:false,duration:120,currentTime:30,
    togglePlay:()=>{calls.push('play');useMusicStore.setState({isPlaying:!useMusicStore.getState().isPlaying});},
    prevTrack:()=>calls.push('previous'),nextTrack:()=>calls.push('next'),seek:value=>{calls.push(`seek:${value}`);useMusicStore.setState({currentTime:value});},
  });
  const host=document.createElement('div');host.id='arc-music-motion-qa';
  Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'10000',background:'hsl(var(--background))',padding:'80px 24px'});
  document.body.append(host);const root=createRoot(host);
  function Fixture(){const [liked,setLiked]=useState(false);return <BenchoNowPlaying liked={liked} onToggleLike={()=>{calls.push('like');setLiked(v=>!v);}}/>;}
  flushSync(()=>root.render(<Fixture/>));return {calls,dispose:()=>{
    flushSync(()=>root.unmount());host.remove();useMusicStore.setState(previous,true);
    if(saved===null)localStorage.removeItem('arc-music-storage');else localStorage.setItem('arc-music-storage',saved);
  }};
}
