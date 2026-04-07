"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Environment } from "@react-three/drei";
import * as THREE from "three";
import { useGameStore } from "@/lib/game-store";
import { skinToGlb } from "@/lib/constants";
import type { Penguin } from "@/lib/types";

interface PenguinModelProps {
  penguin: Penguin;
  isCurrentPlayer: boolean;
}

function PenguinModel({ penguin, isCurrentPlayer }: PenguinModelProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const glbPath = skinToGlb(penguin.skin);
  const { scene } = useGLTF(glbPath);

  const targetPos = useRef(new THREE.Vector3(penguin.position.x, 0.5, penguin.position.z));
  const currentPos = useRef(new THREE.Vector3(penguin.position.x, 0.5, penguin.position.z));

  // Update target when position changes
  targetPos.current.set(penguin.position.x, penguin.eliminated > 0 ? -3 : 0.5, penguin.position.z);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    // Smooth interpolation
    const speed = 6;
    currentPos.current.lerp(targetPos.current, 1 - Math.exp(-speed * delta));
    groupRef.current.position.copy(currentPos.current);

    // Rotate penguin to face direction
    if (penguin.velocity > 0.01) {
      const rad = (penguin.direction * Math.PI) / 180;
      const targetRotY = -rad + Math.PI / 2;
      groupRef.current.rotation.y +=
        (targetRotY - groupRef.current.rotation.y) * (1 - Math.exp(-8 * delta));
    }

    // Bounce effect when moving
    if (penguin.velocity > 0.1) {
      groupRef.current.position.y =
        currentPos.current.y + Math.sin(Date.now() * 0.01) * 0.1;
    }
  });

  return (
    <group ref={groupRef} position={[penguin.position.x, 0.5, penguin.position.z]}>
      <primitive
        object={scene.clone()}
        scale={[1.2, 1.2, 1.2]}
        castShadow
        receiveShadow
      />
      {/* Player name tag */}
      {penguin.eliminated === 0 && (
        <sprite position={[0, 2.5, 0]} scale={[2, 0.5, 1]}>
          <spriteMaterial
            color={isCurrentPlayer ? "#22d3ee" : "#ffffff"}
            opacity={0.8}
            transparent
          />
        </sprite>
      )}
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

interface PlatformProps {
  length: number;
  width: number;
  mapType: string;
}

function Platform({ length, width, mapType }: PlatformProps) {
  const prevDims = useRef({ length, width });
  const meshRef = useRef<THREE.Mesh>(null!);
  const scaleRef = useRef(new THREE.Vector3(length, 0.5, width));
  const posRef = useRef(new THREE.Vector3(length / 2, -0.25, width / 2));

  // Update targets
  scaleRef.current.set(length, 0.5, width);
  posRef.current.set(length / 2, -0.25, width / 2);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    // Smooth platform shrinking
    meshRef.current.scale.lerp(scaleRef.current, 1 - Math.exp(-3 * delta));
    meshRef.current.position.lerp(posRef.current, 1 - Math.exp(-3 * delta));
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
    <group>
      {/* Main platform */}
      <mesh
        ref={meshRef}
        position={[length / 2, -0.25, width / 2]}
        receiveShadow
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={platformColor} roughness={0.4} metalness={0.1} />
      </mesh>
      {/* Glowing edge lines */}
      <mesh position={[length / 2, 0.02, width / 2]}>
        <planeGeometry args={[length + 0.2, width + 0.2]} />
        <meshBasicMaterial color={edgeColor} transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>
      {/* Grid pattern on platform */}
      <gridHelper
        args={[Math.max(length, width), Math.max(length, width), 0x333333, 0x222222]}
        position={[length / 2, 0.03, width / 2]}
      />
      {/* Danger zone edge glow */}
      {[0, length].map((x) => (
        <mesh key={`x${x}`} position={[x, 0.1, width / 2]}>
          <boxGeometry args={[0.1, 0.3, width]} />
          <meshBasicMaterial color={edgeColor} transparent opacity={0.3} />
        </mesh>
      ))}
      {[0, width].map((z) => (
        <mesh key={`z${z}`} position={[length / 2, 0.1, z]}>
          <boxGeometry args={[length, 0.3, 0.1]} />
          <meshBasicMaterial color={edgeColor} transparent opacity={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function FollowCamera({ playerId }: { playerId: string }) {
  const offset = useRef(new THREE.Vector3(0, 18, 15));
  const currentPos = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());

  useFrame(({ camera }, delta) => {
    const gs = useGameStore.getState().gameState;
    if (!gs) return;

    const player = gs.players[playerId];
    if (!player) {
      // Center on map
      lookTarget.current.set(gs.map.length / 2, 0, gs.map.width / 2);
    } else {
      lookTarget.current.set(player.position.x, 0, player.position.z);
    }

    const desired = lookTarget.current.clone().add(offset.current);
    currentPos.current.lerp(desired, 1 - Math.exp(-3 * delta));

    camera.position.copy(currentPos.current);
    camera.lookAt(lookTarget.current);
  });

  return null;
}

interface GameArenaProps {
  playerId: string;
}

export default function GameArena({ playerId }: GameArenaProps) {
  const gameState = useGameStore((s) => s.gameState);

  if (!gameState) return null;

  const players = Object.values(gameState.players);

  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      camera={{ position: [20, 18, 25], fov: 50, near: 0.1, far: 200 }}
      className="w-full h-full"
      style={{ background: "#0a0a0f" }}
    >
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[20, 30, 20]}
        intensity={1.2}
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

      {/* Fog for atmosphere */}
      <fog attach="fog" args={["#0a0a0f", 40, 120]} />

      {/* Camera follow */}
      <FollowCamera playerId={playerId} />

      {/* Platform */}
      <Platform
        length={gameState.map.length}
        width={gameState.map.width}
        mapType={gameState.map.type}
      />

      {/* Void / water below platform */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[gameState.map.length / 2, -5, gameState.map.width / 2]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#050510" transparent opacity={0.9} />
      </mesh>

      {/* Penguins */}
      {players.map((penguin) => (
        <PenguinModel
          key={penguin.id}
          penguin={penguin}
          isCurrentPlayer={penguin.id === playerId}
        />
      ))}

      {/* Environment */}
      <Environment preset="night" />
    </Canvas>
  );
}
