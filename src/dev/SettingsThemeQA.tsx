import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Brain } from 'lucide-react';
import { useAccentColor } from '@/hooks/useAccentColor';

function SettingsThemeProbe() {
  useAccentColor();
  return <main className="bg-background text-foreground" style={{ padding: 32 }}>
    <h1>Settings theme check</h1>
    <button className="bg-primary/10 text-foreground p-4 rounded-2xl">
      <span className="text-primary"><Brain /></span> Account settings
    </button>
  </main>;
}

export function installSettingsThemeQA() {
  const host = document.createElement('div');
  host.id = 'arc-settings-theme-qa';
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => root.render(<SettingsThemeProbe />));
  return { dispose() { root.unmount(); host.remove(); } };
}
