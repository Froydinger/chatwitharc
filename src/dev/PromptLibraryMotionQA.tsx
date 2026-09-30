import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { PromptLibrary } from '@/components/PromptLibrary';
import { CACHE_KEY_PREFIX } from '@/hooks/usePromptPreload';

export function installPromptLibraryMotionQA() {
  if (!import.meta.env.DEV) throw new Error('Local QA only');
  const originals = ['ask', 'reflect', 'create'].map(category => {
    const key = CACHE_KEY_PREFIX + category;
    const value = sessionStorage.getItem(key);
    sessionStorage.setItem(key, JSON.stringify([{ label: `${category} fixture`, prompt: `${category} captured prompt` }]));
    return { key, value };
  });
  const host = document.createElement('div');
  host.id = 'arc-prompt-library-qa';
  document.body.append(host);
  const root = createRoot(host);
  let selected = 0;
  const render = (open: boolean) => flushSync(() => root.render(
    <PromptLibrary isOpen={open} onClose={() => render(false)} prompts={[]}
      onSelectPrompt={text => { host.dataset.selected = String(++selected); host.dataset.prompt = text; }} />
  ));
  render(true);
  return { render, dispose: () => {
    flushSync(() => root.unmount()); host.remove();
    originals.forEach(({ key, value }) => value === null ? sessionStorage.removeItem(key) : sessionStorage.setItem(key, value));
  } };
}
