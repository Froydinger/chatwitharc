import { motion, AnimatePresence } from "framer-motion";
import { X, Mic, MicOff, Loader2, Search, Camera, CameraOff, Paperclip, SwitchCamera, Check, RotateCw } from "lucide-react";
import { WeatherCard } from "@/components/WeatherCard";
import { useVoiceModeStore, VoiceName } from "@/store/useVoiceModeStore";
import { useCallback, useRef, useState } from "react";
import { VOICES, REALTIME_VOICES, VOICE_AVATARS } from "@/constants/voices";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { UsageMeter } from "@/components/UsageMeter";
import { ThinkingOrb } from "thinking-orbs";
import { useResolvedOrbTheme } from "@/components/ThinkingIndicator";
import { useVoiceOrbConfig, useThinkingOrbConfig, type VoicePhase } from "@/hooks/useThinkingOrbConfig";

// Global ref to allow interrupt from overlay - set by VoiceModeController
let globalInterruptHandler: (() => void) | null = null;
// Global ref for mute-handoff (commit audio and get response when user mutes after speaking)
let globalMuteHandoffHandler: (() => boolean) | null = null;
// Global ref for camera video element - set by VoiceModeController
let globalVideoRef: React.RefObject<HTMLVideoElement> | null = null;
// Global ref for camera switch handler
let globalSwitchCameraHandler: (() => void) | null = null;
// Global ref for voice switch handler (save, deactivate, switch, reactivate)
let globalVoiceSwitchHandler: ((voiceId: VoiceName) => Promise<void>) | null = null;
// Global ref for reconnect handler - set by VoiceModeController
let globalReconnectHandler: (() => void | Promise<void>) | null = null;

export function setGlobalInterruptHandler(handler: (() => void) | null) {
  globalInterruptHandler = handler;
}

export function setGlobalMuteHandoffHandler(handler: (() => boolean) | null) {
  globalMuteHandoffHandler = handler;
}

export function setGlobalVideoRef(ref: React.RefObject<HTMLVideoElement> | null) {
  globalVideoRef = ref;
}

export function setGlobalSwitchCameraHandler(handler: (() => void) | null) {
  globalSwitchCameraHandler = handler;
}

export function setGlobalVoiceSwitchHandler(handler: ((voiceId: VoiceName) => Promise<void>) | null) {
  globalVoiceSwitchHandler = handler;
}

export function setGlobalReconnectHandler(handler: (() => void | Promise<void>) | null) {
  globalReconnectHandler = handler;
}

