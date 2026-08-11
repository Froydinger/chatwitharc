import { useState } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { RotateCcw, Check, Mic } from "lucide-react";
import { ThinkingIndicator, useResolvedOrbTheme } from "@/components/ThinkingIndicator";
import { ImageGenerationFx } from "@/components/ImageGenerationFx";
import {
  IMGFX_KEYS,
  IMGFX_PRESETS,
  ORB_STATES,
  THINKING_ACTIVITIES,
  VOICE_PHASES,
  DEFAULT_IMGFX_CONFIG,
  refreshThinkingOrbConfig,
  type ImgFxPreset,
  type ThinkingActivity,
  type VoicePhase,
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

/** Which row the animation gallery is currently editing. */
type FocusTarget = { kind: "chat"; id: ThinkingActivity } | { kind: "voice"; id: VoicePhase };

/**
 * Props that make ThinkingIndicator render a given activity, so the chat
 * previews are the real component in the real state, not a mock-up of it.
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
  const [focus, setFocus] = useState<FocusTarget>({ kind: "chat", id: "thinking" });

  const readState = (key: string, fallback: OrbState): OrbState => {
    const stored = getCurrentValue(key);
    return (ORB_STATES.some((s) => s.id === stored) ? stored : fallback) as OrbState;
  };

  const focusedRow =
    focus.kind === "chat"
      ? THINKING_ACTIVITIES.find((a) => a.id === focus.id)!
      : VOICE_PHASES.find((p) => p.id === focus.id)!;
  const focusedState = readState(focusedRow.key, focusedRow.defaultState);

  // img-fx
  const imgFxEnabled = (getCurrentValue(IMGFX_KEYS.enabled) || "true") !== "false";
  const imgFxPreset = (IMGFX_PRESETS.some((p) => p.id === getCurrentValue(IMGFX_KEYS.preset))
    ? getCurrentValue(IMGFX_KEYS.preset)
    : DEFAULT_IMGFX_CONFIG.preset) as ImgFxPreset;
  const imgFxScaleRaw = Number.parseFloat(getCurrentValue(IMGFX_KEYS.pixelScale));
  const imgFxScale = Number.isFinite(imgFxScaleRaw) && imgFxScaleRaw > 0 ? imgFxScaleRaw : 1;

  const allRows = [...THINKING_ACTIVITIES, ...VOICE_PHASES];
  const isDirty =
    allRows.some((r) => readState(r.key, r.defaultState) !== r.defaultState) ||
    !imgFxEnabled ||
    imgFxPreset !== DEFAULT_IMGFX_CONFIG.preset ||
    imgFxScale !== DEFAULT_IMGFX_CONFIG.pixelScale;

  const handleSave = async () => {
    try {
      for (const row of allRows) {
        await updateSetting(row.key, readState(row.key, row.defaultState), row.description);
      }
      await updateSetting(IMGFX_KEYS.enabled, String(imgFxEnabled), "Enable the img-fx image generation effect");
      await updateSetting(IMGFX_KEYS.preset, imgFxPreset, "img-fx preset for the image generation loader");
      await updateSetting(IMGFX_KEYS.pixelScale, String(imgFxScale), "img-fx pixel cell size multiplier");
      await refreshThinkingOrbConfig();
      onSaved(true);
    } catch (error) {
      onSaved(false, error);
    }
  };

  const handleResetDefaults = () => {
    allRows.forEach((r) => onValueChange(r.key, r.defaultState));
    onValueChange(IMGFX_KEYS.enabled, String(DEFAULT_IMGFX_CONFIG.enabled));
    onValueChange(IMGFX_KEYS.preset, DEFAULT_IMGFX_CONFIG.preset);
    onValueChange(IMGFX_KEYS.pixelScale, String(DEFAULT_IMGFX_CONFIG.pixelScale));
  };

  const rowShell = (selected: boolean) =>
    cn(
      "w-full flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl border text-left transition-all",
      selected ? "border-primary/50 bg-primary/5" : "border-border/40 bg-muted/10 hover:bg-muted/20",
    );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Chat activities ───────────────────────────────────────────────── */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>Thinking Indicator</CardTitle>
          <CardDescription>
            Pick the animation Arc plays for each thing it can be doing. Which row applies is
            decided at runtime by the tool Arc chooses, so it changes as the model works. Every
            row below is the real indicator in that state — exactly what users see in chat.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {THINKING_ACTIVITIES.map((activity) => {
            const state = readState(activity.key, activity.defaultState);
            const selected = focus.kind === "chat" && focus.id === activity.id;
            return (
              <button
                key={activity.id}
                type="button"
                onClick={() => setFocus({ kind: "chat", id: activity.id })}
                className={rowShell(selected)}
                aria-pressed={selected}
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
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

                {/* The real component; the override shows the pending pick. */}
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
        </CardContent>
      </Card>

      {/* ── Voice mode ────────────────────────────────────────────────────── */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-primary" />
            Voice Mode
          </CardTitle>
          <CardDescription>
            A separate animation for each phase of a voice call. In the live bar the orb also
            rides the mic and playback level, so it speeds up and glows with the room.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {VOICE_PHASES.map((phase) => {
            const state = readState(phase.key, phase.defaultState);
            const selected = focus.kind === "voice" && focus.id === phase.id;
            return (
              <button
                key={phase.id}
                type="button"
                onClick={() => setFocus({ kind: "voice", id: phase.id })}
                className={rowShell(selected)}
                aria-pressed={selected}
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{phase.label}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                      {state}
                    </Badge>
                    {state !== phase.defaultState && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-primary/15 text-primary border-0">
                        changed
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{phase.description}</p>
                </div>

                {/* The live bar needs an open realtime session, so this mirrors
                    its orb + label rather than mounting the real overlay. */}
                <div className="shrink-0 pointer-events-none">
                  <div className="flex items-center gap-2.5 rounded-[2rem] border border-primary/25 bg-background/80 px-3 py-2 shadow-lg backdrop-blur-xl">
                    <div className="relative flex h-10 w-10 items-center justify-center">
                      <ThinkingOrb
                        state={state}
                        size={64}
                        speed={0.9}
                        theme={orbTheme}
                        aria-label={`${phase.label} animation`}
                        style={{ width: 38, height: 38 }}
                      />
                      <div
                        className="absolute inset-1.5 -z-10 rounded-full bg-primary/30 blur-lg"
                        aria-hidden="true"
                      />
                    </div>
                    <span className="text-sm font-semibold whitespace-nowrap">
                      {phase.sampleMessage}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* ── The nine animations ───────────────────────────────────────────── */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Animation for “{focusedRow.label}”</CardTitle>
          <CardDescription>
            All nine animations thinking-orbs ships, playing live. Pick one to assign it to{" "}
            <span className="text-foreground font-medium">{focusedRow.label}</span>
            {focus.kind === "voice" ? " (voice mode)" : ""} — the preview above updates
            immediately.
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
                  onClick={() => onValueChange(focusedRow.key, orb.id)}
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
        </CardContent>
      </Card>

      {/* ── img-fx ────────────────────────────────────────────────────────── */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Image Generation Effect</CardTitle>
          <CardDescription>
            The WebGL loader that plays on the image placeholder while Arc renders. Powered by
            img-fx; the chunk only downloads once an image is actually generating.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/20 border border-border/40">
            <div className="space-y-0.5">
              <Label htmlFor="imgfx_enabled" className="font-semibold text-sm">
                Enable the effect
              </Label>
              <p className="text-xs text-muted-foreground">
                Off falls back to the plain Arc-logo loader — worth trying if low-end devices
                struggle with the shader.
              </p>
            </div>
            <Switch
              id="imgfx_enabled"
              checked={imgFxEnabled}
              onCheckedChange={(checked) => onValueChange(IMGFX_KEYS.enabled, String(checked))}
            />
          </div>

          <div className={cn("space-y-4", !imgFxEnabled && "opacity-50 pointer-events-none")}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {IMGFX_PRESETS.map((preset) => {
                const selected = imgFxPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onValueChange(IMGFX_KEYS.preset, preset.id)}
                    className={cn(
                      "relative flex flex-col gap-3 p-3 rounded-2xl border text-left transition-all active:scale-[0.98]",
                      selected
                        ? "border-primary/60 bg-primary/10"
                        : "border-border/40 bg-muted/10 hover:bg-muted/20",
                    )}
                    aria-pressed={selected}
                  >
                    {selected && (
                      <span className="absolute top-2 right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                    {/* Each tile runs the real shader at that preset. */}
                    <ImageGenerationFx
                      forceEnabled
                      presetOverride={preset.id}
                      pixelScaleOverride={imgFxScale}
                    >
                      <div
                        className="w-full rounded-xl bg-white/5 border border-white/10"
                        style={{ aspectRatio: "1 / 1" }}
                      />
                    </ImageGenerationFx>
                    <div>
                      <div className="text-xs font-semibold">{preset.label}</div>
                      <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                        {preset.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2 p-4 rounded-2xl bg-muted/20 border border-border/40">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-sm">Pixel scale</Label>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {imgFxScale.toFixed(2)}×
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Cell size multiplier — below 1 is a finer grid, above 1 is chunkier. Cell size is
                in CSS pixels, so it looks the same on any card size.
              </p>
              <Slider
                value={[imgFxScale]}
                min={0.25}
                max={4}
                step={0.25}
                onValueChange={([v]) => onValueChange(IMGFX_KEYS.pixelScale, String(v))}
                className="pt-2"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button onClick={handleSave} disabled={updating} className="flex-1 noir-send-btn">
          {updating ? "Saving..." : "Save All Indicator Settings"}
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
    </div>
  );
}
