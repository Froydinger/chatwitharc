import { useState } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { RotateCcw, Check } from "lucide-react";
import {
  ThinkingIndicator,
  useResolvedOrbTheme,
} from "@/components/ThinkingIndicator";
import {
  ORB_STATES,
  THINKING_ACTIVITIES,
  refreshThinkingOrbConfig,
  type ThinkingActivity,
  type ThinkingActivityMeta,
} from "@/hooks/useThinkingOrbConfig";

interface ThinkingOrbSettingsProps {
  /** Current value for a key, including unsaved edits (AdminPanel's getCurrentValue). */
  getCurrentValue: (key: string) => string;
  /** Stage an edit locally (AdminPanel's handleValueChange). */
  onValueChange: (key: string, value: string) => void;
  /** Persist one key to admin_settings (AdminPanel's updateSetting). */
  updateSetting: (key: string, value: string, description?: string) => Promise<unknown>;
  updating: boolean;
  onSaved: (ok: boolean, error?: unknown) => void;
}

/**
 * Props that make ThinkingIndicator render a given activity, so the preview is
 * the real component in the real state rather than a mock-up of it.
 */
function previewProps(activity: ThinkingActivity) {
  return {
    isLoading: true,
    isGeneratingImage: activity === "image",
    searchingWeb: activity === "web",
    searchingChats: activity === "chats",
    accessingMemory: activity === "memory",
  };
}

export function ThinkingOrbSettings({
  getCurrentValue,
  onValueChange,
  updateSetting,
  updating,
  onSaved,
}: ThinkingOrbSettingsProps) {
  const orbTheme = useResolvedOrbTheme();
  const [focused, setFocused] = useState<ThinkingActivity>("thinking");

  const valueFor = (activity: ThinkingActivityMeta): OrbState => {
    const stored = getCurrentValue(activity.key);
    return (ORB_STATES.some((s) => s.id === stored) ? stored : activity.defaultState) as OrbState;
  };

  const isDirty = THINKING_ACTIVITIES.some((a) => valueFor(a) !== a.defaultState);

  const focusedActivity = THINKING_ACTIVITIES.find((a) => a.id === focused)!;
  const focusedState = valueFor(focusedActivity);

  const handleSave = async () => {
    try {
      for (const activity of THINKING_ACTIVITIES) {
        await updateSetting(activity.key, valueFor(activity), activity.description);
      }
      await refreshThinkingOrbConfig();
      onSaved(true);
    } catch (error) {
      onSaved(false, error);
    }
  };

  const handleResetDefaults = () => {
    THINKING_ACTIVITIES.forEach((a) => onValueChange(a.key, a.defaultState));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Assignment + live preview ─────────────────────────────────────── */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>Thinking Indicator</CardTitle>
          <CardDescription>
            Pick the animation Arc plays for each thing it can be doing. Every row below is the
            real indicator in that state — exactly what users see in chat.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {THINKING_ACTIVITIES.map((activity) => {
            const state = valueFor(activity);
            const isFocused = focused === activity.id;
            return (
              <button
                key={activity.id}
                type="button"
                onClick={() => setFocused(activity.id)}
                className={cn(
                  "w-full flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl border text-left transition-all",
                  isFocused
                    ? "border-primary/50 bg-primary/5"
                    : "border-border/40 bg-muted/10 hover:bg-muted/20",
                )}
                aria-pressed={isFocused}
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{activity.label}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                      {state}
                    </Badge>
                    {state !== activity.defaultState && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-primary/15 text-primary border-0">
                        changed
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{activity.description}</p>
                </div>

                {/* The real component, so the chip, spacing and copy are truthful.
                    The override makes it show the pending pick, not the saved one. */}
                <div className="shrink-0 pointer-events-none">
                  <ThinkingIndicator
                    {...previewProps(activity.id)}
                    hideHelpers
                    orbStateOverride={state}
                  />
                </div>
              </button>
            );
          })}

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button onClick={handleSave} disabled={updating} className="flex-1 noir-send-btn">
              {updating ? "Saving..." : "Save Thinking Indicator"}
            </Button>
            <Button
              variant="outline"
              onClick={handleResetDefaults}
              disabled={updating || !isDirty}
              className="gap-2"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to defaults
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── The nine animations ───────────────────────────────────────────── */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">
            Animation for “{focusedActivity.label}”
          </CardTitle>
          <CardDescription>
            All nine animations thinking-orbs ships, playing live. Pick one to assign it to{" "}
            <span className="text-foreground font-medium">{focusedActivity.label}</span> — the
            preview above updates immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {ORB_STATES.map((orb) => {
              const selected = focusedState === orb.id;
              return (
                <button
                  key={orb.id}
                  type="button"
                  onClick={() => onValueChange(focusedActivity.key, orb.id)}
                  className={cn(
                    "relative flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all active:scale-[0.98]",
                    selected
                      ? "border-primary/60 bg-primary/10"
                      : "border-border/40 bg-muted/10 hover:bg-muted/20",
                  )}
                  aria-pressed={selected}
                >
                  {selected && (
                    <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                  <ThinkingOrb
                    state={orb.id}
                    size={64}
                    speed={0.75}
                    theme={orbTheme}
                    aria-label={`${orb.label} animation`}
                    style={{ width: 56, height: 56 }}
                  />
                  <div className="text-center">
                    <div className="text-xs font-semibold">{orb.label}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      {orb.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 p-3 rounded-xl bg-muted/20 border border-border/40">
            <Label className="text-[11px] text-muted-foreground">
              Inline size (20px) — used nowhere yet, shown so you can judge how a state reads
              small before we adopt it elsewhere.
            </Label>
            <div className="flex flex-wrap items-center gap-4 mt-2">
              {ORB_STATES.map((orb) => (
                <div key={orb.id} className="flex items-center gap-1.5">
                  <ThinkingOrb
                    state={orb.id}
                    size={20}
                    speed={0.75}
                    theme={orbTheme}
                    aria-label={`${orb.label} animation, inline size`}
                  />
                  <span className="text-[10px] text-muted-foreground">{orb.label}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
