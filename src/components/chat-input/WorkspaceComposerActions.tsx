import { Fragment, useRef, type KeyboardEvent, type RefObject } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check } from 'lucide-react';
import type { ComposerAction } from '@/components/chat-input/ComposerActions';

const menuItemSelector = 'button[role="menuitem"]:not(:disabled), button[role="menuitemcheckbox"]:not(:disabled)';
const tabStopSelector = 'a[href],button:not(:disabled),input:not(:disabled):not([type="hidden"]),textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])';

/** Workspace presentation only. ChatInput continues to own each real action. */
export function WorkspaceComposerActions({ showMenu, actions, onClose, anchorRef }: {
  showMenu: boolean;
  actions: ComposerAction[];
  onClose: () => void;
  anchorRef: RefObject<HTMLButtonElement>;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  const focusTabDestination = (shiftKey: boolean) => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const menu = contentRef.current;
    const tabStops = Array.from(document.querySelectorAll<HTMLElement>(tabStopSelector)).filter((element) => {
      if (menu?.contains(element) || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      return element.getClientRects().length > 0;
    });
    const anchorIndex = tabStops.indexOf(anchor);
    if (anchorIndex < 0) return;
    const destination = tabStops[anchorIndex + (shiftKey ? -1 : 1)];
    requestAnimationFrame(() => (destination ?? anchor).focus());
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      requestAnimationFrame(() => anchorRef.current?.focus({ preventScroll: true }));
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      focusTabDestination(event.shiftKey);
      onClose();
      return;
    }

    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(contentRef.current?.querySelectorAll<HTMLButtonElement>(menuItemSelector) ?? []);
    if (!items.length) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowDown'
          ? (currentIndex + 1 + items.length) % items.length
          : (currentIndex <= 0 ? items.length - 1 : currentIndex - 1);
    event.preventDefault();
    items[nextIndex]?.focus();
  };

  return (
    <Popover.Root open={showMenu} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Popover.Anchor
        virtualRef={anchorRef as RefObject<{ getBoundingClientRect(): DOMRect }>}
        aria-hidden="true"
      />
      <Popover.Portal>
        <Popover.Content
          ref={contentRef}
          forceMount
          role="menu"
          aria-label="Create actions"
          aria-orientation="vertical"
          data-testid="composer-create-menu"
          inert={!showMenu}
          aria-hidden={!showMenu}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            contentRef.current?.querySelector<HTMLButtonElement>(menuItemSelector)?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onClick={(event) => event.stopPropagation()}
          onInteractOutside={(event) => {
            if (event.target instanceof Element && event.target.closest('.ci-menu-btn')) {
              event.preventDefault();
            }
          }}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClose();
            requestAnimationFrame(() => anchorRef.current?.focus({ preventScroll: true }));
          }}
          onKeyDown={handleMenuKeyDown}
          side="top"
          align="start"
          sideOffset={10}
          collisionPadding={12}
          className="workspace-ui ws-menu ci-tiles ci-workspace-create-menu arc-dropdown"
          style={{ pointerEvents: showMenu ? 'auto' : 'none', visibility: showMenu ? 'visible' : 'hidden' }}
        >
          {actions.map((action, index) => {
            const Icon = action.icon;
            const isWorkMode = action.id === 'work';
            return (
              <Fragment key={action.id}>
                {action.section && index > 0 && <div role="separator" aria-orientation="horizontal" />}
                {action.section && <div className="ci-workspace-create-section" role="presentation">{action.section}</div>}
                <button
                  type="button"
                  role={isWorkMode ? 'menuitemcheckbox' : 'menuitem'}
                  aria-checked={isWorkMode ? Boolean(action.active) : undefined}
                  onClick={action.run}
                  className="ci-workspace-create-row"
                >
                  <Icon className="ci-workspace-create-icon" aria-hidden="true" />
                  <span className="ci-workspace-create-label">{action.label}</span>
                  {action.badge && <span className="ci-workspace-create-badge">{action.badge}</span>}
                  {isWorkMode && action.active && <Check className="ci-workspace-create-check" aria-hidden="true" />}
                </button>
              </Fragment>
            );
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
