"use client";

import { useRef, Suspense, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useGameStore } from "@/lib/game-store";
import { skinToGlb, mapToEnvironmentGlb } from "@/lib/constants";
import type { Penguin } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Environment model                                                 */
/* ------------------------------------------------------------------ */
function EnvironmentModel({ mapType, center }: { mapType: string; center: [number, number, number] }) {
  const glbPath = mapToEnvironmentGlb(mapType);
  const { scene } = useGLTF(glbPath);
  return (
    <primitive
      object={scene.clone()}
      position={[center[0], -8, center[2]]}
      scale={[3, 3, 3]}
      receiveShadow
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Direction Arrow — vertical arrow above penguin pointing aim dir   */
/* ------------------------------------------------------------------ */
function DirectionArrow({ direction, color, visible }: { direction: number; color: string; visible: boolean }) {
  const groupRef = useRef<THREE.Group>(null!);
  const time = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.visible = visible;
    if (visible) {
      const rad = (direction * Math.PI) / 180;
      groupRef.current.rotation.y = -rad + Math.PI / 2;
      // Gentle bob
      time.current += delta;
      groupRef.current.position.y = 2.5 + Math.sin(time.current * 3) * 0.15;
    }
  });

  return (
    <group ref={groupRef} position={[0, 2.5, 0]}>
      {/* Arrow head (cone) pointing forward */}
      <mesh position={[0, 0, -1.0]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.35, 0.7, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} />
      </mesh>
      {/* Arrow shaft */}
      <mesh position={[0, 0, -0.3]}>
        <boxGeometry args={[0.15, 0.15, 1.0]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Penguin model                                                     */
/* ------------------------------------------------------------------ */
interface PenguinModelProps {
  penguin: Penguin;
  isCurrentPlayer: boolean;
  mapCenter: { x: number; z: number };
}

function PenguinModel({ penguin, isCurrentPlayer, mapCenter }: PenguinModelProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const glbPath = skinToGlb(penguin.skin);
  const { scene } = useGLTF(glbPath);

  const phase = useGameStore((s) => s.phase);
  const aimDirection = useGameStore((s) => s.aimDirection);
  const moveSubmitted = useGameStore((s) => s.moveSubmitted);

  // Center-relative position
  const cx = penguin.position.x - mapCenter.x;
  const cz = penguin.position.z - mapCenter.z;

  const targetPos = useRef(new THREE.Vector3(cx, 0.5, cz));
  const currentPos = useRef(new THREE.Vector3(cx, 0.5, cz));

  // Update target when position changes
  targetPos.current.set(cx, penguin.eliminated > 0 ? -3 : 0.5, cz);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const speed = 15;
    currentPos.current.lerp(targetPos.current, 1 - Math.exp(-speed * delta));
    groupRef.current.position.copy(currentPos.current);

    // Rotate penguin to face its direction
    const dir = isCurrentPlayer && phase === "countdown" ? aimDirection : penguin.direction;
    const rad = (dir * Math.PI) / 180;
    const targetRotY = -rad + Math.PI / 2;
    groupRef.current.rotation.y +=
      (targetRotY - groupRef.current.rotation.y) * (1 - Math.exp(-10 * delta));
  });

  // Determine arrow visibility and direction
  const showArrow = phase === "countdown" || phase === "animating";
  const arrowDir = isCurrentPlayer ? aimDirection : penguin.direction;
  const arrowColor = isCurrentPlayer ? "#ffcc00" : "#ff4444";

  return (
    <group ref={groupRef} position={[cx, 0.5, cz]}>
      <primitive
        object={scene.clone()}
        scale={[1.2, 1.2, 1.2]}
        castShadow
        receiveShadow
      />
      {/* Direction arrow */}
      <DirectionArrow
        direction={arrowDir}
        color={arrowColor}
        visible={showArrow && penguin.eliminated === 0}
      />
      {/* Glow ring for current player */}
      {isCurrentPlayer && penguin.eliminated === 0 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[0.8, 1.1, 32]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.4} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Platform                                                          */
/* ------------------------------------------------------------------ */
interface PlatformProps {
  length: number;
  width: number;
  mapType: string;
}

function Platform({ length, width, mapType }: PlatformProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const targetScale = useRef(new THREE.Vector3(length, 0.5, width));

  targetScale.current.set(length, 0.5, width);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    meshRef.current.scale.lerp(targetScale.current, 1 - Math.exp(-3 * delta));
  });

  const platformColor = {
    frozen_lake: "#1a3a5c",
    tundra_ring: "#2a4a6c",
    glacier_pass: "#1e3e5e",
    volcano_rim: "#5c2a1a",
    neon_arena: "#1a1a3c",
  }[mapType] || "#2a4a6c";

  const edgeColor = {
    frozen_lake: "#4dd0e1",
    tundra_ring: "#80deea",
    glacier_pass: "#b0bec5",
    volcano_rim: "#ff7043",
    neon_arena: "#e040fb",
  }[mapType] || "#80deea";

  return (
    <group position={[0, 0, 0]}>
      {/* Main platform — centered at origin */}
      <mesh ref={meshRef} position={[0, -0.25, 0]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={platformColor} roughness={0.4} metalness={0.1} />
      </mesh>
      {/* Glowing edge overlay */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[length + 0.2, width + 0.2]} />
        <meshBasicMaterial color={edgeColor} transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>
      {/* Grid */}
      <gridHelper
        args={[Math.max(length, width), Math.max(length, width), 0x333333, 0x222222]}
        position={[0, 0.03, 0]}
      />
      {/* Edge glow lines */}
      {[-length / 2, length / 2].map((x) => (
        <mesh key={`x${x}`} position={[x, 0.1, 0]}>
          <boxGeometry args={[0.1, 0.3, width]} />
          <meshBasicMaterial color={edgeColor} transparent opacity={0.3} />
        </mesh>
      ))}
      {[-width / 2, width / 2].map((z) => (
        <mesh key={`z${z}`} position={[0, 0.1, z]}>
          <boxGeometry args={[length, 0.3, 0.1]} />
          <meshBasicMaterial color={edgeColor} transparent opacity={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Third-person camera — behind the player's penguin                 */
/* ------------------------------------------------------------------ */
function ThirdPersonCamera({ playerId, mapCenter }: { playerId: string; mapCenter: { x: number; z: number } }) {
  const currentCamPos = useRef(new THREE.Vector3(0, 8, 12));
  const currentLookAt = useRef(new THREE.Vector3());

  useFrame(({ camera }, delta) => {
    const gs = useGameStore.getState().gameState;
    const phase = useGameStore.getState().phase;
    const aimDirection = useGameStore.getState().aimDirection;
    if (!gs) return;

    const player = gs.players[playerId];

    // Player's center-relative position
    let px: number, pz: number;
    if (!player || player.eliminated > 0) {
      px = 0;
      pz = 0;
    } else {
      px = player.position.x - mapCenter.x;
      pz = player.position.z - mapCenter.z;
    }

    const lookTarget = new THREE.Vector3(px, 1, pz);

    // Camera behind the player based on their facing direction
    const dir = phase === "countdown" ? aimDirection : (player?.direction ?? 0);
    const rad = (dir * Math.PI) / 180;

    // Camera offset: behind and above the penguin
    const camDist = 10;
    const camHeight = 6;
    const camX = px - Math.cos(rad) * camDist;
    const camZ = pz - Math.sin(rad) * camDist;
    const desiredPos = new THREE.Vector3(camX, camHeight, camZ);

    const smoothSpeed = phase === "countdown" ? 5 : 3;
    currentCamPos.current.lerp(desiredPos, 1 - Math.exp(-smoothSpeed * delta));
    currentLookAt.current.lerp(lookTarget, 1 - Math.exp(-smoothSpeed * delta));

    camera.position.copy(currentCamPos.current);
    camera.lookAt(currentLookAt.current);
  });

  return null;
}

/* ------------------------------------------------------------------ */
/*  Main arena                                                        */
/* ------------------------------------------------------------------ */
interface GameArenaProps {
  playerId: string;
}

export default function GameArena({ playerId }: GameArenaProps) {
  const gameState = useGameStore((s) => s.gameState);

  if (!gameState) return null;

  const players = Object.values(gameState.players);
  const mapCenter = useMemo(() => ({
    x: gameState.map.length / 2,
    z: gameState.map.width / 2,
  }), [gameState.map.length, gameState.map.width]);

  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: "100vw", height: "100vh" }}>
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
        camera={{ position: [0, 8, 12], fov: 60, near: 0.1, far: 500 }}
        gl={{ alpha: false, antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x0a0a0f, 1);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
        }}
      >
        {/* Scene background */}
        <color attach="background" args={["#0a0a0f"]} />

        {/* Fog */}
        <fog attach="fog" args={["#0a0a0f", 60, 200]} />

        {/* Lighting */}
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[20, 30, 20]}
          intensity={1.4}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={100}
          shadow-camera-left={-50}
          shadow-camera-right={50}
          shadow-camera-top={50}
          shadow-camera-bottom={-50}
        />
        <pointLight position={[0, 15, 0]} intensity={0.5} color="#22d3ee" />
        <hemisphereLight args={["#87ceeb", "#444444", 0.3]} />

        {/* Third-person camera */}
        <ThirdPersonCamera playerId={playerId} mapCenter={mapCenter} />

        {/* Platform — centered at origin */}
        <Platform
          length={gameState.map.length}
          width={gameState.map.width}
          mapType={gameState.map.type}
        />

        {/* Void below platform */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -5, 0]}>
          <planeGeometry args={[300, 300]} />
          <meshStandardMaterial color="#050510" transparent opacity={0.9} />
        </mesh>

        {/* Environment + Penguins — wrapped in Suspense */}
        <Suspense fallback={null}>
          <EnvironmentModel mapType={gameState.map.type} center={[0, 0, 0]} />
          {players.map((penguin) => (
            <PenguinModel
              key={penguin.id}
              penguin={penguin}
              isCurrentPlayer={penguin.id === playerId}
              mapCenter={mapCenter}
            />
          ))}
        </Suspense>
      </Canvas>
    </div>
  );
}
