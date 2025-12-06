import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { HandPosition } from '../types';

interface VideoInputProps {
  onHandUpdate: (pos: HandPosition) => void;
  selectedDeviceId: string;
  isScanning: boolean;
  onScanCapture: (imageSrc: string) => void;
  minHandDetectionConfidence?: number;
  minHandPresenceConfidence?: number;
  minTrackingConfidence?: number;
}

// Linear Interpolation Helper
const lerp = (start: number, end: number, factor: number) => {
  return start + (end - start) * factor;
};

// --- Adaptive Smoothing Constants ---
const MIN_ALPHA = 0.15; // Very smooth when still (reduces jitter)
const MAX_ALPHA = 0.60; // Responsive when moving (reduces lag)
const VELOCITY_THRESHOLD = 0.8; // Distance delta to trigger max alpha

const VideoInput: React.FC<VideoInputProps> = ({ 
  onHandUpdate, 
  selectedDeviceId, 
  isScanning, 
  onScanCapture,
  minHandDetectionConfidence = 0.5,
  minHandPresenceConfidence = 0.5,
  minTrackingConfidence = 0.5
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  
  // Store previous position for interpolation
  const prevHandRef = useRef<{
    x: number;
    y: number;
    z: number;
    landmarks: {x: number, y: number, z: number}[];
  } | null>(null);

  // Initialize MediaPipe
  useEffect(() => {
    const initMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence,
          minHandPresenceConfidence,
          minTrackingConfidence
        });
        setLoaded(true);
      } catch (error) {
        console.error("Failed to initialize MediaPipe:", error);
      }
    };
    initMediaPipe();
  }, [minHandDetectionConfidence, minHandPresenceConfidence, minTrackingConfidence]);

  // Initialize Camera with robust cleanup
  useEffect(() => {
    let active = true;
    let currentStream: MediaStream | null = null;

    const startCamera = async () => {
      if (!videoRef.current) return;
      
      if (videoRef.current.srcObject) {
        const oldStream = videoRef.current.srcObject as MediaStream;
        oldStream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }

      try {
        const constraints = {
          video: {
            deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 60, max: 60 }
          }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (!active) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        currentStream = stream;
        
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => {
                if (videoRef.current) videoRef.current.play().catch(console.error);
            };
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    };

    startCamera();

    return () => {
      active = false;
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [selectedDeviceId]);

  // Detection Loop
  const predict = useCallback(() => {
    if (videoRef.current && videoRef.current.readyState >= 2 && handLandmarkerRef.current) {
      if (videoRef.current.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = videoRef.current.currentTime;
          
          const results = handLandmarkerRef.current.detectForVideo(videoRef.current, performance.now());

          if (results.landmarks.length > 0) {
            const rawLandmarks = results.landmarks[0];
            
            // --- Global Depth Calculation ---
            // Distance between Wrist (0) and Middle Knuckle (9) used for scaling
            const dx = rawLandmarks[0].x - rawLandmarks[9].x;
            const dy = rawLandmarks[0].y - rawLandmarks[9].y;
            const handSize = Math.sqrt(dx*dx + dy*dy);
            
            // INCREASED Z-SENSITIVITY:
            const globalZ = (handSize - 0.12) * 35; 
            const clampedZ = Math.max(-10, Math.min(5, globalZ));

            // --- Map Landmarks to 3D World Space (Target Values) ---
            const targetLandmarks = rawLandmarks.map((lm) => ({
                x: (1 - lm.x) * 16 - 8,
                y: (1 - lm.y) * 10 - 5,
                z: clampedZ + (lm.z * 10) 
            }));

            // --- Physics Interaction Point (Target Values) ---
            const thumbTip = targetLandmarks[4];
            const indexTip = targetLandmarks[8];
            
            const targetCenterX = (thumbTip.x + indexTip.x) / 2;
            const targetCenterY = (thumbTip.y + indexTip.y) / 2;
            const targetCenterZ = (thumbTip.z + indexTip.z) / 2;

            // --- Adaptive Smoothing / Interpolation ---
            let finalX = targetCenterX;
            let finalY = targetCenterY;
            let finalZ = targetCenterZ;
            let finalLandmarks = targetLandmarks;

            if (prevHandRef.current) {
                // Calculate distance from last frame (proxy for speed)
                const dist = Math.sqrt(
                    Math.pow(targetCenterX - prevHandRef.current.x, 2) +
                    Math.pow(targetCenterY - prevHandRef.current.y, 2) +
                    Math.pow(targetCenterZ - prevHandRef.current.z, 2)
                );

                // Calculate dynamic alpha:
                // Low alpha when still (smooths jitter)
                // High alpha when moving (reduces lag)
                let alpha = MIN_ALPHA;
                if (dist > VELOCITY_THRESHOLD) {
                    alpha = MAX_ALPHA;
                } else {
                    // Linear interpolation between MIN and MAX based on speed
                    alpha = MIN_ALPHA + (dist / VELOCITY_THRESHOLD) * (MAX_ALPHA - MIN_ALPHA);
                }
                
                finalX = lerp(prevHandRef.current.x, targetCenterX, alpha);
                finalY = lerp(prevHandRef.current.y, targetCenterY, alpha);
                finalZ = lerp(prevHandRef.current.z, targetCenterZ, alpha);
                
                finalLandmarks = targetLandmarks.map((lm, i) => ({
                    x: lerp(prevHandRef.current!.landmarks[i].x, lm.x, alpha),
                    y: lerp(prevHandRef.current!.landmarks[i].y, lm.y, alpha),
                    z: lerp(prevHandRef.current!.landmarks[i].z, lm.z, alpha),
                }));
            }

            // Update Previous Ref
            prevHandRef.current = {
                x: finalX,
                y: finalY,
                z: finalZ,
                landmarks: finalLandmarks
            };

            // --- Pinch Detection ---
            // Use smoothed values for pinch calculation to prevent jittery grabbing
            const sThumb = finalLandmarks[4];
            const sIndex = finalLandmarks[8];

            const pinchDist = Math.sqrt(
                Math.pow(sThumb.x - sIndex.x, 2) + 
                Math.pow(sThumb.y - sIndex.y, 2) + 
                Math.pow(sThumb.z - sIndex.z, 2)
            );
            
            const isPinching = pinchDist < 1.0; 

            onHandUpdate({ 
                x: finalX, 
                y: finalY, 
                z: finalZ, 
                active: true, 
                isPinching,
                landmarks: finalLandmarks 
            });
          } else {
            // Reset smoothing if hand is lost so it doesn't "fly" in next time
            prevHandRef.current = null;
            onHandUpdate({ x: 0, y: 0, z: 0, active: false, isPinching: false, landmarks: [] });
          }
      }
    }
    requestRef.current = requestAnimationFrame(predict);
  }, [onHandUpdate]);

  useEffect(() => {
    if (loaded) {
      requestRef.current = requestAnimationFrame(predict);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [loaded, predict]);

  // Handle Scanning Capture
  useEffect(() => {
    if (isScanning && videoRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current, 0, 0);
        const imageSrc = canvas.toDataURL("image/jpeg");
        onScanCapture(imageSrc);
      }
    }
  }, [isScanning, onScanCapture]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden shadow-2xl border border-white/20 bg-black">
      <video
        ref={videoRef}
        className="w-full h-full object-cover transform scale-x-[-1]"
        muted
        playsInline
      />
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white backdrop-blur-sm z-20">
          <div className="flex flex-col items-center gap-2">
             <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
             <span className="text-xs tracking-widest uppercase">Initializing AI</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoInput;