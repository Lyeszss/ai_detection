export interface SpawnedObject {
  id: string;
  type: 'box' | 'sphere' | 'cylinder' | 'custom_glb';
  color: string;
  name: string;
  position: [number, number, number];
  dimensions?: [number, number, number]; // [width, height, depth]
  category?: string;
  modelUrl?: string; // URL vers le fichier .glb/.gltf
}

export interface HandPosition {
  x: number;
  y: number;
  z: number;
  active: boolean;
  isPinching: boolean;
  landmarks: Array<{x: number, y: number, z: number}>; 
}

export enum GameState {
  IDLE = 'IDLE',
  SCANNING = 'SCANNING',
  PLAYING = 'PLAYING'
}