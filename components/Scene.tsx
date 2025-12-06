import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Physics, RigidBody, RapierRigidBody, useRapier, BallCollider, CuboidCollider } from '@react-three/rapier';
import { Environment, ContactShadows, Line, Gltf, Resize } from '@react-three/drei';
import * as THREE from 'three';
import { HandPosition, SpawnedObject } from '../types';

// Augment the JSX namespace to include Three.js elements for React Three Fiber.
declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      mesh: any;
      sphereGeometry: any;
      meshStandardMaterial: any;
      boxGeometry: any;
      cylinderGeometry: any;
      planeGeometry: any;
      ambientLight: any;
      spotLight: any;
      pointLight: any;
      color: any;
      fog: any;
      gridHelper: any;
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      mesh: any;
      sphereGeometry: any;
      meshStandardMaterial: any;
      boxGeometry: any;
      cylinderGeometry: any;
      planeGeometry: any;
      ambientLight: any;
      spotLight: any;
      pointLight: any;
      color: any;
      fog: any;
      gridHelper: any;
    }
  }
}

// Error Boundary to catch model loading failures without crashing the app
class ModelErrorBoundary extends React.Component<{ children: React.ReactNode, fallback: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.warn("Model loading failed, switching to fallback:", error);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

// --- VISUAL ONLY: Exoskeleton Hand ---
const ExoskeletonHand = ({ landmarks, isPinching }: { landmarks: {x:number, y:number, z:number}[], isPinching: boolean }) => {
  if (!landmarks || landmarks.length < 21) return null;

  const bones = [
    [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8], // Index
    [0, 9], [9, 10], [10, 11], [11, 12], // Middle
    [0, 13], [13, 14], [14, 15], [15, 16], // Ring
    [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
    [5, 9], [9, 13], [13, 17], [0, 17] // Palm Base
  ];

  return (
    <group>
      {/* Joints */}
      {landmarks.map((lm, i) => (
        <mesh key={i} position={[lm.x, lm.y, lm.z]}>
          <sphereGeometry args={[i % 4 === 0 ? 0.12 : 0.06, 16, 16]} />
          <meshStandardMaterial 
            color={isPinching && (i === 4 || i === 8) ? "#ff0055" : "#00f0ff"} 
            emissive={isPinching && (i === 4 || i === 8) ? "#ff0055" : "#0040ff"}
            emissiveIntensity={1}
            roughness={0.2}
            metalness={0.8}
          />
        </mesh>
      ))}

      {/* Bones */}
      {bones.map(([start, end], i) => {
        const p1 = new THREE.Vector3(landmarks[start].x, landmarks[start].y, landmarks[start].z);
        const p2 = new THREE.Vector3(landmarks[end].x, landmarks[end].y, landmarks[end].z);
        
        return (
          <Line
            key={`bone-${i}`}
            points={[p1, p2]}
            color={isPinching ? "#ff88aa" : "#00aaff"}
            lineWidth={3} 
            transparent
            opacity={0.6}
          />
        );
      })}
    </group>
  );
};

// --- PHYSICS CONTROLLER: Invisible Actuator ---
interface VirtualHandProps {
  position: HandPosition;
}

const VirtualHand = forwardRef<RapierRigidBody, VirtualHandProps>(({ position }, ref) => {
  const internalRef = useRef<RapierRigidBody>(null);
  useImperativeHandle(ref, () => internalRef.current!);

  useFrame(() => {
    if (internalRef.current) {
      internalRef.current.setNextKinematicTranslation(
          new THREE.Vector3(position.x, position.y, position.z)
      );
    }
  });

  return (
    <RigidBody 
      ref={internalRef} 
      type="kinematicPosition" 
      colliders={false} 
      position={[0, 0, 0]}
    >
      <BallCollider 
        args={[0.35]} // Increased collider size for easier interaction
        restitution={0} 
        friction={1.0} 
        sensor={position.isPinching} 
      />
    </RigidBody>
  );
});

// --- VISUALS COMPONENT: Selects between Primitives and GLBs ---
const ObjectVisuals = ({ obj, isGrabbed, dims }: { obj: SpawnedObject, isGrabbed: boolean, dims: [number, number, number] }) => {
  
  if (obj.type === 'custom_glb' && obj.modelUrl) {
    return (
      <group> 
        <ModelErrorBoundary fallback={
             <mesh castShadow receiveShadow>
                <boxGeometry args={dims} />
                <meshStandardMaterial color="#ff3333" wireframe title="Model Failed to Load" />
             </mesh>
        }>
            <Suspense fallback={
                <mesh><boxGeometry args={dims} /><meshStandardMaterial color="gray" wireframe /></mesh>
            }>
                <Resize scale={dims}>
                  <Gltf 
                      src={obj.modelUrl} 
                      castShadow 
                      receiveShadow 
                  />
                </Resize>
            </Suspense>
        </ModelErrorBoundary>
      </group>
    );
  }

  // Fallback Primitives
  return (
    <mesh castShadow receiveShadow>
      {obj.type === 'box' && <boxGeometry args={dims} />}
      {obj.type === 'sphere' && <sphereGeometry args={[Math.max(dims[0], dims[1], dims[2]) / 2]} />}
      {obj.type === 'cylinder' && <cylinderGeometry args={[dims[0]/2, dims[0]/2, dims[1]]} />}
      <meshStandardMaterial 
          color={isGrabbed ? "#ffcc00" : obj.color}
          roughness={0.3} 
          metalness={0.5}
          emissive={isGrabbed ? "#553300" : "#000000"}
      />
    </mesh>
  );
};

// --- Dynamic Object with Joint-Based Grabbing ---
interface DynamicObjectProps {
  obj: SpawnedObject;
  onDespawn: (id: string) => void;
  handRef: React.RefObject<RapierRigidBody>;
  isPinching: boolean;
  handPosition: {x:number, y:number, z:number};
  globalScale: number;
}

const DynamicObject: React.FC<DynamicObjectProps> = ({ obj, onDespawn, handRef, isPinching, handPosition, globalScale }) => {
  const rigidBody = useRef<RapierRigidBody>(null);
  const { world, rapier } = useRapier();
  const joint = useRef<any>(null); 
  const [visualGrabbed, setVisualGrabbed] = useState(false);
  const velocityHistory = useRef<THREE.Vector3[]>([]);
  
  const baseDims = obj.dimensions || [0.5, 0.5, 0.5];
  const dims: [number, number, number] = [
      baseDims[0] * globalScale,
      baseDims[1] * globalScale,
      baseDims[2] * globalScale
  ];

  useFrame(() => {
    if (!rigidBody.current) return;

    const body = rigidBody.current;
    const translation = body.translation();
    if (translation.y < -15) onDespawn(obj.id);

    // --- GRAB LOGIC ---
    if (handRef.current) {
      const handPosVector = new THREE.Vector3(handPosition.x, handPosition.y, handPosition.z);
      const objPos = body.translation();
      const objPosVector = new THREE.Vector3(objPos.x, objPos.y, objPos.z);
      
      const dist = handPosVector.distanceTo(objPosVector);

      // Increased grab distance from 1.3 to 1.8 for easier grabbing
      if (isPinching && dist < 1.8 && !joint.current) {
        
        const bodyRot = body.rotation();
        const bodyQuat = new THREE.Quaternion(bodyRot.x, bodyRot.y, bodyRot.z, bodyRot.w);
        const relPos = new THREE.Vector3().subVectors(handPosVector, objPosVector);
        relPos.applyQuaternion(bodyQuat.clone().invert());

        const handAnchor = new THREE.Vector3(0, 0, 0); 
        const objAnchor = relPos;

        const params = rapier.JointData.spherical(handAnchor, objAnchor);
        (params as any).collideConnected = false; 

        joint.current = world.createImpulseJoint(params, handRef.current, body, true);
        body.wakeUp();
        setVisualGrabbed(true);
      }

      if (joint.current) {
        const handVel = handRef.current.linvel();
        velocityHistory.current.push(new THREE.Vector3(handVel.x, handVel.y, handVel.z));
        if (velocityHistory.current.length > 5) velocityHistory.current.shift();
      }

      if (!isPinching && joint.current) {
        world.removeImpulseJoint(joint.current, true);
        joint.current = null;
        setVisualGrabbed(false);

        const avgVel = new THREE.Vector3(0, 0, 0);
        velocityHistory.current.forEach(v => avgVel.add(v));
        if (velocityHistory.current.length > 0) {
            avgVel.divideScalar(velocityHistory.current.length);
        }

        body.applyImpulse(avgVel.multiplyScalar(2.0 * body.mass()), true);
        body.applyTorqueImpulse({ x: Math.random()-0.5, y: Math.random()-0.5, z: Math.random()-0.5 }, true);
        velocityHistory.current = [];
      }
    }
  });

  useEffect(() => {
    return () => {
      if (joint.current && world) {
        try { world.removeImpulseJoint(joint.current, true); } catch(e) {}
      }
    };
  }, [world]);

  return (
    <RigidBody 
      ref={rigidBody} 
      position={obj.position} 
      colliders={false} // Disable auto-hull to prevent async crashes
      restitution={0.4} 
      friction={0.8}
      mass={1.0}
      linearDamping={0.1}
      angularDamping={0.1}
    >
      {/* Explicit Physics Shapes based on Scaled Dimensions */}
      {obj.type === 'sphere' ? (
         <BallCollider args={[Math.max(dims[0], dims[1], dims[2]) / 2]} />
      ) : (
         <CuboidCollider args={[dims[0] / 2, dims[1] / 2, dims[2] / 2]} />
      )}
      
      <ObjectVisuals obj={obj} isGrabbed={visualGrabbed} dims={dims} />
    </RigidBody>
  );
};

interface SceneProps {
  handPosition: HandPosition;
  objects: SpawnedObject[];
  onObjectDespawn: (id: string) => void;
  roomConfig: { bgColor: string; roomSize: number };
  globalScale?: number;
}

const Scene: React.FC<SceneProps> = ({ handPosition, objects, onObjectDespawn, roomConfig, globalScale = 1.0 }) => {
  const handRbRef = useRef<RapierRigidBody>(null);
  const size = roomConfig.roomSize;

  return (
    <Canvas shadows camera={{ position: [0, 1, 8], fov: 65 }}>
      <color attach="background" args={[roomConfig.bgColor]} />
      <fog attach="fog" args={[roomConfig.bgColor, 5, 25]} />
      
      <ambientLight intensity={0.5} />
      <spotLight position={[5, 10, 5]} angle={0.4} penumbra={1} intensity={100} castShadow shadow-bias={-0.0001} />
      <pointLight position={[-5, 2, -2]} intensity={20} color="#00aaff" />
      <pointLight position={[5, 2, -2]} intensity={20} color="#ff00aa" />
      
      <Environment preset="city" />
      
      <Physics gravity={[0, -9.81, 0]} timeStep={1/60}>
        
        <VirtualHand ref={handRbRef} position={handPosition} />
        
        {objects.map((obj) => (
          <DynamicObject 
            key={obj.id} 
            obj={obj} 
            onDespawn={onObjectDespawn} 
            handRef={handRbRef}
            isPinching={handPosition.isPinching}
            handPosition={handPosition}
            globalScale={globalScale}
          />
        ))}

        {/* Floor */}
        <RigidBody type="fixed" position={[0, -5, 0]} friction={1} restitution={0.2}>
           <mesh receiveShadow>
             <boxGeometry args={[100, 1, 100]} />
             <meshStandardMaterial color="#0a0a0a" metalness={0.8} roughness={0.1} />
           </mesh>
           <gridHelper args={[100, 50, 0x444444, 0x111111]} position={[0, 0.51, 0]} />
        </RigidBody>

        {/* Dynamic Walls based on Room Size */}
        <RigidBody type="fixed" position={[-size, 0, 0]}><CuboidCollider args={[1, 10, 10]} /></RigidBody>
        <RigidBody type="fixed" position={[size, 0, 0]}><CuboidCollider args={[1, 10, 10]} /></RigidBody>
        <RigidBody type="fixed" position={[0, 0, -size]}><CuboidCollider args={[10, 10, 1]} /></RigidBody>
        <RigidBody type="fixed" position={[0, 0, size]}><CuboidCollider args={[10, 10, 1]} /></RigidBody>

      </Physics>

      {handPosition.active && (
         <ExoskeletonHand 
            landmarks={handPosition.landmarks} 
            isPinching={handPosition.isPinching} 
         />
      )}
      
      <ContactShadows position={[0, -4.9, 0]} opacity={0.6} scale={20} blur={2.5} far={4} color="#000000" />
    </Canvas>
  );
};

export default Scene;