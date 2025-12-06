import React, { useState, useEffect } from 'react';
import Scene from './components/Scene';
import VideoInput from './components/VideoInput';
import { analyzeImageForObject } from './services/geminiService';
import { HandPosition, SpawnedObject } from './types';
import { v4 as uuidv4 } from 'uuid';

// LIBRARY MAPPING: Official Khronos Group Samples (High Reliability)
const MODEL_LIBRARY: Record<string, string> = {
  // --- DIRECT MATCHES (JPO & CLASSROOM ITEMS) ---
  'DUCK': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb',
  'BOX': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Box/glTF-Binary/Box.glb',
  'AVOCADO': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb',
  'BOOMBOX': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/BoomBox/glTF-Binary/BoomBox.glb',
  'CHAIR': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/SheenChair/glTF-Binary/SheenChair.glb',
  'LANTERN': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Lantern/glTF-Binary/Lantern.glb',
  'HELMET': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb',
  'SHOE': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/MaterialsVariantsShoe/glTF-Binary/MaterialsVariantsShoe.glb',
  'WATER_BOTTLE': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/WaterBottle/glTF-Binary/WaterBottle.glb',
  'GEARBOX': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/GearboxAssy/glTF-Binary/GearboxAssy.glb',
  'ROVER': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Buggy/glTF-Binary/Buggy.glb',
  'VINTAGE_CAMERA': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/AntiqueCamera/glTF-Binary/AntiqueCamera.glb',
  'FOX_MASCOT': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Fox/glTF-Binary/Fox.glb',
  'CORSET': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Corset/glTF-Binary/Corset.glb',

  // --- INTELLIGENT PROXIES ---
  'APPLE': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb', 
  'BANANA': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb', 
  'BURGER': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Avocado/glTF-Binary/Avocado.glb', 
  'HEADPHONES': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/BoomBox/glTF-Binary/BoomBox.glb', 
  'GAME_CONSOLE': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/BoomBox/glTF-Binary/BoomBox.glb', 
  'CAMERA': 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/AntiqueCamera/glTF-Binary/AntiqueCamera.glb',
  
  // NOTE: PHONE and LAPTOP are removed from here to fallback to Procedural Primitives (Sleek Boxes) 
  // instead of loading a broken or missing GLB file.
};

// UPSCALED DIMENSIONS for easier grabbing
const CATEGORY_DIMENSIONS: Record<string, [number, number, number]> = {
  'DUCK': [0.5, 0.5, 0.5],
  'BOX': [0.8, 0.8, 0.8],
  'AVOCADO': [0.3, 0.4, 0.3],
  'BOOMBOX': [0.8, 0.5, 0.4],
  'CHAIR': [1.2, 2.0, 1.2],
  'LANTERN': [0.4, 0.9, 0.4],
  'HELMET': [0.6, 0.7, 0.6],
  'SHOE': [0.6, 0.3, 0.25],
  'WATER_BOTTLE': [0.15, 0.45, 0.15],
  'GEARBOX': [0.5, 0.5, 0.3], // Engineering part
  'ROVER': [1.0, 0.6, 1.0], // Robotics demo
  'VINTAGE_CAMERA': [0.4, 0.6, 0.4], // Arts demo
  'FOX_MASCOT': [0.4, 0.6, 1.0],
  'CORSET': [0.4, 0.8, 0.3],
  'APPLE': [0.25, 0.25, 0.25],
  'BANANA': [0.4, 0.1, 0.1],
  'BURGER': [0.35, 0.3, 0.35],
  'HEADPHONES': [0.5, 0.5, 0.3],
  'GAME_CONSOLE': [0.8, 0.25, 0.5],
  'CAMERA': [0.4, 0.3, 0.3],
  'PHONE': [0.09, 0.18, 0.015], // Sleek Smartphone Size
  'LAPTOP': [0.5, 0.03, 0.35], // Wide and flat Laptop
  'DEFAULT': [0.6, 0.6, 0.6]
};

// Keys to display in the Library UI (includes procedural items)
const LIBRARY_KEYS = [
    ...Object.keys(MODEL_LIBRARY),
    'PHONE',
    'LAPTOP'
].sort();

