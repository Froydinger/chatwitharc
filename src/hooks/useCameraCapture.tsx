import { useRef, useCallback, useState, useEffect } from 'react';
import { useVoiceModeStore } from '@/store/useVoiceModeStore';

interface UseCameraCaptureOptions {
  onFrame?: (base64Image: string) => void;
  frameRate?: number; // Frames per second (default: 2)
  maxSize?: number; // Max dimension in pixels (default: 512)
  quality?: number; // JPEG quality 0-1 (default: 0.7)
}

export function useCameraCapture(options: UseCameraCaptureOptions = {}) {
  const { 
    onFrame,
    frameRate = 2, 
    maxSize = 512, 
    quality = 0.7 
  } = options;
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureIntervalRef = useRef<number | null>(null);
  const lastFrameRef = useRef<string | null>(null);
  
  const [isCapturing, setIsCapturing] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const { cameraFacingMode, isCameraActive, deactivateCamera } = useVoiceModeStore();

  // Create canvas for frame capture
  useEffect(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    return () => {
      canvasRef.current = null;
    };
  }, []);

  // Resize image to max dimension while preserving aspect ratio
  const resizeAndCapture = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas || video.readyState < 2) return null;
    
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    
    if (vw === 0 || vh === 0) return null;
    
    // Calculate scaled dimensions
    let width = vw;
    let height = vh;
    
    if (width > height) {
      if (width > maxSize) {
        height = Math.round((height * maxSize) / width);
        width = maxSize;
      }
    } else {
      if (height > maxSize) {
        width = Math.round((width * maxSize) / height);
        height = maxSize;
      }
    }
    
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    ctx.drawImage(video, 0, 0, width, height);
    
    // Convert to base64 JPEG
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    // Remove the data:image/jpeg;base64, prefix
    const base64 = dataUrl.split(',')[1];
    
    return base64;
  }, [maxSize, quality]);

  // Check if frame has changed significantly (basic motion detection)
  const hasFrameChanged = useCallback((newFrame: string): boolean => {
    if (!lastFrameRef.current) return true;
    
    // Simple check: if frame size changed significantly, it's different
    // A more sophisticated approach would compare actual pixel data
    const sizeDiff = Math.abs(newFrame.length - lastFrameRef.current.length);
    const threshold = lastFrameRef.current.length * 0.05; // 5% size change
    
    return sizeDiff > threshold;
  }, []);

  const startCapture = useCallback(async () => {
    try {
      setError(null);
      
      // Detect iOS for specific video constraints
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      
      // Request camera permission with platform-optimized settings
      const videoConstraints: MediaTrackConstraints = {
        facingMode: { ideal: cameraFacingMode },
        width: { ideal: 640 },
        height: { ideal: 480 }
      };
      
      console.log(`Starting camera capture (iOS: ${isIOS}, facing: ${cameraFacingMode})`);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });
      
      streamRef.current = stream;
      setHasPermission(true);
      
      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      // Start frame capture interval
      const intervalMs = Math.round(1000 / frameRate);
      captureIntervalRef.current = window.setInterval(() => {
        // Check voice mode state - don't send frames when muted, speaking, or generating
        const { isMuted, status, isGeneratingImage, isSearching, isAudioPlaying } = useVoiceModeStore.getState();
        
        // Only capture frames when actively listening and not busy
        const shouldCapture = 
          !isMuted && 
          status === 'listening' && 
          !isGeneratingImage && 
          !isSearching && 
          !isAudioPlaying;
        
        if (!shouldCapture) return;
        
        const frame = resizeAndCapture();
        if (frame && hasFrameChanged(frame)) {
          lastFrameRef.current = frame;
          onFrame?.(frame);
        }
      }, intervalMs);
      
      setIsCapturing(true);
      console.log('Camera capture started');
      
    } catch (err: any) {
      console.error('Failed to start camera capture:', err);
      setHasPermission(false);
      setError(err.message || 'Failed to access camera');
      deactivateCamera();
      throw err;
    }
  }, [cameraFacingMode, frameRate, resizeAndCapture, hasFrameChanged, onFrame, deactivateCamera]);

  const stopCapture = useCallback(() => {
    // Stop interval
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    
    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Clear video source
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    lastFrameRef.current = null;
    setIsCapturing(false);
    console.log('Camera capture stopped');
  }, []);

  // Capture a single frame immediately (for attachments or manual capture)
  const captureFrame = useCallback((): string | null => {
    return resizeAndCapture();
  }, [resizeAndCapture]);

  // Switch camera (front/back)
  const switchCamera = useCallback(async () => {
    // Stop current stream
    stopCapture();
    
    // Toggle facing mode in store
    useVoiceModeStore.getState().toggleCameraFacing();
    
    // Small delay then restart
    await new Promise(resolve => setTimeout(resolve, 100));
    await startCapture();
  }, [stopCapture, startCapture]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCapture();
    };
  }, [stopCapture]);

  // Auto-start/stop based on isCameraActive
  useEffect(() => {
    if (isCameraActive && !isCapturing) {
      startCapture().catch(console.error);
    } else if (!isCameraActive && isCapturing) {
      stopCapture();
    }
  }, [isCameraActive, isCapturing, startCapture, stopCapture]);

  return {
    videoRef,
    isCapturing,
    hasPermission,
    error,
    startCapture,
    stopCapture,
    captureFrame,
    switchCamera
  };
}
