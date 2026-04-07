"use client";

import { useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuthStore } from "@/lib/auth-store";
import { useGameStore } from "@/lib/game-store";
import {
  connectToGame,
  disconnectFromGame,
  registerPlayer,
  startGame as wsStartGame,
} from "@/lib/ws";
import GameControls from "@/components/game/GameControls";
import GameHUD from "@/components/game/GameHUD";
import LobbyOverlay from "@/components/game/LobbyOverlay";
import GameOverOverlay from "@/components/game/GameOverOverlay";

// Dynamic import for Three.js canvas (no SSR)
const GameArena = dynamic(() => import("@/components/game/GameArena"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0a0a0f]">
      <div className="text-white/40 text-sm">Loading 3D arena...</div>
    </div>
  ),
});

export default function GamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = use(params);
  const router = useRouter();
  const { token, playerId, playerSecret, isReady, username } = useAuthStore();
  const { phase, gameState, setGameId, setPlayerId, setIsHost, reset } = useGameStore();
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!isReady || !token || !playerId) {
      router.replace("/");
      return;
    }

    setGameId(gameId);
    if (playerId) setPlayerId(playerId);

    // Prevent double-connect from React strict mode
    if (connectedRef.current) return;
    connectedRef.current = true;

    const skin =
      (typeof window !== "undefined" &&
        sessionStorage.getItem("selectedSkin")) ||
      "default";

    // Queue registration before connecting — ws.ts will send it on open
    registerPlayer({
      id: playerId,
      skin,
      player_secret: playerSecret || "",
      position: { x: 0, z: 0 },
    });

    // Connect websocket (will register + get_state on open)
    connectToGame(gameId, token);

    return () => {
      disconnectFromGame();
      connectedRef.current = false;
    };
  }, [gameId, isReady, token, playerId, playerSecret, router, setGameId]);

  const handleStart = () => {
    wsStartGame();
  };

  const handlePlayAgain = () => {
    reset();
    router.push("/");
  };

  if (!isReady) return null;

  return (
    <div className="fixed inset-0 bg-[#0a0a0f]">
      {/* Loading state while waiting for game state */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0f]">
          <div className="text-2xl font-bold text-white/60 mb-4">Connecting...</div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* 3D Arena (full screen) — only mount when we have game state */}
      {gameState && <GameArena playerId={playerId || ""} />}

      {/* HUD overlay */}
      <GameHUD />

      {/* Controls overlay (during countdown phase) */}
      <GameControls />

      {/* Lobby overlay */}
      {phase === "lobby" && (
        <LobbyOverlay
          gameId={gameId}
          playerId={playerId || ""}
          onStart={handleStart}
        />
      )}

      {/* Game over overlay */}
      {phase === "ended" && <GameOverOverlay onPlayAgain={handlePlayAgain} />}
    </div>
  );
}
