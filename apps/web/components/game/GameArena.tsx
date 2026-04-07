"use client";

import { useRef, useEffect, Suspense, useMemo } from "react";
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
/*  Direction Arrow — points forward from penguin, length = power     */
/* ------------------------------------------------------------------ */
function DirectionArrow({ power, color, visible }: { power: number; color: string; visible: boolean }) {
  const groupRef = useRef<THREE.Group>(null!);
  const time = useRef(0);

  // Arrow length scales with power: power 2 → short, power 10 → long
  const shaftLen = 0.5 + (power / 10) * 2.0;
  const conePos = -(shaftLen + 0.35);
  const shaftPos = -(shaftLen / 2);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.visible = visible;
    if (visible) {
      time.current += delta;
      groupRef.current.position.y = 2.5 + Math.sin(time.current * 3) * 0.12;
    }
  });

  return (
    <group ref={groupRef} position={[0, 2.5, 0]}>
      {/* Arrow shaft — along local -Z (forward in penguin space) */}
      <mesh position={[0, 0, shaftPos]}>
        <boxGeometry args={[0.12, 0.12, shaftLen]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} />
      </mesh>
      {/* Arrow head (cone) — tip of the arrow */}
      <mesh position={[0, 0, conePos]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.3, 0.6, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} />
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
  const aimPower = useGameStore((s) => s.aimPower);

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

  // Determine arrow visibility
  const showArrow = phase === "countdown" || phase === "animating";
  const arrowPower = isCurrentPlayer ? aimPower : 6;
  const arrowColor = isCurrentPlayer ? "#ffcc00" : "#ff4444";

  return (
    <group ref={groupRef} position={[cx, 0.5, cz]}>
      <primitive
        object={scene.clone()}
        scale={[1.2, 1.2, 1.2]}
        castShadow
        receiveShadow
      />
      {/* Direction arrow — no own rotation, inherits from penguin group */}
      <DirectionArrow
        power={arrowPower}
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
/*  Supports: horizontal aim rotation, vertical pitch, scroll zoom    */
/* ------------------------------------------------------------------ */
function ThirdPersonCamera({ playerId, mapCenter }: { playerId: string; mapCenter: { x: number; z: number } }) {
  const currentCamPos = useRef(new THREE.Vector3(0, 8, 12));
  const currentLookAt = useRef(new THREE.Vector3());
  const camPitch = useRef(0.35); // radians, 0 = level, positive = looking down
  const camDist = useRef(12);

  // Scroll to zoom
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camDist.current = Math.max(5, Math.min(25, camDist.current + e.deltaY * 0.01));
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  // Right-click drag for vertical pitch
  useEffect(() => {
    let dragging = false;
    let lastY = 0;
    const onDown = (e: MouseEvent) => {
      if (e.button === 2) { dragging = true; lastY = e.clientY; e.preventDefault(); }
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const dy = e.clientY - lastY;
      lastY = e.clientY;
      camPitch.current = Math.max(0.05, Math.min(1.2, camPitch.current + dy * 0.005));
    };
    const onUp = (e: MouseEvent) => { if (e.button === 2) dragging = false; };
    const onCtx = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("contextmenu", onCtx);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("contextmenu", onCtx);
    };
  }, []);

  useFrame(({ camera }, delta) => {
    const gs = useGameStore.getState().gameState;
    const phase = useGameStore.getState().phase;
    const aimDirection = useGameStore.getState().aimDirection;
    if (!gs) return;

    const player = gs.players[playerId];

    let px: number, pz: number;
    if (!player || player.eliminated > 0) {
      px = 0;
      pz = 0;
    } else {
      px = player.position.x - mapCenter.x;
      pz = player.position.z - mapCenter.z;
    }

    const lookTarget = new THREE.Vector3(px, 1, pz);

    const dir = phase === "countdown" ? aimDirection : (player?.direction ?? 0);
    const rad = (dir * Math.PI) / 180;

    const dist = camDist.current;
    const pitch = camPitch.current;
    const camHeight = dist * Math.sin(pitch);
    const horizDist = dist * Math.cos(pitch);
    const camX = px - Math.cos(rad) * horizDist;
    const camZ = pz - Math.sin(rad) * horizDist;
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
          gl.setClearColor(0x1a1a2e, 1);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.6;
        }}
      >
        {/* Scene background */}
        <color attach="background" args={["#1a1a2e"]} />

        {/* Fog — pushed back for visibility */}
        <fog attach="fog" args={["#1a1a2e", 80, 300]} />

        {/* Lighting — brighter for better visibility */}
        <ambientLight intensity={1.2} />
        <directionalLight
          position={[30, 40, 20]}
          intensity={2.0}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={120}
          shadow-camera-left={-60}
          shadow-camera-right={60}
          shadow-camera-top={60}
          shadow-camera-bottom={-60}
        />
        <directionalLight position={[-20, 20, -10]} intensity={0.6} />
        <pointLight position={[0, 20, 0]} intensity={0.8} color="#22d3ee" />
        <hemisphereLight args={["#b4d7ff", "#666666", 0.6]} />

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
          <meshStandardMaterial color="#0d0d1a" transparent opacity={0.9} />
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
