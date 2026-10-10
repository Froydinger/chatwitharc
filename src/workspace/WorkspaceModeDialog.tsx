import { useRef, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useWorkspaceUI } from '@/workspace/WorkspaceContext';
import './workspace-canvas-modes.css';

/** Presentation and focus boundary for existing mode dialogs. The production
 * children keep their original controls, requests, validation and warnings. */
export function WorkspaceModeDialog({ open, onClose, title, dismissDisabled = false, image = false, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  dismissDisabled?: boolean;
  image?: boolean;
  children: ReactNode;
}) {
  const workspaceUI = useWorkspaceUI();
  const returnFocus = useRef<HTMLElement | null>(null);
  if (!workspaceUI) return <>{children}</>;
  return (
    <Dialog.Root open={open} onOpenChange={next => { if (!next && !dismissDisabled) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="workspace-mode-dialog-overlay" />
        <Dialog.Content
          className={`workspace-ui workspace-mode-dialog${image ? ' workspace-mode-dialog-image' : ''}`}
          aria-describedby={undefined}
          aria-busy={dismissDisabled || undefined}
          onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
          }}
          onEscapeKeyDown={event => { if (dismissDisabled) event.preventDefault(); }}
          onPointerDownOutside={event => { if (dismissDisabled) event.preventDefault(); }}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
