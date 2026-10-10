import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

interface AppBuilderDesktopNoticeProps {
  onBackToChat?: () => void;
  overlay?: boolean;
}

export function AppBuilderDesktopNotice({ onBackToChat, overlay = false }: AppBuilderDesktopNoticeProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      role="status"
      className={overlay
        ? 'fixed inset-0 z-[210] flex items-center justify-center bg-background/95 p-6 text-foreground backdrop-blur-sm'
        : 'min-h-[100dvh] flex items-center justify-center bg-background p-6 text-foreground'}
    >
      <section className="w-full max-w-sm rounded-3xl border border-border/60 bg-card p-6 text-center shadow-lg">
        <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold">Open on desktop</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          App Builder is available on desktop. Your saved projects and running jobs stay available when you return there.
        </p>
        {onBackToChat && <Button type="button" variant="outline" onClick={onBackToChat} className="mt-5 w-full rounded-xl">Back to chat</Button>}
      </section>
    </div>
  );
}
