import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthModal } from '@/components/AuthModal';
import { ThemedLogo } from '@/components/ThemedLogo';
import { Button } from '@/components/ui/button';

export function InstalledWelcomePage() {
  const [mode, setMode] = useState<'login' | 'signup' | null>(null);
  return <main className="flex min-h-[100dvh] flex-col bg-black px-6 text-white" style={{ fontFamily: 'Manrope, sans-serif', paddingTop: 'calc(var(--arcai-safe-area-top, env(safe-area-inset-top, 0px)) + var(--arcai-desktop-titlebar-safe-area, 0px) + 2rem)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}>
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center py-10 text-center">
      <div className="mb-7 [&_.themed-logo]:!bg-white"><ThemedLogo className="h-20 w-20" alt="ArcAI" /></div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-white/50">Ask. Reflect. Create.</p>
      <h1 className="text-4xl font-semibold tracking-tight">Welcome to ArcAI</h1>
      <p className="mt-4 max-w-xs text-base leading-relaxed text-white/65">Your personal AI agent. A place to think, make things, and move ideas forward.</p>
      <div className="mt-10 flex w-full flex-col gap-3">
        <Button variant="ghost" className="h-12 rounded-full !bg-white text-base !text-black hover:!bg-white/90 focus-visible:ring-white/70 focus-visible:ring-offset-black" onClick={() => setMode('login')}>Sign in</Button>
        <Button variant="ghost" className="h-12 rounded-full border border-white/25 !bg-transparent text-base !text-white hover:!bg-white/10 focus-visible:ring-white/70 focus-visible:ring-offset-black" onClick={() => setMode('signup')}>Create account</Button>
      </div>
    </div>
    <footer className="flex justify-center gap-5 text-xs text-white/45"><Link to="/privacy" className="hover:text-white">Privacy</Link><Link to="/terms" className="hover:text-white">Terms</Link></footer>
    <AuthModal forceDark isOpen={mode !== null} onClose={() => setMode(null)} initialMode={mode ?? 'login'} />
  </main>;
}