export function VoiceModeOverlay() {
  const {
    isActive,
    status,
    inputAmplitude,
    outputAmplitude,
    isMuted,
    deactivateVoiceMode,
    toggleMute,
    generatedImage,
    isGeneratingImage,
    setGeneratedImage,
    isSearching,
    isSearchingPastChats,
    searchSummary,
    setSearchSummary,
    isFetchingWeather,
    weatherData,
    setWeatherData,
    isSchedulingTask,
    selectedVoice,
    // Camera state
    isCameraActive,
    activateCamera,
    deactivateCamera,
    cameraFacingMode,
    // Attachment state
    attachedImage,
    attachedImagePreview,
    clearAttachment,
    setAttachedImage,
  } = useVoiceModeStore();

  const { toast } = useToast();
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [pendingVoiceSwitch, setPendingVoiceSwitch] = useState<VoiceName | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  // File input ref for attachments
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle mute toggle with handoff logic
  const handleMuteToggle = useCallback(() => {
    const wasUnmuted = !isMuted;
    toggleMute();
    
    if (wasUnmuted && globalMuteHandoffHandler) {
      setTimeout(() => {
        const didHandoff = globalMuteHandoffHandler?.();
        if (didHandoff) {
          console.log('Mute triggered handoff to AI');
          if (navigator.vibrate) {
            navigator.vibrate([30, 50, 30]);
          }
        }
      }, 50);
    }
  }, [isMuted, toggleMute]);

  // Handle camera toggle — pre-check permissions on all platforms (Mac, Arc, PWA)
  const handleCameraToggle = useCallback(async () => {
    if (isCameraActive) {
      deactivateCamera();
      if (navigator.vibrate) navigator.vibrate(30);
      return;
    }

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        if (navigator.permissions) {
          const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
          if (permissionStatus.state === 'denied') {
            toast({
              title: "Camera access blocked",
              description: "Please allow camera access in your browser settings (and macOS System Settings > Privacy & Security > Camera), then try again.",
              variant: "destructive",
            });
            return;
          }
          if (permissionStatus.state === 'prompt') {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            stream.getTracks().forEach(track => track.stop());
          }
        } else {
          // Permissions API not available — trigger dialog directly
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          stream.getTracks().forEach(track => track.stop());
        }
      } catch (err: any) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          toast({
            title: "Camera access denied",
            description: "To use the camera, allow camera access in your browser settings. On Mac, also check System Settings > Privacy & Security > Camera.",
            variant: "destructive",
          });
        } else if (err.name === 'NotFoundError') {
          toast({
            title: "No camera found",
            description: "Please connect a camera and try again.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Camera error",
            description: "Could not access camera. Please check your settings and try again.",
            variant: "destructive",
          });
        }
        return;
      }
    }

    activateCamera();
    if (navigator.vibrate) navigator.vibrate(30);
  }, [isCameraActive, activateCamera, deactivateCamera, toast]);

  // Handle camera switch (front/back)
  const handleCameraSwitch = useCallback(() => {
    if (globalSwitchCameraHandler) {
      globalSwitchCameraHandler();
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }
    }
  }, []);

  const handleReconnect = useCallback(() => {
    if (globalReconnectHandler) {
      console.log('Manual voice reconnect requested');
      if (navigator.vibrate) navigator.vibrate(35);
      globalReconnectHandler();
    }
  }, []);

  // Handle attachment button click
  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle file selection
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      console.error('Invalid file type:', file.type);
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setAttachedImage(base64, previewUrl, file.type || 'image/jpeg');
      console.log('Image attached:', file.name, file.type);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [setAttachedImage]);

  // Handle voice switch confirmation
  const handleConfirmVoiceSwitch = useCallback(async () => {
    if (!pendingVoiceSwitch || isSwitching) return;
    
    setIsSwitching(true);
    setVoicePickerOpen(false);
    
    if (globalVoiceSwitchHandler) {
      await globalVoiceSwitchHandler(pendingVoiceSwitch);
    }
    
    setPendingVoiceSwitch(null);
    setIsSwitching(false);
  }, [pendingVoiceSwitch, isSwitching]);

  const handleCancelVoiceSwitch = useCallback(() => {
    setPendingVoiceSwitch(null);
  }, []);

  const voiceOrbConfig = useVoiceOrbConfig();
  const orbTheme = useResolvedOrbTheme();

  if (!isActive) return null;

  const amplitude = status === 'speaking' ? outputAmplitude : (isMuted ? 0 : inputAmplitude);

  const getStatusText = () => {
    if (isSwitching) return 'Switching voice...';
    if (isSearchingPastChats) return 'Checking past chats...';
    if (isSearching) return 'Searching the web...';
    if (isGeneratingImage) return 'Generating image...';
    if (isSchedulingTask) return 'Setting reminder...';
    if (isMuted) return 'Muted';
    switch (status) {
      case 'connecting': return 'Connecting...';
      case 'listening': return 'Listening...';
      case 'thinking': return 'Thinking...';
      case 'speaking': return 'Speaking...';
      default: return 'Tap to speak';
    }
  };
  
  const isLoading = isGeneratingImage || isSearching || isSearchingPastChats || isFetchingWeather || isSchedulingTask;

  const thinkingOrbConfig = useThinkingOrbConfig();
  const voiceOrbState = (isSearching || isSearchingPastChats)
    ? (thinkingOrbConfig.web ?? 'searching')
    : (isGeneratingImage)
    ? (thinkingOrbConfig.image ?? 'working')
    : (voiceOrbConfig[status as VoicePhase] ?? voiceOrbConfig.listening);

  // Controlled orb speed multiplier — prevents frantic, overly fast rotation while speaking
  const orbSpeed = status === 'speaking'
    ? 0.35 + Math.min(1, amplitude * 0.8) * 0.25
    : 0.4 + Math.min(1, amplitude * 1.0) * 0.3;

  const pendingVoiceInfo = pendingVoiceSwitch 
    ? REALTIME_VOICES.find(v => v.id === pendingVoiceSwitch) 
    : null;

  return (
    <AnimatePresence>
      {isActive && (
        <div className="fixed inset-x-0 bottom-0 z-[100] pointer-events-none px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          <div className="mx-auto w-[min(760px,calc(100vw-1.5rem))] pointer-events-auto flex flex-col items-center">
            {/* Floating previews & rich cards above voice bar */}
            <div className="w-full mb-2 flex flex-col items-center gap-2">
              {/* Camera Preview */}
              <AnimatePresence>
                {isCameraActive && (
                  <motion.div
                    initial={{ opacity: 0, y: 12, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 12, scale: 0.96 }}
                    className="flex justify-end w-full max-w-xs"
                  >
                    <div className="relative w-40 overflow-hidden rounded-2xl border border-primary/30 bg-background/85 shadow-xl backdrop-blur-xl">
                      <video
                        ref={(el) => {
                          if (globalVideoRef && el) {
                            // @ts-ignore - connected through controller
                            globalVideoRef.current = el;
                          }
                        }}
                        autoPlay
                        playsInline
                        muted
                        className="aspect-[4/3] w-full object-cover"
                        style={{ transform: cameraFacingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                      />
                      <button
                        onClick={handleCameraSwitch}
                        className="absolute bottom-1.5 right-1.5 rounded-full bg-background/85 p-1.5 shadow-sm"
                        aria-label="Switch camera"
                      >
                        <SwitchCamera className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Attached Image Preview */}
              <AnimatePresence>
                {attachedImagePreview && !isCameraActive && (
                  <motion.div
                    initial={{ opacity: 0, y: 12, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 12, scale: 0.96 }}
                    className="flex justify-end w-full max-w-xs"
                  >
                    <div className="relative max-w-40 rounded-2xl border border-primary/30 bg-background/85 p-1 shadow-xl backdrop-blur-xl">
                      <img src={attachedImagePreview} alt="Attached" className="max-h-28 rounded-xl object-contain" />
                      <button
                        onClick={clearAttachment}
                        className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-background p-1 shadow-sm"
                        aria-label="Remove attachment"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Search Summary Card */}
              <AnimatePresence>
                {(isSearching || searchSummary) && !generatedImage && !isGeneratingImage && !weatherData && !isFetchingWeather && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 12 }}
                    className="w-full max-w-[340px]"
                  >
                    <div className="relative rounded-2xl border border-primary/20 bg-background/85 p-4 shadow-xl backdrop-blur-xl">
                      {searchSummary && !isSearching ? (
                        <>
                          <button
                            onClick={() => setSearchSummary(null)}
                            className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted"
                            aria-label="Close search"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <div className="flex items-center gap-2 mb-1.5 text-xs text-primary font-medium">
                            <Search className="w-3.5 h-3.5" />
                            <span>Web Search</span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-3">{searchSummary.summary}</p>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                          <span>Searching the web...</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Weather Card */}
              <AnimatePresence>
                {(isFetchingWeather || weatherData) && !generatedImage && !isGeneratingImage && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 12 }}
                    className="w-full max-w-[320px]"
                  >
                    {weatherData ? (
                      <WeatherCard weather={weatherData} onClose={() => setWeatherData(null)} />
                    ) : (
                      <div className="rounded-2xl border border-primary/20 bg-background/85 p-3 flex items-center gap-2 text-xs text-muted-foreground shadow-xl backdrop-blur-xl">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                        <span>Checking weather...</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Generated Image Display */}
              <AnimatePresence>
                {(generatedImage || isGeneratingImage) && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 12 }}
                    className="w-full max-w-[220px]"
                  >
                    {isGeneratingImage ? (
                      <div className="rounded-2xl border border-primary/20 bg-background/85 p-4 flex flex-col items-center gap-2 shadow-xl backdrop-blur-xl">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        <span className="text-xs text-muted-foreground">Generating image...</span>
                      </div>
                    ) : generatedImage ? (
                      <div className="relative rounded-2xl overflow-hidden border border-primary/30 bg-background/85 p-1 shadow-xl backdrop-blur-xl">
                        <img src={generatedImage} alt="Generated" className="max-h-48 rounded-xl object-contain w-full" />
                        <button
                          onClick={() => setGeneratedImage(null)}
                          className="absolute top-2 right-2 p-1 rounded-full bg-background/80 border border-border shadow-sm"
                          aria-label="Dismiss image"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : null}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Redesigned Voice Bar */}
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              className="relative w-full overflow-hidden rounded-[2rem] border border-primary/25 bg-background/90 px-3 py-2 shadow-2xl backdrop-blur-2xl"
              style={{
                boxShadow: `0 0 0 1px hsl(var(--primary) / ${0.12 + Math.min(1, amplitude * 1.2) * 0.25}), 0 18px 48px hsl(0 0% 0% / 0.55)`,
              }}
            >
              {/* Level sheen sweeping the pill */}
              <div
                className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-300"
                style={{
                  opacity: status === 'speaking' ? 0.4 : status === 'listening' ? 0.25 : 0.1,
                  background:
                    'linear-gradient(115deg, hsl(var(--primary) / 0.16), transparent 45%, hsl(var(--primary) / 0.1))',
                }}
                aria-hidden="true"
              />

              <div className="flex items-center gap-2.5 sm:gap-3">
                {/* Mute Toggle */}
                <button
                  onClick={handleMuteToggle}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
                    isMuted ? 'bg-destructive/15 text-destructive hover:bg-destructive/25' : 'bg-muted/70 text-foreground hover:bg-muted'
                  }`}
                  aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
                >
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>

                {/* Orb & Status Block */}
                <div className="flex flex-1 items-center gap-3 min-w-0 py-0.5">
                  <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
                    <ThinkingOrb
                      state={voiceOrbState}
                      size={64}
                      speed={orbSpeed}
                      theme={orbTheme}
                      paused={isMuted && status === 'listening'}
                      aria-label={`Arc is ${status}`}
                      style={{ width: 44, height: 44 }}
                    />
                    <div
                      className="absolute inset-0 -z-10 rounded-full bg-primary/25 blur-md transition-opacity duration-200"
                      style={{ opacity: 0.3 + Math.min(1, amplitude * 1.2) * 0.7 }}
                      aria-hidden="true"
                    />
                  </div>

                  <div className="flex flex-col justify-center min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold tracking-wide text-foreground select-none">
                        {getStatusText()}
                      </span>
                      {isLoading || status === 'connecting' ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                      ) : status === 'speaking' ? (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse shadow-[0_0_8px_hsl(var(--primary)/0.8)]" />
                      ) : (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary/70 shadow-[0_0_6px_hsl(var(--primary)/0.5)]" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Controls Group */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="hidden shrink-0 sm:block mr-1">
                    <UsageMeter kind="voice" />
                  </div>

                  <button
                    onClick={handleAttachClick}
                    disabled={!!attachedImage}
                    className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors xs:flex ${
                      attachedImage ? 'bg-primary/15 text-primary' : 'bg-muted/60 text-foreground hover:bg-muted'
                    }`}
                    aria-label="Attach image"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>

                  <button
                    onClick={handleCameraToggle}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
                      isCameraActive ? 'bg-primary/15 text-primary' : 'bg-muted/60 text-foreground hover:bg-muted'
                    }`}
                    aria-label={isCameraActive ? "Turn off camera" : "Turn on camera"}
                  >
                    {isCameraActive ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                  </button>

                  <button
                    onClick={handleReconnect}
                    className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/60 text-foreground transition-colors hover:bg-muted sm:flex"
                    aria-label="Reconnect voice mode"
                  >
                    <RotateCw className={`h-4 w-4 ${status === 'connecting' ? 'animate-spin' : ''}`} />
                  </button>

                  <Popover open={voicePickerOpen} onOpenChange={(open) => {
                    setVoicePickerOpen(open);
                    if (!open) setPendingVoiceSwitch(null);
                  }}>
                    <PopoverTrigger asChild>
                      <button
                        disabled={isSwitching}
                        className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-primary/40 bg-black shadow-sm transition-transform hover:scale-105"
                        aria-label="Switch voice"
                      >
                        <img
                          src={VOICE_AVATARS[selectedVoice]}
                          alt={VOICES.find(v => v.id === selectedVoice)?.name || 'Voice'}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="top"
                      align="center"
                      sideOffset={12}
                      className="z-[110] w-[min(360px,calc(100vw-1.5rem))] rounded-2xl border border-primary/20 bg-background/95 p-4 shadow-2xl backdrop-blur-2xl"
                    >
                      {pendingVoiceSwitch && pendingVoiceInfo ? (
                        <div className="flex flex-col items-center gap-4 py-2">
                          <div className="h-16 w-16 overflow-hidden rounded-full bg-black shadow-[0_0_12px_4px_hsl(var(--primary)/0.5)]">
                            <img src={VOICE_AVATARS[pendingVoiceSwitch]} alt={pendingVoiceInfo.name} className="h-full w-full object-cover" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-medium">Switch to {pendingVoiceInfo.name}?</p>
                            <p className="mt-1 text-xs text-muted-foreground">This saves the current voice turns and reconnects.</p>
                          </div>
                          <div className="flex w-full gap-3">
                            <button onClick={handleCancelVoiceSwitch} className="flex-1 rounded-xl bg-muted/50 px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">
                              Cancel
                            </button>
                            <button onClick={handleConfirmVoiceSwitch} className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                              Switch
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="mb-3 text-xs font-medium text-muted-foreground">Switch voice</p>
                          <div className="flex max-h-[340px] flex-col gap-1.5 overflow-y-auto pr-1">
                            {REALTIME_VOICES.map((voice) => {
                              const isSelected = selectedVoice === voice.id;
                              return (
                                <button
                                  key={voice.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (voice.id !== selectedVoice) setPendingVoiceSwitch(voice.id);
                                  }}
                                  className={`flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-all ${
                                    isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
                                  }`}
                                >
                                  <div className={`h-10 w-10 shrink-0 overflow-hidden rounded-full bg-black ${
                                    isSelected ? 'shadow-[0_0_12px_4px_hsl(var(--primary)/0.5)]' : ''
                                  }`}>
                                    <img src={VOICE_AVATARS[voice.id]} alt={voice.name} className="h-full w-full object-cover" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="text-sm font-medium">{voice.name}</span>
                                    <p className="truncate text-[11px] text-muted-foreground">{voice.description}</p>
                                  </div>
                                  {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </PopoverContent>
                  </Popover>

                  {/* Close button */}
                  <button
                    onClick={deactivateVoiceMode}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/60 text-foreground transition-colors hover:bg-muted"
                    aria-label="Close voice mode"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
