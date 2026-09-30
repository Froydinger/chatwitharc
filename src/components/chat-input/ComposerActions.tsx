import React, { type ComponentType, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ConditionalTransition } from "@/components/transitions/ConditionalTransition";
import { TransitionPart } from "@/components/transitions/TransitionPart";
import { LiquidMetalOverlay } from "@/components/ui/liquid-metal-overlay";
import { cn } from "@/lib/utils";

/** Controlled create menu. Access, routing and side effects stay in ChatInput. */
export function ComposerActions({ showMenu, position, actions, onClose }: {
  showMenu: boolean;
  position: CSSProperties;
  actions: { id: string; icon: ComponentType<{ className?: string }>; iconClass: string; label: string; badge?: string; run: () => void }[];
  onClose: () => void;
}) {
  return createPortal(
                  <>
                  <ConditionalTransition preset="fade">{showMenu && (
                      <div
                        className="ci-tiles fixed inset-0 z-[400] bg-transparent"
                        onClick={() => onClose()}
                      />
                  )}</ConditionalTransition>
                  <ConditionalTransition preset="fade">{showMenu && (
                      <div className="ci-tiles fixed inset-0 z-[401] pointer-events-none" data-testid="composer-create-menu">
                      <TransitionPart><div
                        style={{
                          ...position,
                          width: "min(312px, calc(100vw - 24px))",
                          maxWidth: "calc(100vw - 24px)",
                          maxHeight: "min(520px, calc(100vh - 32px))",
                          translate: "-50% -50%",
                          transformOrigin: "center",
                        }}
                        className="liquid-metal-surface pointer-events-auto fixed overflow-y-auto rounded-[28px] border border-black/[0.1] bg-white/[0.94] p-2.5 shadow-[0_24px_70px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-2xl dark:border-white/[0.1] dark:bg-black/[0.94] dark:shadow-[0_24px_70px_rgba(0,0,0,0.68),inset_0_1px_0_rgba(255,255,255,0.08)]"
                      >
                        <div className="pointer-events-none absolute inset-0 z-0">
                          <LiquidMetalOverlay preset="chromatic" strength={0.28} />
                        </div>
                        <div className="relative z-10 flex flex-col gap-0.5">
                          {actions.map((action) => {
                            const Icon = action.icon;
                            return (
                              <React.Fragment key={action.id}>
                              <button
                                type="button"
                                onClick={action.run}
                                className="ci-create-row group flex min-h-10 w-full items-center gap-3 rounded-full px-3 py-1.5 text-left text-[15px] text-foreground transition-colors hover:bg-black/[0.06] focus-visible:bg-black/[0.08] dark:hover:bg-white/[0.09] dark:focus-visible:bg-white/[0.1] focus-visible:outline-none"
                              >
                                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-105", action.iconClass)}>
                                  <Icon className="h-4 w-4" />
                                </span>
                                <span className="flex min-w-0 flex-1 items-center gap-2 font-medium">
                                  <span className="truncate">{action.label}</span>
                                </span>
                                {action.badge && <span className="rounded-full bg-neon-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-neon-700 dark:text-neon-300">{action.badge}</span>}
                              </button>
                              </React.Fragment>
                            );
                          })}
                        </div>

                      </div></TransitionPart>
                      </div>
                  )}</ConditionalTransition>
                </>,
                  document.body
                );
}
