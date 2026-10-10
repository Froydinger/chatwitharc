import { useId, type ReactNode, type RefObject } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

/** The live forms can have more than one opener. Restore the actual opener,
 * including a reminder's action menu, instead of Radix's unset trigger ref. */
export function WorkspaceOrganizerDialog({ title, description, open, onOpenChange, returnFocusRef, fallbackFocusRef, busy = false, children }: {
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef: RefObject<HTMLButtonElement>;
  fallbackFocusRef?: RefObject<HTMLButtonElement>;
  busy?: boolean;
  children: ReactNode;
}) {
  const descriptionId = useId();
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal>
    <Dialog.Overlay className="ws-modal-overlay" />
    <Dialog.Content className="workspace-ui ws-modal" aria-describedby={descriptionId} onCloseAutoFocus={event => {
      const target = returnFocusRef.current?.isConnected ? returnFocusRef.current : fallbackFocusRef?.current;
      if (target?.isConnected) {
        event.preventDefault();
        target.focus();
      }
    }}>
      <div className="ws-modal-heading"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description id={descriptionId}>{description}</Dialog.Description></div><Dialog.Close asChild><button className="ws-icon-button" aria-label="Close dialog" disabled={busy}><X /></button></Dialog.Close></div>
      {children}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
