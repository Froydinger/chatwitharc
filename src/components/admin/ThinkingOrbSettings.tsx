import { useState, useEffect } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  RotateCcw,
  Check,
  Mic,
  Gauge,
  Sparkles,
  Heart,
  AlertTriangle,
  Layers,
  RefreshCw,
  Sliders,
  Radio,
  Tv,
  Bell,
  Play,
  Trash2,
  Activity,
} from "lucide-react";
import { AnimatedCounter } from "@/components/ui/rare-ui/animated-counter";
import { NotificationBell } from "@/components/ui/rare-ui/notification-bell";
import { KineticDeleteButton } from "@/components/ui/rare-ui/kinetic-delete-button";
import { GooeyTabNav } from "@/components/ui/rare-ui/gooey-tab-nav";
import { useMusicStore, LOFI_RADIO_VIDEO_ID, YOUTUBE_PRESETS } from "@/store/useMusicStore";
import { ThinkingIndicator, useResolvedOrbTheme } from "@/components/ThinkingIndicator";
import { ImageGenerationFx } from "@/components/ImageGenerationFx";
import {
  IMGFX_KEYS,
  IMGFX_PRESETS,
  ORB_STATES,
  THINKING_ACTIVITIES,
  VOICE_PHASES,
  DEFAULT_IMGFX_CONFIG,
  MOTION_KEYS,
  DEFAULT_MOTION_CONFIG,
  normalizedOrbSpeed,
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

const TEXT_SWAP_STEPS = ["Ready", "Thinking", "Analyzing", "Synthesizing", "Complete"];

export function ThinkingOrbSettings({
  getCurrentValue,
  onValueChange,
  updateSetting,
  updating,
  onSaved,
}: ThinkingOrbSettingsProps) {
  const orbTheme = useResolvedOrbTheme();
  const [focus, setFocus] = useState<FocusTarget>({ kind: "chat", id: "thinking" });

  // Transitions Playground interactive states
  const [liked, setLiked] = useState(false);
  const [isBursting, setIsBursting] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [cardExpanded, setCardExpanded] = useState(false);
  const [textIndex, setTextIndex] = useState(0);
  const [textExit, setTextExit] = useState(false);

  // Rare UI & Micro-interactions States
  const [counterVal, setCounterVal] = useState(1337);
  const [bellCount, setBellCount] = useState(3);
  const [deleteHoldMode, setDeleteHoldMode] = useState(true);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const [demoTab, setDemoTab] = useState<"visuals" | "code" | "sound">("visuals");

  // YouTube Live Stream Admin Testing
  const { youtubeVideoId, setYoutubeVideoId } = useMusicStore();
  const [testYoutubeId, setTestYoutubeId] = useState(youtubeVideoId || LOFI_RADIO_VIDEO_ID);

  const readState = (key: string, fallback: OrbState): OrbState => {
    const stored = getCurrentValue(key);
    return (ORB_STATES.some((s) => s.id === stored) ? stored : fallback) as OrbState;
  };

  const focusedRow =
    focus.kind === "chat"
      ? THINKING_ACTIVITIES.find((a) => a.id === focus.id)!
      : VOICE_PHASES.find((p) => p.id === focus.id)!;
  const focusedState = readState(focusedRow.key, focusedRow.defaultState);

  // Motion & Speed Scaling
  const chatSpeedRaw = Number.parseFloat(getCurrentValue(MOTION_KEYS.chatSpeed));
  const chatSpeed =
    Number.isFinite(chatSpeedRaw) && chatSpeedRaw > 0
      ? chatSpeedRaw
      : DEFAULT_MOTION_CONFIG.chatSpeed;

  const voiceSpeedRaw = Number.parseFloat(getCurrentValue(MOTION_KEYS.voiceSpeed));
  const voiceSpeed =
    Number.isFinite(voiceSpeedRaw) && voiceSpeedRaw > 0
      ? voiceSpeedRaw
      : DEFAULT_MOTION_CONFIG.voiceSpeed;

  const motionSpeedRaw = Number.parseFloat(getCurrentValue(MOTION_KEYS.motionSpeed));
  const motionSpeed =
    Number.isFinite(motionSpeedRaw) && motionSpeedRaw > 0
      ? motionSpeedRaw
      : DEFAULT_MOTION_CONFIG.motionSpeed;

  // img-fx
  const imgFxEnabled = (getCurrentValue(IMGFX_KEYS.enabled) || "true") !== "false";
  const imgFxPreset = (IMGFX_PRESETS.some((p) => p.id === getCurrentValue(IMGFX_KEYS.preset))
    ? getCurrentValue(IMGFX_KEYS.preset)
    : DEFAULT_IMGFX_CONFIG.preset) as ImgFxPreset;
  const imgFxScaleRaw = Number.parseFloat(getCurrentValue(IMGFX_KEYS.pixelScale));
  const imgFxScale = Number.isFinite(imgFxScaleRaw) && imgFxScaleRaw > 0 ? imgFxScaleRaw : 1;
  const imgFxBlurRaw = Number.parseFloat(getCurrentValue(IMGFX_KEYS.blur));
  const imgFxBlur = Number.isFinite(imgFxBlurRaw) && imgFxBlurRaw >= 0 ? imgFxBlurRaw : DEFAULT_IMGFX_CONFIG.blur;

  const allRows = [...THINKING_ACTIVITIES, ...VOICE_PHASES];
  const isDirty =
    allRows.some((r) => readState(r.key, r.defaultState) !== r.defaultState) ||
    !imgFxEnabled ||
    imgFxPreset !== DEFAULT_IMGFX_CONFIG.preset ||
    imgFxScale !== DEFAULT_IMGFX_CONFIG.pixelScale ||
    imgFxBlur !== DEFAULT_IMGFX_CONFIG.blur ||
    chatSpeed !== DEFAULT_MOTION_CONFIG.chatSpeed ||
    voiceSpeed !== DEFAULT_MOTION_CONFIG.voiceSpeed ||
    motionSpeed !== DEFAULT_MOTION_CONFIG.motionSpeed;

  const handleMotionSpeedChange = (val: number) => {
    onValueChange(MOTION_KEYS.motionSpeed, String(val));
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty("--motion-speed-scale", String(val));
    }
  };

  const handleSave = async () => {
    try {
      for (const row of allRows) {
        await updateSetting(row.key, readState(row.key, row.defaultState), row.description);
      }
      await updateSetting(
        IMGFX_KEYS.enabled,
        String(imgFxEnabled),
        "Enable the img-fx image generation effect",
      );
      await updateSetting(
        IMGFX_KEYS.preset,
        imgFxPreset,
        "img-fx preset for the image generation loader",
      );
      await updateSetting(
        IMGFX_KEYS.pixelScale,
        String(imgFxScale),
        "img-fx pixel cell size multiplier",
      );
      await updateSetting(
        IMGFX_KEYS.blur,
        String(imgFxBlur),
        "img-fx blur effect in pixels",
      );
      await updateSetting(
        MOTION_KEYS.chatSpeed,
        String(chatSpeed),
        "Chat thinking orb animation speed multiplier",
      );
      await updateSetting(
        MOTION_KEYS.voiceSpeed,
        String(voiceSpeed),
        "Voice mode orb animation speed multiplier",
      );
      await updateSetting(
        MOTION_KEYS.motionSpeed,
        String(motionSpeed),
        "Global UI transitions and motion duration multiplier",
      );
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
    onValueChange(IMGFX_KEYS.blur, String(DEFAULT_IMGFX_CONFIG.blur));
    onValueChange(MOTION_KEYS.chatSpeed, String(DEFAULT_MOTION_CONFIG.chatSpeed));
    onValueChange(MOTION_KEYS.voiceSpeed, String(DEFAULT_MOTION_CONFIG.voiceSpeed));
    handleMotionSpeedChange(DEFAULT_MOTION_CONFIG.motionSpeed);
  };

  // Like button trigger
  const handleLikeClick = () => {
    const next = !liked;
    setLiked(next);
    if (next) {
      setIsBursting(true);
      setTimeout(() => setIsBursting(false), 700);
    }
  };

  // Shake trigger
  const handleShakeClick = () => {
    setIsShaking(false);
    requestAnimationFrame(() => {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
    });
  };

  // Text swap cycle
  const handleTextSwapClick = () => {
    setTextExit(true);
    setTimeout(() => {
      setTextIndex((prev) => (prev + 1) % TEXT_SWAP_STEPS.length);
      setTextExit(false);
    }, 150);
  };

  const rowShell = (selected: boolean) =>
    cn(
      "w-full flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl border text-left transition-all",
      selected
        ? "border-primary/50 bg-primary/5"
        : "border-border/40 bg-muted/10 hover:bg-muted/20",
    );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Section 1: Live Speed & Motion Tuning ───────────────────────── */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            Speed & Motion Calibration
          </CardTitle>
          <CardDescription>
            Tweak animation pace on the fly. Speeds update in real time across Chat Thinking
            Indicators, Voice Mode, and all 32 transitions from Jakub's library.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Chat Orb Speed */}
            <div className="p-4 rounded-2xl bg-muted/20 border border-border/40 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  Chat Indicator Pace
                </Label>
                <Badge variant="outline" className="text-xs font-mono">
                  {chatSpeed.toFixed(2)}×
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <Slider
                  value={[chatSpeed]}
                  min={0.5}
                  max={2.5}
                  step={0.05}
                  onValueChange={([v]) => onValueChange(MOTION_KEYS.chatSpeed, String(v))}
                  className="flex-1"
                />
                <div className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-background/80 border border-border/50">
                  <ThinkingOrb
                    state="listening"
                    size={20}
                    speed={normalizedOrbSpeed("listening", 1.05, chatSpeed)}
                    theme={orbTheme}
                    style={{ width: 22, height: 22 }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Controls the rotation & frequency of the chat thinking orb.
              </p>
            </div>

            {/* Voice Mode Speed */}
            <div className="p-4 rounded-2xl bg-muted/20 border border-border/40 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  Voice Mode Pace
                </Label>
                <Badge variant="outline" className="text-xs font-mono">
                  {voiceSpeed.toFixed(2)}×
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <Slider
                  value={[voiceSpeed]}
                  min={0.5}
                  max={2.5}
                  step={0.05}
                  onValueChange={([v]) => onValueChange(MOTION_KEYS.voiceSpeed, String(v))}
                  className="flex-1"
                />
                <div className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-background/80 border border-border/50">
                  <ThinkingOrb
                    state="composing"
                    size={20}
                    speed={normalizedOrbSpeed("composing", 0.75, voiceSpeed)}
                    theme={orbTheme}
                    style={{ width: 22, height: 22 }}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Controls the base pace of the Voice Bar hero orb before voice amplitude rides.
              </p>
            </div>

            {/* Global Transitions Speed */}
            <div className="p-4 rounded-2xl bg-muted/20 border border-border/40 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  Transitions & Motion
                </Label>
                <Badge variant="outline" className="text-xs font-mono">
                  {motionSpeed.toFixed(2)}×
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <Slider
                  value={[motionSpeed]}
                  min={0.5}
                  max={2.0}
                  step={0.05}
                  onValueChange={([v]) => handleMotionSpeedChange(v)}
                  className="flex-1"
                />
                <div className="shrink-0 text-[10px] font-medium text-muted-foreground px-1.5 py-1 rounded bg-muted/40 border border-border/30">
                  {motionSpeed < 0.85 ? "Snappy" : motionSpeed > 1.25 ? "Cinematic" : "Balanced"}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Scales all CSS durations (--duration-*, --resize-dur, --toast-open) across the app.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Chat activities ────────────────────────────────────── */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>Thinking Indicator</CardTitle>
          <CardDescription>
            Pick the animation Arc plays for each thing it can be doing. Which row applies is
            decided at runtime by the tool Arc chooses, so it changes as the model works. Every row
            below is the real indicator in that state — exactly what users see in chat.
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

      {/* ── Section 3: Voice mode ─────────────────────────────────────────── */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-primary" />
            Voice Mode
          </CardTitle>
          <CardDescription>
            A separate animation for each phase of a voice call. In the live bar the orb also rides
            the mic and playback level, so it speeds up and glows with the room.
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

                {/* Mirror the new hero orb Voice Bar design */}
                <div className="shrink-0 pointer-events-none">
                  <div className="flex items-center gap-3.5 rounded-[2.5rem] border border-primary/30 bg-background/92 px-4 py-2.5 shadow-xl backdrop-blur-2xl">
                    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
                      <div
                        className="absolute -inset-2 -z-10 rounded-full bg-primary/35 blur-xl opacity-70"
                        aria-hidden="true"
                      />
                      <div
                        className="absolute inset-0 -z-10 rounded-full bg-primary/20 blur-md"
                        aria-hidden="true"
                      />
                      <ThinkingOrb
                        state={state}
                        size={64}
                        speed={normalizedOrbSpeed(state, 0.75, voiceSpeed)}
                        theme={orbTheme}
                        aria-label={`${phase.label} animation`}
                        style={{ width: 56, height: 56 }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold tracking-wide text-foreground whitespace-nowrap">
                        {phase.sampleMessage}
                      </span>
                      <span className="h-2.5 w-2.5 rounded-full bg-primary/80 shadow-[0_0_8px_hsl(var(--primary)/0.6)]" />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Section 4: The nine animations ────────────────────────────────── */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Animation for “{focusedRow.label}”</CardTitle>
          <CardDescription>
            All nine animations thinking-orbs 0.3.1 ships, playing live. Pick one to assign it to{" "}
            <span className="text-foreground font-medium">{focusedRow.label}</span>
            {focus.kind === "voice" ? " (voice mode)" : ""} — the preview above updates immediately.
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
                    speed={normalizedOrbSpeed(
                      orb.id,
                      1.05,
                      focus.kind === "voice" ? voiceSpeed : chatSpeed,
                    )}
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

      {/* ── Section 5: img-fx 0.5.1 ───────────────────────────────────────── */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Image Generation Effect (img-fx 0.5.1)
          </CardTitle>
          <CardDescription>
            WebGL particle/mosaic shaders that play over image placeholders while Arc renders.
            Synchronized with Jakub Antalik's img-fx v0.5.1.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/20 border border-border/40">
            <div className="space-y-0.5">
              <Label htmlFor="imgfx_enabled" className="font-semibold text-sm">
                Enable the effect
              </Label>
              <p className="text-xs text-muted-foreground">
                Off falls back to the plain Arc-logo loader — useful if low-end devices struggle
                with the shader.
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
                      blurOverride={imgFxBlur}
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
                Cell size multiplier — below 1 is a finer grid, above 1 is chunkier. Cell size is in
                CSS pixels, so it looks identical on all displays.
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

            <div className="space-y-2 p-4 rounded-2xl bg-muted/20 border border-border/40">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-sm">Blur effect</Label>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                  {imgFxBlur === 0 ? "Off (0px)" : `${imgFxBlur}px`}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Softens or diffuses the image generation animations and shaders. 0px is crisp, higher values give a dreamy, frosted blur.
              </p>
              <Slider
                value={[imgFxBlur]}
                min={0}
                max={30}
                step={1}
                onValueChange={([v]) => onValueChange(IMGFX_KEYS.blur, String(v))}
                className="pt-2"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 6: transitions.dev 32-Transition Playground ──────────── */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            Transitions & Micro-Interactions Playground
          </CardTitle>
          <CardDescription>
            Interactive showcase of Jakub Antalik's transitions library (all 32 transitions loaded
            via CSS tokens). Test key animations directly on the fly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Like Button Spring Pop */}
            <div className="p-4 rounded-2xl bg-muted/20 border border-border/40 flex flex-col justify-between gap-3">
              <div>
                <div className="text-xs font-semibold">23. Like Button Spring Pop</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Spring pop with bezier overshoot & 8 radial particles.
                </p>
              </div>
              <div className="flex items-center justify-center py-2">
                <button
                  type="button"
                  onClick={handleLikeClick}
                  data-liked={liked ? "true" : "false"}
                  className={cn(
                    "t-like relative inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border/60 bg-background transition-colors active:scale-95",
                    isBursting && "is-bursting",
                  )}
                >
                  <span className="t-like-icon flex items-center justify-center">
                    <svg
                      viewBox="0 0 24 24"
                      className="t-like-heart w-5 h-5"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                    </svg>
                  </span>
                  <span className="t-like-particles">
                    {[
                      { x: "18px", y: "-18px", delay: "0ms" },
                      { x: "-18px", y: "-18px", delay: "40ms" },
                      { x: "22px", y: "4px", delay: "20ms" },
                      { x: "-22px", y: "4px", delay: "30ms" },
                      { x: "14px", y: "18px", delay: "60ms" },
                      { x: "-14px", y: "18px", delay: "50ms" },
                      { x: "0px", y: "-24px", delay: "10ms" },
                      { x: "0px", y: "24px", delay: "40ms" },
                    ].map((p, i) => (
                      <i
                        key={i}
                        style={
                          {
                            ["--px" as any]: p.x,
                            ["--py" as any]: p.y,
                            ["--pdelay" as any]: p.delay,
                          } as React.CSSProperties
                        }
                      />
                    ))}
                  </span>
                  <span className="text-xs font-medium">{liked ? "Liked!" : "Tap to like"}</span>
                </button>
              </div>
            </div>

            {/* 2. Error State Shake */}
            <div className="p-4 rounded-2xl bg-muted/20 border border-border/40 flex flex-col justify-between gap-3">
              <div>
                <div className="text-xs font-semibold">12. Error State Shake</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Multi-segment cubic-bezier shake with overshoot decay.
                </p>
              </div>
              <div className="flex items-center gap-2 py-2">
                <div
                  className={cn(
                    "flex-1 px-3 py-1.5 rounded-xl border text-xs bg-background transition-colors",
                    isShaking ? "t-shake border-destructive text-destructive" : "border-border/60",
                  )}
                >
                  {isShaking ? "Invalid Entry!" : "Sample input"}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleShakeClick}
                  className="h-8 text-xs px-2.5 shrink-0"
                >
                  Test
                </Button>
              </div>
            </div>

            {/* 3. Card Resize Tween */}
            <div className="p-4 rounded-2xl bg-muted/20 border border-border/40 flex flex-col justify-between gap-3">
              <div>
                <div className="text-xs font-semibold">01. Card Smooth Resize</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Width/height tween with cubic-bezier(0.22, 1, 0.36, 1).
                </p>
              </div>
              <div className="flex flex-col items-center justify-center py-1">
                <div
                  className={cn(
                    "t-resize flex items-center justify-center rounded-xl bg-primary/10 border border-primary/30 text-xs font-medium cursor-pointer select-none",
                    cardExpanded ? "w-full h-14" : "w-36 h-9",
                  )}
                  onClick={() => setCardExpanded(!cardExpanded)}
                >
                  {cardExpanded ? "Expanded Container" : "Tap to expand"}
                </div>
              </div>
            </div>

            {/* 4. Text States Swap */}
            <div className="p-4 rounded-2xl bg-muted/20 border border-border/40 flex flex-col justify-between gap-3">
              <div>
                <div className="text-xs font-semibold">04. Text States Swap</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Blur and vertical exit/enter translation between labels.
                </p>
              </div>
              <div className="flex items-center justify-center py-2">
                <button
                  type="button"
                  onClick={handleTextSwapClick}
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl border border-border/60 bg-background text-xs font-medium hover:bg-muted/30 transition-colors"
                >
                  <RefreshCw className="h-3 w-3 text-muted-foreground" />
                  <span
                    className={cn(
                      "t-text-swap font-semibold text-primary",
                      textExit && "is-exit",
                    )}
                  >
                    {TEXT_SWAP_STEPS[textIndex]}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 4: Rare UI & Blocks Micro-Interactions ────────────────── */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Rare UI & Blocks Micro-Interactions
          </CardTitle>
          <CardDescription>
            Interactive testing playground for new spring physics, rolling counters, kinetic delete actions, and magnetic fluid tab switches.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Animated Spring Counter */}
            <div className="p-4 rounded-2xl bg-muted/20 border border-border/40 flex flex-col justify-between gap-3">
              <div>
                <div className="text-xs font-semibold">01. Rolling Digit Counter</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Spring physics rolling columns for usage meters and token counts.
                </p>
              </div>
              <div className="flex flex-col items-center justify-center py-2 gap-2">
                <div className="text-xl font-bold text-primary font-mono">
                  <AnimatedCounter value={counterVal} height={26} prefix="✨ " suffix=" pts" />
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2"
                    onClick={() => setCounterVal((v) => Math.max(0, v - 10))}
                  >
                    -10
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2"
                    onClick={() => setCounterVal((v) => v + 1)}
                  >
                    +1
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2"
                    onClick={() => setCounterVal((v) => v + 25)}
                  >
                    +25
                  </Button>
                </div>
              </div>
            </div>

            {/* 2. Notification Bell */}
            <div className="p-4 rounded-2xl bg-muted/20 border border-border/40 flex flex-col justify-between gap-3">
              <div>
                <div className="text-xs font-semibold">02. Physics Bell & Badge</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Rotational pendulum jiggle and spring-popped badge.
                </p>
              </div>
              <div className="flex flex-col items-center justify-center py-2 gap-2">
                <NotificationBell
                  count={bellCount}
                  hasUnread={bellCount > 0}
                  size={24}
                  animationStyle="jiggle"
                />
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2"
                    onClick={() => setBellCount((c) => Math.max(0, c - 1))}
                  >
                    Clear -1
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2"
                    onClick={() => setBellCount((c) => c + 1)}
                  >
                    Ping +1
                  </Button>
                </div>
              </div>
            </div>

            {/* 3. Kinetic Delete Button */}
            <div className="p-4 rounded-2xl bg-muted/20 border border-border/40 flex flex-col justify-between gap-3">
              <div>
                <div className="text-xs font-semibold">03. Kinetic Trash Action</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Hover lid tilt with optional 500ms radial hold-to-confirm.
                </p>
              </div>
              <div className="flex flex-col items-center justify-center py-1 gap-2">
                <div className="flex items-center gap-3">
                  <KineticDeleteButton
                    mode={deleteHoldMode ? "hold-to-confirm" : "lid-hover"}
                    holdDurationMs={500}
                    size={18}
                    className="h-9 w-9 rounded-xl border border-destructive/30"
                    onDelete={() => {
                      setDeleteNotice("Item deleted via kinetic hold!");
                      setTimeout(() => setDeleteNotice(null), 2500);
                    }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {deleteHoldMode ? "Press & hold" : "Instant click"}
                  </span>
                </div>
                {deleteNotice && (
                  <span className="text-[10px] text-destructive font-mono animate-in fade-in">
                    {deleteNotice}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[11px] text-muted-foreground"
                  onClick={() => setDeleteHoldMode(!deleteHoldMode)}
                >
                  Mode: {deleteHoldMode ? "Hold-to-confirm" : "Hover tilt"}
                </Button>
              </div>
            </div>

            {/* 4. Gooey Fluid Tab Nav */}
            <div className="p-4 rounded-2xl bg-muted/20 border border-border/40 flex flex-col justify-between gap-3">
              <div>
                <div className="text-xs font-semibold">04. Gooey Fluid Tabs</div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Viscous magnetic spring pill indicator between segments.
                </p>
              </div>
              <div className="py-2">
                <GooeyTabNav
                  tabs={[
                    { id: "visuals", label: "Visuals" },
                    { id: "code", label: "Code" },
                    { id: "sound", label: "Sound" },
                  ]}
                  activeTab={demoTab}
                  onChange={(t) => setDemoTab(t)}
                  layoutId="admin-demo-gooey-pill"
                  size="sm"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 5: Live Radio & Stream Manager ─────────────────────── */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            Live Radio & Media Stream Manager
          </CardTitle>
          <CardDescription>
            Inspect and configure 24/7 background audio streams. Test live playback directly in the panel to verify streams before users hear them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Controls */}
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Default Live Radio Video ID
                </Label>
                <div className="flex gap-2 mt-1.5">
                  <input
                    type="text"
                    value={testYoutubeId}
                    onChange={(e) => setTestYoutubeId(e.target.value)}
                    placeholder="YouTube Video ID (11 chars)"
                    className="flex-1 rounded-xl bg-muted/30 border border-border/40 px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <Button
                    size="sm"
                    className="noir-send-btn text-xs"
                    onClick={() => {
                      setYoutubeVideoId(testYoutubeId);
                    }}
                  >
                    Apply Live
                  </Button>
                </div>
              </div>

              {/* Station Presets */}
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Verified 24/7 Radio Presets
                </Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {YOUTUBE_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setTestYoutubeId(p.videoId);
                        setYoutubeVideoId(p.videoId);
                      }}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-150",
                        testYoutubeId === p.videoId
                          ? "bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/40"
                          : "bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-muted/15 border border-border/30 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-primary" /> Active Broadcast Status
                </p>
                <p className="font-mono text-[11px]">
                  Current Video ID: <span className="text-primary font-bold">{youtubeVideoId}</span>
                </p>
                <p className="text-[11px]">
                  Stream auto-migration is enabled for all users. If YouTube rotates a live broadcast, updating the default station here instantly applies to the Music Popup.
                </p>
              </div>
            </div>

            {/* Test Player Embed */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Live Preview Player</span>
                <span className="text-[10px] text-muted-foreground font-normal">Click play to test audio</span>
              </Label>
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black/50 border border-border/40 shadow-inner">
                <iframe
                  src={`https://www.youtube.com/embed/${testYoutubeId}?autoplay=0&rel=0&modestbranding=1`}
                  className="absolute inset-0 w-full h-full"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  title="Admin YouTube Preview"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Button onClick={handleSave} disabled={updating} className="flex-1 noir-send-btn">
          {updating ? "Saving..." : "Save All Animation & Motion Settings"}
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
