import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ImageOptionsContent } from '@/components/ImageOptionsDock';
import { ComposerOverlays } from '@/components/chat-input/ComposerOverlays';
import { useImageGenStore, getResolvedImageModel, getResolvedEditImageModel } from '@/store/useImageGenStore';

/** Local interaction fixture: no sign-in, database, generated media or provider calls. */
export function installImageModesQA() {
  if (!import.meta.env.DEV) throw new Error('Local QA only');
  const before = useImageGenStore.getState();
  const host = document.createElement('div');
  host.id = 'arc-image-modes-qa';
  host.className = 'fixed inset-0 z-[100] bg-background p-4 text-foreground';
  document.body.append(host);
  const root = createRoot(host);
  const calls: string[] = [];
  function Fixture() {
    const [open, setOpen] = useState(false);
    return <>
      <ImageOptionsContent showUsage={false} />
      <button onClick={() => setOpen(true)}>Open image usage</button>
      <ComposerOverlays showLimitsModal={open} imageUsagePercent={25} isBoostTier={false} hasBoost={false}
        onClose={() => setOpen(false)} onSettings={() => calls.push('settings')} onUpgrade={() => calls.push('upgrade')} />
    </>;
  }
  root.render(<Fixture />);
  return {
    calls,
    models: () => ({ generation: getResolvedImageModel(), edit: getResolvedEditImageModel() }),
    dispose: () => { root.unmount(); host.remove(); useImageGenStore.setState(before); },
  };
}
