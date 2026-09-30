import { useEffect, useState } from 'react';
import { ThemedLogo } from '@/components/ThemedLogo';

export function FullscreenLoader() {
  const [stage,setStage]=useState<'spin'|'bloop'>('spin');
  useEffect(()=>{const timer=setTimeout(()=>setStage('bloop'),1000);return()=>clearTimeout(timer);},[]);
  return <div className="arc-fullscreen-loader fixed inset-0 flex items-center justify-center bg-background z-[9999]" data-stage={stage}>
    <div className="relative flex items-center justify-center">
      <div className="arc-loader-halo absolute inset-0 rounded-full bg-primary/20 filter blur-xl animate-pulse scale-150" />
      <div className="arc-fullscreen-loader-logo h-20 w-20 relative z-10"><ThemedLogo className="h-full w-full" alt="Loading" /></div>
    </div>
  </div>;
}

export function FastLoader() {
  return <div className="fixed inset-0 flex items-center justify-center bg-background z-50">
    <div className="arc-fast-loader-logo h-12 w-12">
      <div className="h-full w-full relative flex items-center justify-center">
        <ThemedLogo className="h-full w-full" alt="Loading" />
        <div className="arc-loader-halo absolute inset-0 rounded-full bg-primary/20 filter blur-xl animate-pulse" />
      </div>
    </div>
  </div>;
}