const getCategoryDimensions = (category?: string): [number, number, number] => {
  if (category && CATEGORY_DIMENSIONS[category]) return CATEGORY_DIMENSIONS[category];
  return CATEGORY_DIMENSIONS['DEFAULT'];
};

const App: React.FC = () => {
  const [handPos, setHandPos] = useState<HandPosition>({ x: 0, y: 0, z: 0, active: false, isPinching: false, landmarks: [] });
  
  const [objects, setObjects] = useState<SpawnedObject[]>([
    { 
        id: 'init-1', 
        type: 'custom_glb', 
        color: '#ffffff', 
        name: 'Rubber Duck', 
        position: [-1, 2, 0], 
        modelUrl: MODEL_LIBRARY['DUCK'],
        category: 'DUCK',
        dimensions: getCategoryDimensions('DUCK')
    },
    { 
      id: 'init-2', 
      type: 'box', 
      color: '#111111', 
      name: 'Smartphone', 
      position: [1, 2, 0], 
      category: 'PHONE',
      dimensions: getCategoryDimensions('PHONE')
    }
  ]);
  
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanTrigger, setScanTrigger] = useState(false);
  const [statusMsg, setStatusMsg] = useState("System Ready");
  
  // UI States
  const [showLibrary, setShowLibrary] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  // Global Scale State (Multiplier)
  const [globalScale, setGlobalScale] = useState(1.0);

  // Room Config
  const [roomConfig, setRoomConfig] = useState({
    bgColor: '#050505',
    roomSize: 10 // Controls the width of the invisible walls
  });

  // Tracking Sensitivity Config
  const [trackingConfig, setTrackingConfig] = useState({
    detection: 0.5,
    presence: 0.5,
    tracking: 0.5
  });

  // Secret Hotkey Listener (Shift + S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.shiftKey && e.key.toLowerCase() === 's') {
            setShowDebug(prev => !prev);
        }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const getCameras = async () => {
        try {
            await navigator.mediaDevices.getUserMedia({ video: true }); 
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videos = devices.filter(d => d.kind === 'videoinput');
            setVideoDevices(videos);
            if (videos.length > 0 && !selectedDeviceId) {
                const backCam = videos.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
                setSelectedDeviceId(backCam ? backCam.deviceId : videos[0].deviceId);
            }
        } catch (e) {
            console.error("Camera permission error", e);
        }
    };
    getCameras();
    navigator.mediaDevices.addEventListener('devicechange', getCameras);
    return () => navigator.mediaDevices.removeEventListener('devicechange', getCameras);
  }, []);

  const handleHandUpdate = (pos: HandPosition) => {
    setHandPos(pos);
  };

  const handleScanClick = () => {
    setScanTrigger(true);
    setStatusMsg("Capturing Visuals...");
  };

  const handleImageCaptured = async (imageSrc: string) => {
    setScanTrigger(false);
    setIsProcessing(true);
    setStatusMsg("Analyzing Molecular Structure...");
    
    try {
      const result = await analyzeImageForObject(imageSrc);
      
      const libraryUrl = result.category ? MODEL_LIBRARY[result.category] : undefined;
      const dims = (result.category && CATEGORY_DIMENSIONS[result.category]) 
                   ? CATEGORY_DIMENSIONS[result.category] 
                   : result.dimensions.map(d => d * 2) as [number, number, number]; // Double Gemini's guess for better playability

      const newObj: SpawnedObject = {
        id: uuidv4(),
        type: libraryUrl ? 'custom_glb' : (result.category === 'PHONE' || result.category === 'LAPTOP' ? 'box' : result.type),
        color: result.category === 'PHONE' ? '#111111' : (result.category === 'LAPTOP' ? '#C0C0C0' : result.color),
        name: result.name,
        position: [0, 5, 0],
        dimensions: dims,
        category: result.category,
        modelUrl: libraryUrl
      };
      
      setObjects(prev => [...prev, newObj]);
      setStatusMsg(`Materialized: ${result.name}`);
      setTimeout(() => setStatusMsg("System Ready"), 3000);
    } catch (e) {
      console.error(e);
      setStatusMsg("Analysis Failed");
      setTimeout(() => setStatusMsg("System Ready"), 2000);
    } finally {
      setIsProcessing(false);
    }
  };

  const spawnFromLibrary = (key: string) => {
      const url = MODEL_LIBRARY[key];
      const dims = getCategoryDimensions(key);
      
      let type: 'custom_glb' | 'box' = 'custom_glb';
      let color = '#ffffff';

      // Fallback for Procedural Items (No GLB)
      if (!url) {
          type = 'box';
          if (key === 'PHONE') color = '#111111'; // Black Phone
          if (key === 'LAPTOP') color = '#C0C0C0'; // Silver Laptop
      }

      const newObj: SpawnedObject = {
          id: uuidv4(),
          type: type,
          color: color,
          name: key.replace('_', ' '),
          position: [(Math.random() - 0.5) * 2, 5, (Math.random() - 0.5) * 2],
          modelUrl: url,
          category: key,
          dimensions: dims
      };
      setObjects(prev => [...prev, newObj]);
      setStatusMsg(`Spawned: ${key}`);
      setShowLibrary(false);
      setTimeout(() => setStatusMsg("System Ready"), 2000);
  };

  const clearObjects = () => {
    setObjects([]);
    setStatusMsg("Zone Cleared");
    setTimeout(() => setStatusMsg("System Ready"), 2000);
  };

  const removeObject = (id: string) => {
    setObjects(prev => prev.filter(o => o.id !== id));
  };

  return (
    <div className="relative w-screen h-screen bg-black font-sans text-white overflow-hidden select-none">
      
      <div className="absolute inset-0 z-0">
        <Scene 
            handPosition={handPos} 
            objects={objects} 
            onObjectDespawn={removeObject} 
            roomConfig={roomConfig}
            globalScale={globalScale}
        />
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none p-6 flex flex-col justify-between">
        
        {/* TOP LEFT: Video Feed */}
        <div className="pointer-events-auto flex flex-col gap-2 w-72 transition-all hover:scale-105 duration-300">
          <div className="relative aspect-video rounded-xl border-2 border-cyan-500/30 bg-black/80 overflow-hidden shadow-[0_0_20px_rgba(0,255,255,0.1)] group">
            <VideoInput 
              onHandUpdate={handleHandUpdate} 
              selectedDeviceId={selectedDeviceId} 
              isScanning={scanTrigger}
              onScanCapture={handleImageCaptured}
              minHandDetectionConfidence={trackingConfig.detection}
              minHandPresenceConfidence={trackingConfig.presence}
              minTrackingConfidence={trackingConfig.tracking}
            />
            
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3 w-3/4">
                     <div className="flex items-center gap-2 text-cyan-400 mb-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                           <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                        </svg>
                        <span className="text-xs font-bold tracking-widest uppercase">Input Source</span>
                     </div>
                     <select 
                      className="bg-gray-900 text-cyan-300 text-xs border border-cyan-500/50 rounded p-2 outline-none w-full shadow-inner"
                      value={selectedDeviceId}
                      onChange={(e) => setSelectedDeviceId(e.target.value)}
                    >
                      {videoDevices.map(device => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Camera ${device.deviceId.slice(0,5)}`}
                        </option>
                      ))}
                    </select>
                </div>
            </div>
            
            <div className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full group-hover:opacity-0 transition-opacity border border-white/10">
               <div className={`w-2 h-2 rounded-full ${handPos.active ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            </div>
          </div>
          
          <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-widest text-cyan-500/70 bg-black/40 p-2 rounded border border-white/5">
             <span>Z-Depth: {handPos.z.toFixed(2)}</span>
             <span>Status: {handPos.isPinching ? "GRABBING" : "OPEN"}</span>
          </div>
        </div>

        {/* CENTER: Status Message */}
        <div className="absolute top-8 left-1/2 transform -translate-x-1/2 pointer-events-none">
             {isProcessing && (
                 <div className="flex flex-col items-center gap-2 animate-pulse">
                    <span className="text-cyan-400 font-bold tracking-[0.3em] text-sm uppercase bg-black/90 px-6 py-2 rounded border border-cyan-500 shadow-[0_0_30px_rgba(6,182,212,0.4)]">
                        Analyzing Geometry
                    </span>
                 </div>
             )}
             {!isProcessing && statusMsg !== "System Ready" && (
                <div className="text-white text-xs tracking-[0.2em] uppercase bg-black/50 px-4 py-1 rounded backdrop-blur">
                   {statusMsg}
                </div>
             )}
        </div>

        {/* BOTTOM RIGHT: Controls */}
        <div className="pointer-events-auto flex flex-col items-end gap-4">
           
           {/* Settings Toggle */}
           <button 
             onClick={() => setShowSettings(!showSettings)}
             className="bg-black/50 p-3 rounded-full border border-white/20 hover:bg-white/20 text-white transition-all shadow-lg backdrop-blur-sm"
             title="Environment Settings"
           >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
           </button>

           <div className="bg-black/80 backdrop-blur-xl p-5 rounded-xl border border-white/10 flex flex-col gap-4 w-80 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 opacity-50"></div>
              
              <div className="flex justify-between items-center pb-2 border-b border-white/10">
                 <h2 className="text-xs font-bold text-gray-300 uppercase tracking-[0.2em]">
                    HoloDeck Controls
                 </h2>
                 <div className="w-2 h-2 bg-cyan-500 rounded-full shadow-[0_0_10px_#06b6d4]"></div>
              </div>
              
              <button 
                onClick={handleScanClick}
                disabled={isProcessing}
                className={`
                  relative w-full py-4 rounded-lg font-bold text-xs tracking-widest uppercase transition-all duration-300 overflow-hidden group
                  ${isProcessing 
                    ? 'bg-gray-800 text-gray-500 border border-gray-700' 
                    : 'bg-white text-black hover:bg-cyan-400 border border-white hover:border-cyan-400 shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)]'
                  }
                `}
              >
                <div className="relative z-10 flex items-center justify-center gap-2">
                    {isProcessing ? 'Processing...' : 'Scan Real Object'}
                    {!isProcessing && <span className="text-lg">⊕</span>}
                </div>
              </button>

              <button 
                onClick={() => setShowLibrary(true)}
                className="w-full py-3 bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/50 text-cyan-400 rounded-lg text-xs uppercase tracking-widest transition-all"
              >
                Open Object Library
              </button>

              <button 
                onClick={clearObjects}
                className="w-full py-2 rounded border border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white text-[10px] uppercase tracking-widest transition-all hover:shadow-[0_0_15px_rgba(239,68,68,0.5)]"
              >
                Purge Entities
              </button>
           </div>
        </div>
      </div>
      
      {/* SECRET DEBUG PANEL (Shift + S) */}
      {showDebug && (
         <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-50 pointer-events-auto bg-red-950/90 border border-red-500 p-4 rounded-lg shadow-[0_0_30px_rgba(220,38,38,0.5)] flex flex-col gap-2 w-64">
            <h3 className="text-red-300 text-xs font-bold uppercase tracking-widest text-center mb-1">Debug Scale Override</h3>
            <input 
               type="range" min="0.5" max="3.0" step="0.1" 
               value={globalScale}
               onChange={(e) => setGlobalScale(parseFloat(e.target.value))}
               className="w-full accent-red-500"
            />
            <div className="flex justify-between text-[10px] text-red-200 font-mono">
               <span>Multiplier</span>
               <span>{globalScale.toFixed(1)}x</span>
            </div>
         </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
           <div className="bg-gray-900 border border-white/20 p-6 rounded-xl w-80 shadow-2xl flex flex-col gap-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center border-b border-white/10 pb-2">
                  <h3 className="text-sm font-bold uppercase tracking-widest">Environment Config</h3>
                  <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">✕</button>
              </div>

              {/* Room Size Slider */}
              <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs text-cyan-400 font-mono">
                      <span>Room Constraint</span>
                      <span>{roomConfig.roomSize}m</span>
                  </div>
                  <input 
                    type="range" 
                    min="4" 
                    max="20" 
                    step="1"
                    value={roomConfig.roomSize} 
                    onChange={(e) => setRoomConfig({...roomConfig, roomSize: parseInt(e.target.value)})}
                    className="w-full accent-cyan-500"
                  />
                  <span className="text-[10px] text-gray-500">Reduce size to keep objects within reach.</span>
              </div>

              {/* Background Color Picker */}
              <div className="flex flex-col gap-2">
                 <span className="text-xs text-cyan-400 font-mono uppercase">Background Ambience</span>
                 <div className="flex gap-2">
                    {['#050505', '#1a1a2e', '#0f172a', '#222222', '#000000'].map(color => (
                        <button 
                          key={color}
                          onClick={() => setRoomConfig({...roomConfig, bgColor: color})}
                          className={`w-8 h-8 rounded-full border-2 ${roomConfig.bgColor === color ? 'border-cyan-400 scale-110' : 'border-white/20'}`}
                          style={{ backgroundColor: color }}
                        />
                    ))}
                 </div>
              </div>

              {/* Tracking Sensitivity Controls */}
              <div className="flex flex-col gap-3 pt-4 border-t border-white/10">
                 <h4 className="text-xs text-cyan-400 font-mono uppercase">Tracking Sensitivity</h4>
                 
                 <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                        <span>Detection Confidence</span>
                        <span>{trackingConfig.detection.toFixed(2)}</span>
                    </div>
                    <input 
                        type="range" min="0.1" max="1.0" step="0.05"
                        value={trackingConfig.detection}
                        onChange={(e) => setTrackingConfig({...trackingConfig, detection: parseFloat(e.target.value)})}
                        className="w-full accent-purple-500"
                    />
                 </div>

                 <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                        <span>Presence Confidence</span>
                        <span>{trackingConfig.presence.toFixed(2)}</span>
                    </div>
                    <input 
                        type="range" min="0.1" max="1.0" step="0.05"
                        value={trackingConfig.presence}
                        onChange={(e) => setTrackingConfig({...trackingConfig, presence: parseFloat(e.target.value)})}
                        className="w-full accent-purple-500"
                    />
                 </div>

                 <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                        <span>Tracking Confidence</span>
                        <span>{trackingConfig.tracking.toFixed(2)}</span>
                    </div>
                    <input 
                        type="range" min="0.1" max="1.0" step="0.05"
                        value={trackingConfig.tracking}
                        onChange={(e) => setTrackingConfig({...trackingConfig, tracking: parseFloat(e.target.value)})}
                        className="w-full accent-purple-500"
                    />
                 </div>
              </div>

              <div className="mt-2 text-[10px] text-gray-500 text-center">
                 Adjust constraints to bring objects closer to your hand.
              </div>
           </div>
        </div>
      )}

      {/* LIBRARY MODAL / SLIDER */}
      {showLibrary && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-10">
           <div className="w-full max-w-5xl bg-black border border-cyan-500/30 rounded-2xl p-6 shadow-[0_0_50px_rgba(0,255,255,0.1)] flex flex-col gap-4">
              <div className="flex justify-between items-center border-b border-white/10 pb-4">
                  <h2 className="text-xl font-bold text-white tracking-[0.2em] uppercase">Object Library</h2>
                  <button onClick={() => setShowLibrary(false)} className="text-gray-400 hover:text-white transition-colors text-2xl">×</button>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 overflow-y-auto max-h-[60vh] p-2">
                  {LIBRARY_KEYS.map((key) => (
                      <button 
                        key={key}
                        onClick={() => spawnFromLibrary(key)}
                        className="group relative aspect-square bg-gray-900 rounded-lg border border-white/5 hover:border-cyan-500 hover:bg-cyan-900/10 transition-all flex flex-col items-center justify-center gap-2 overflow-hidden"
                      >
                         <div className={`w-8 h-8 rounded-full ${MODEL_LIBRARY[key] ? 'bg-cyan-500/20 group-hover:bg-cyan-500' : 'bg-gray-500/20 group-hover:bg-gray-500'} group-hover:shadow-[0_0_15px_#06b6d4] transition-all`}></div>
                         <span className="text-[10px] font-mono text-gray-400 group-hover:text-white uppercase tracking-wider text-center px-1">
                             {key.replace('_', ' ')}
                         </span>
                         {!MODEL_LIBRARY[key] && <span className="absolute top-1 right-1 text-[8px] text-gray-600">PROC</span>}
                      </button>
                  ))}
              </div>
              
              <div className="text-center text-xs text-gray-500 pt-2 border-t border-white/5">
                 Select an entity to instantiate into the simulation.
              </div>
           </div>
        </div>
      )}

    </div>
  );
};

export default App;