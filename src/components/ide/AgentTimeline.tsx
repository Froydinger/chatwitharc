import { useState } from 'react';
import { FileCode, FilePlus, Trash2, Check, X, Loader2, Brain, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentAction } from '@/types/ide';

interface AgentTimelineProps {
  actions: AgentAction[];
  isRunning: boolean;
}

function getActionLabel(action?: string, path?: string) {
  const file = path?.split('/').pop() || path;
  switch (action) {
    case 'creating': return `Creating ${file}…`;
    case 'created': return `Created ${file}`;
    case 'modifying': return `Modifying ${file}…`;
    case 'modified': return `Modified ${file}`;
    case 'deleting': return `Deleting ${file}…`;
    case 'deleted': return `Deleted ${file}`;
    default: return action || '';
  }
}

function isInProgress(action?: string) {
  return ['creating', 'modifying', 'deleting'].includes(action || '');
}

export function AgentTimeline({ actions, isRunning }: AgentTimelineProps) {
  const [expanded, setExpanded] = useState(false);

  if (actions.length === 0 && !isRunning) return null;

  const completedPaths = new Set(
    actions.filter(a => a.type === 'action_complete').map(a => `${a.action}:${a.path}`)
  );

  const displayActions = actions.filter(a => {
    if (a.type === 'action') {
      const actionMap: Record<string, string> = { creating: 'created', modifying: 'modified', deleting: 'deleted' };
      const completedKey = `${actionMap[a.action || '']}:${a.path}`;
      if (completedPaths.has(completedKey)) return false;
    }
    return true;
  });

  const completedCount = displayActions.filter(a => a.type === 'action_complete' && a.success !== false).length;
  const totalActions = displayActions.filter(a => a.type === 'action' || a.type === 'action_complete').length;

  // Find latest action for collapsed summary
  const latestAction = [...displayActions].reverse().find(a =>
    a.type === 'action' || a.type === 'action_complete' || a.type === 'status'
  );

  const summaryLabel = isRunning
    ? latestAction?.type === 'status'
      ? latestAction.message || 'Thinking…'
      : latestAction?.type === 'action' && isInProgress(latestAction.action)
        ? getActionLabel(latestAction.action, latestAction.path)
        : latestAction?.type === 'action_complete'
          ? getActionLabel(latestAction.action, latestAction.path)
          : 'Thinking…'
    : `Completed ${completedCount} action${completedCount !== 1 ? 's' : ''}`;

  return (
    <div className="py-0.5">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 text-[11px] w-full text-left py-1 group/timeline hover:bg-muted/30 rounded-md px-1 -mx-1 transition-colors"
      >
        {expanded
          ? <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          : <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        }
        {isRunning ? (
          <Loader2 className="h-3 w-3 animate-spin text-primary flex-shrink-0" />
        ) : (
          <div className="h-3 w-3 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Check className="h-2 w-2 text-primary" />
          </div>
        )}
        <span className={cn(
          "truncate",
          isRunning ? "text-foreground" : "text-muted-foreground"
        )}>
          {summaryLabel}
        </span>
        {totalActions > 0 && (
          <span className="ml-auto text-muted-foreground/50 flex-shrink-0">
            {completedCount}/{totalActions}
          </span>
        )}
      </button>

      {/* Expanded timeline */}
      {expanded && (
        <div className="space-y-0.5 pl-4 border-l border-border/30 ml-1.5 mt-0.5">
          {displayActions.map(action => {
            if (action.type === 'status') {
              return (
                <div key={action.id} className="flex items-center gap-2 text-[11px] text-muted-foreground py-0.5">
                  <Brain className="h-3 w-3 text-primary animate-pulse" />
                  <span>{action.message}</span>
                </div>
              );
            }
            if (action.type === 'error') {
              return (
                <div key={action.id} className="flex items-center gap-2 text-[11px] text-destructive py-0.5">
                  <X className="h-3 w-3" />
                  <span>{action.message}</span>
                </div>
              );
            }

            const inProg = action.type === 'action' && isInProgress(action.action);
            const isComplete = action.type === 'action_complete';
            const succeeded = isComplete && action.success !== false;
            const failed = isComplete && action.success === false;

            return (
              <div key={action.id} className={cn(
                'flex items-center gap-2 text-[11px] py-0.5 transition-opacity',
                inProg && 'text-foreground',
                succeeded && 'text-muted-foreground',
                failed && 'text-destructive'
              )}>
                {inProg ? (
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                ) : succeeded ? (
                  <div className="h-3 w-3 rounded-full bg-primary/20 flex items-center justify-center">
                    <Check className="h-2 w-2 text-primary" />
                  </div>
                ) : failed ? (
                  <X className="h-3 w-3" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                <span className="break-words">{getActionLabel(action.action, action.path)}</span>
              </div>
            );
          })}

          {isRunning && displayActions.length > 0 && !displayActions.some(a => a.type === 'action' && isInProgress(a.action)) && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-0.5">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <span>Thinking…</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
