import { WidthPanel } from '@/components/transitions/WidthPanel';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { CanvasVersion } from '@/store/useCanvasStore';

export function CanvasVersionHistory({ open, charCount, versions, activeVersionIndex, onRestore }: {
  open: boolean; charCount: number; versions: CanvasVersion[]; activeVersionIndex: number; onRestore: (index: number) => void;
}) {
  return <WidthPanel open={open} width={200} className="border-l border-border/30 bg-muted/20 overflow-hidden flex-shrink-0">
              <div className="w-[200px] h-full flex flex-col">
                <div className="px-3 py-2.5 border-b border-border/20">
                  <h3 className="text-xs font-medium text-foreground">Versions</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {charCount} chars
                  </p>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-1">
                    {versions.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60 text-center py-6 px-2">
                        No versions yet. Click "Save" to create one.
                      </p>
                    ) : (
                      versions.map((version, index) => (
                        <button
                          key={version.id}
                          onClick={() => onRestore(index)}
                          className={cn(
                            "w-full text-left p-2.5 rounded-lg transition-colors",
                            activeVersionIndex === index
                              ? "bg-primary/10 border border-primary/20"
                              : "hover:bg-muted/50 border border-transparent"
                          )}
                        >
                          <p className="text-xs font-medium text-foreground truncate">
                            {version.label}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(version.timestamp).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
  </WidthPanel>;
}
