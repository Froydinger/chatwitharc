import type { ReactNode } from 'react';
import { useWorkspaceSettingsRows } from './settingsPresentation';
import { GlassCard, type GlassCardProps } from '@/components/ui/glass-card';
import { cn } from '@/lib/utils';

export function SettingsSurface({
  children, className, workspaceClassName, plain = false, ...props
}: GlassCardProps & { children?: ReactNode; workspaceClassName?: string; plain?: boolean }) {
  const workspace = useWorkspaceSettingsRows();
  if (workspace) {
    return <section className={cn('workspace-settings-group', workspaceClassName)}>{children}</section>;
  }
  if (plain) return <div className={className}>{children}</div>;
  return <GlassCard className={className} {...props}>{children}</GlassCard>;
}
