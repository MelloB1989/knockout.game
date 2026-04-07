"use client";

import { useRef, useEffect, Suspense, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useGameStore } from "@/lib/game-store";
import { skinToGlb, mapToEnvironmentGlb } from "@/lib/constants";
import type { Penguin } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Environment model                                                 */
/* ------------------------------------------------------------------ */
function EnvironmentModel({ mapType }: { mapType: string }) {
  const glbPath = mapToEnvironmentGlb(mapType);
  const { scene } = useGLTF(glbPath);
  return (
    <primitive
      object={scene.clone()}
      position={[0, -8, 0]}
      scale={[3, 3, 3]}
      receiveShadow
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Flat 2D Arrow — lies in XZ plane above penguin, points forward    */
/* ------------------------------------------------------------------ */
function DirectionArrow({ power, color, visible }: { power: number; color: string; visible: boolean }) {
  const groupRef = useRef<THREE.Group>(null!);
  const time = useRef(0);

  // Arrow dimensions scale with power
  const shaftLen = 0.6 + (power / 10) * 2.5;
  const shaftWidth = 0.28;
  const headLen = 0.6;
  const headWidth = 0.8;

  const arrowShape = useMemo(() => {
    const shape = new THREE.Shape();
    const sw = shaftWidth / 2;
    const hw = headWidth / 2;

    // Arrow pointing in +Y (will be rotated to -Z in world space)
    shape.moveTo(-sw, 0);
    shape.lineTo(-sw, shaftLen);
    shape.lineTo(-hw, shaftLen);
    shape.lineTo(0, shaftLen + headLen);
    shape.lineTo(hw, shaftLen);
    shape.lineTo(sw, shaftLen);
    shape.lineTo(sw, 0);
    shape.closePath();

    return shape;
  }, [shaftLen, shaftWidth, headLen, headWidth]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.visible = visible;
    if (visible) {
      time.current += delta;
      groupRef.current.position.y = 2.8 + Math.sin(time.current * 3) * 0.1;
    }
  });

  return (
    <group ref={groupRef} position={[0, 2.8, 0]}>
      {/* Rotate shape: -90° around X makes +Y → -Z (forward in penguin space) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[arrowShape]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} side={THREE.DoubleSide} />
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
  const y = penguin.eliminated > 0 ? -3 : 0.5;

  // Smooth position interpolation between server updates
  const interpFrom = useRef(new THREE.Vector3(cx, y, cz));
  const interpTo = useRef(new THREE.Vector3(cx, y, cz));
  const interpT = useRef(1.0);
  const lastServX = useRef(cx);
  const lastServZ = useRef(cz);
  const lastServY = useRef(y);

  // Detect server position changes and start interpolation
  if (cx !== lastServX.current || cz !== lastServZ.current || y !== lastServY.current) {
    if (groupRef.current) {
      interpFrom.current.copy(groupRef.current.position);
    }
    interpTo.current.set(cx, y, cz);
    interpT.current = 0;
    lastServX.current = cx;
    lastServZ.current = cz;
    lastServY.current = y;
  }

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    // Smooth position interpolation (40ms duration between server updates)
    const INTERP_DURATION = 0.04;
    if (interpT.current < 1) {
      interpT.current = Math.min(1, interpT.current + delta / INTERP_DURATION);
      // Smooth step for easing
      const t = interpT.current * interpT.current * (3 - 2 * interpT.current);
      groupRef.current.position.lerpVectors(interpFrom.current, interpTo.current, t);
    } else {
      // Gently hold at target
      groupRef.current.position.lerp(interpTo.current, 1 - Math.exp(-10 * delta));
    }

    // Rotate penguin to face its direction
    // Physics: direction 0° = +X, 90° = +Z
    // Three.js: rotation.y = θ → forward = (-sin(θ), -cos(θ))
    // To face (cos(rad), sin(rad)): targetRotY = -rad - π/2
    const dir = isCurrentPlayer && phase === "countdown" ? aimDirection : penguin.direction;
    const rad = (dir * Math.PI) / 180;
    const targetRotY = -rad - Math.PI / 2;
    groupRef.current.rotation.y +=
      (targetRotY - groupRef.current.rotation.y) * (1 - Math.exp(-10 * delta));
  });

  // Determine arrow visibility
  const showArrow = phase === "countdown" || phase === "animating";
  const arrowPower = isCurrentPlayer ? aimPower : 6;
  const arrowColor = isCurrentPlayer ? "#ffcc00" : "#ff4444";

  return (
    <group ref={groupRef} position={[cx, y, cz]}>
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
/*  Procedural ice tile texture                                       */
/* ------------------------------------------------------------------ */
function useIceTileTexture(length: number, width: number) {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    const size = 512;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    const tileSize = 32;
    const cols = size / tileSize;
    const rows = size / tileSize;

    // Background
    ctx.fillStyle = "#c8e6f0";
    ctx.fillRect(0, 0, size, size);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * tileSize;
        const y = r * tileSize;

        // Ice tile with subtle variation
        const base = 200 + Math.random() * 25;
        const rr = Math.floor(base - 15 + Math.random() * 10);
        const gg = Math.floor(base + Math.random() * 15);
        const bb = Math.floor(base + 15 + Math.random() * 15);

        // Tile fill (slightly inset)
        ctx.fillStyle = `rgb(${rr}, ${gg}, ${bb})`;
        ctx.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);

        // Tile border / groove
        ctx.strokeStyle = "rgba(100, 180, 220, 0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, tileSize - 1, tileSize - 1);

        // Subtle highlight on top-left edge
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        ctx.fillRect(x + 1, y + 1, tileSize - 2, 2);
        ctx.fillRect(x + 1, y + 1, 2, tileSize - 2);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(length / 4, width / 4);
    return texture;
  }, [length, width]);
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
  const prevLength = useRef(length);
  const prevWidth = useRef(width);
  const shrinkFlash = useRef(0);

  const tileTexture = useIceTileTexture(length, width);

  // Detect map shrink
  if (length < prevLength.current || width < prevWidth.current) {
    shrinkFlash.current = 1.0;
    prevLength.current = length;
    prevWidth.current = width;
  }

  targetScale.current.set(length, 0.5, width);

  const edgeColor = {
    frozen_lake: "#4dd0e1",
    tundra_ring: "#80deea",
    glacier_pass: "#b0bec5",
    volcano_rim: "#ff7043",
    neon_arena: "#e040fb",
  }[mapType] || "#80deea";

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    meshRef.current.scale.lerp(targetScale.current, 1 - Math.exp(-3 * delta));

    // Fade out shrink flash
    if (shrinkFlash.current > 0) {
      shrinkFlash.current = Math.max(0, shrinkFlash.current - delta * 2);
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Main platform with ice tile texture */}
      <mesh ref={meshRef} position={[0, -0.25, 0]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          map={tileTexture}
          roughness={0.3}
          metalness={0.05}
          color="#e0f0ff"
        />
      </mesh>

      {/* Platform top surface overlay for extra brightness */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[length, width]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Edge glow lines */}
      {[-length / 2, length / 2].map((x) => (
        <mesh key={`x${x}`} position={[x, 0.1, 0]}>
          <boxGeometry args={[0.15, 0.35, width]} />
          <meshBasicMaterial color={edgeColor} transparent opacity={0.4} />
        </mesh>
      ))}
      {[-width / 2, width / 2].map((z) => (
        <mesh key={`z${z}`} position={[0, 0.1, z]}>
          <boxGeometry args={[length, 0.35, 0.15]} />
          <meshBasicMaterial color={edgeColor} transparent opacity={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Camera — third-person during game, orbit during lobby             */
/*  Supports: horizontal aim rotation, vertical pitch, scroll zoom    */
/* ------------------------------------------------------------------ */
function GameCamera({ playerId, mapCenter }: { playerId: string; mapCenter: { x: number; z: number } }) {
  const currentCamPos = useRef(new THREE.Vector3(0, 15, 25));
  const currentLookAt = useRef(new THREE.Vector3());
  const camPitch = useRef(0.35);
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

  useFrame(({ camera, clock }, delta) => {
    const gs = useGameStore.getState().gameState;
    const phase = useGameStore.getState().phase;
    const aimDirection = useGameStore.getState().aimDirection;
    if (!gs) return;

    // Lobby: gentle orbit around map center
    if (phase === "lobby") {
      const t = clock.getElapsedTime();
      const dist = camDist.current + 8;
      const camX = Math.cos(t * 0.15) * dist;
      const camZ = Math.sin(t * 0.15) * dist;
      const desiredPos = new THREE.Vector3(camX, 14, camZ);
      currentCamPos.current.lerp(desiredPos, 1 - Math.exp(-2 * delta));
      currentLookAt.current.lerp(new THREE.Vector3(0, 0, 0), 1 - Math.exp(-2 * delta));
      camera.position.copy(currentCamPos.current);
      camera.lookAt(currentLookAt.current);
      return;
    }

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
        camera={{ position: [0, 15, 25], fov: 60, near: 0.1, far: 500 }}
        gl={{ alpha: false, antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x87ceeb, 1);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.8;
        }}
      >
        {/* Sky background — bright blue */}
        <color attach="background" args={["#87ceeb"]} />

        {/* Fog — far away for visibility */}
        <fog attach="fog" args={["#87ceeb", 100, 350]} />

        {/* Lighting — bright and clear like reference */}
        <ambientLight intensity={1.4} />
        <directionalLight
          position={[30, 50, 25]}
          intensity={2.2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={120}
          shadow-camera-left={-60}
          shadow-camera-right={60}
          shadow-camera-top={60}
          shadow-camera-bottom={-60}
        />
        <directionalLight position={[-20, 25, -15]} intensity={0.8} />
        <pointLight position={[0, 25, 0]} intensity={0.5} color="#ffffff" />
        <hemisphereLight args={["#b4d7ff", "#88aacc", 0.8]} />

        {/* Camera */}
        <GameCamera playerId={playerId} mapCenter={mapCenter} />

        {/* Platform — centered at origin */}
        <Platform
          length={gameState.map.length}
          width={gameState.map.width}
          mapType={gameState.map.type}
        />

        {/* Water/void below platform */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3, 0]}>
          <planeGeometry args={[400, 400]} />
          <meshStandardMaterial color="#2196f3" transparent opacity={0.7} roughness={0.2} metalness={0.3} />
        </mesh>

        {/* Environment + Penguins — wrapped in Suspense */}
        <Suspense fallback={null}>
          <EnvironmentModel mapType={gameState.map.type} />
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
