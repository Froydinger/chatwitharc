import { SettingsSurface } from '@/workspace/SettingsSurface';
import { useWorkspaceSettingsRows } from '@/workspace/settingsPresentation';
import { useEffect, useState } from 'react';
import { Bell, Mail } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function CloudRunNotificationsCard() {
  const workspace = useWorkspaceSettingsRows();
  const { user } = useAuth();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setLoading(false);
      return;
    }
    void supabase
      .from('profiles')
      .select('cloud_run_email_notifications')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast({ title: 'Notification settings unavailable', description: 'Arc will keep the default email behavior for now.', variant: 'destructive' });
        } else {
          setEnabled(data?.cloud_run_email_notifications !== false);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [toast, user]);

  const update = async (next: boolean) => {
    if (!user || saving) return;
    const previous = enabled;
    setEnabled(next);
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ cloud_run_email_notifications: next })
      .eq('user_id', user.id);
    setSaving(false);
    if (error) {
      setEnabled(previous);
      toast({ title: 'Could not save email preference', description: 'Try again in a moment.', variant: 'destructive' });
    }
  };

  return (
    <SettingsSurface className="p-5 space-y-4">
      <div className={workspace ? "workspace-settings-card-heading" : "flex items-start gap-3"}>
        <div className={workspace ? "workspace-settings-row-icon" : "p-2 rounded-xl bg-primary/15 border border-primary/30"}>
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground">Cloud run notifications</h3>
          <p className={workspace ? "workspace-settings-row-description" : "text-xs text-muted-foreground mt-0.5"}>Push alerts use your device setting; email is controlled separately below.</p>
        </div>
      </div>
      <div className={workspace ? "workspace-settings-row" : "w-full text-left p-3 rounded-xl border bg-muted/20 border-border/40 flex items-start gap-3"}>
        <div className={workspace ? "workspace-settings-row-icon" : "p-1.5 rounded-lg bg-primary/15 border border-primary/30 shrink-0"}>
          <Mail className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0 pr-3">
          <div className={workspace ? "workspace-settings-row-title" : "text-sm font-medium text-foreground"}>Email me when a cloud run finishes</div>
          <div className={workspace ? "workspace-settings-row-description" : "text-[11px] text-muted-foreground mt-0.5"}>On by default. You can turn completion emails off any time.</div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={update}
          disabled={loading || saving || !user}
          aria-label="Email me when a cloud run finishes"
        />
      </div>
    </SettingsSurface>
  );
}
