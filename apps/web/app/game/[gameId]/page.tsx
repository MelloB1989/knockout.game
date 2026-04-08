"use client";

import { useEffect, useRef, use, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuthStore } from "@/lib/auth-store";
import { useGameStore } from "@/lib/game-store";
import {
  connectToGame,
  disconnectFromGame,
  getState as wsGetState,
  registerPlayer,
  startGame as wsStartGame,
  playAgain as wsPlayAgain,
} from "@/lib/ws";
import GameControls from "@/components/game/GameControls";
import GameHUD from "@/components/game/GameHUD";
import LobbyOverlay from "@/components/game/LobbyOverlay";
import GameOverOverlay from "@/components/game/GameOverOverlay";

// Dynamic import for Three.js canvas (no SSR)
const GameArena = dynamic(() => import("@/components/game/GameArena"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="text-[var(--text-dim)] text-sm font-[family-name:var(--font-fredoka)]">Loading 3D arena...</div>
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
  const {
    token,
    playerId,
    playerSecret,
    selectedSkin,
    isReady,
    hasHydrated,
    restorePersistedSession,
  } = useAuthStore();
  const {
    phase,
    gameState,
    rematchGameId,
    setGameId,
    setPlayerId,
    clearRematch,
    setRematchRequested,
  } = useGameStore();
  const connectedRef = useRef(false);
  const rejoinRetryRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  const queuedSkin = useMemo(
    () => selectedSkin || "default",
    [selectedSkin],
  );

  const queueRejoin = () => {
    if (!playerId) return;
    registerPlayer({
      id: playerId,
      skin: queuedSkin,
      player_secret: playerSecret || "",
      position: { x: 0, z: 0 },
    });
  };

  useEffect(() => {
    if (!hasHydrated || !isReady || !token || !playerId || !playerSecret) {
      const restored = restorePersistedSession();
      const restoredState = useAuthStore.getState();

      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }

      if (
        !restored &&
        restoredState.hasHydrated &&
        (!restoredState.token ||
          !restoredState.playerId ||
          !restoredState.playerSecret)
      ) {
        redirectTimerRef.current = setTimeout(() => {
          router.replace("/");
        }, 1200);
      }
      return;
    }

    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }

    setGameId(gameId);
    if (playerId) setPlayerId(playerId);

    // Prevent double-connect from React strict mode
    if (connectedRef.current) return;
    connectedRef.current = true;

    // Queue registration before connecting — ws.ts will send it on open.
    queueRejoin();

    // Connect websocket (will register + get_state on open)
    connectToGame(gameId, token);

    // Keep nudging rejoin/state requests until the first game state lands.
    retryCountRef.current = 0;
    rejoinRetryRef.current = setInterval(() => {
      if (useGameStore.getState().gameState) {
        if (rejoinRetryRef.current) {
          clearInterval(rejoinRetryRef.current);
          rejoinRetryRef.current = null;
        }
        return;
      }

      retryCountRef.current += 1;
      queueRejoin();
      wsGetState();

      if (retryCountRef.current >= 12 && rejoinRetryRef.current) {
        clearInterval(rejoinRetryRef.current);
        rejoinRetryRef.current = null;
      }
    }, 1200);

    return () => {
      if (rejoinRetryRef.current) {
        clearInterval(rejoinRetryRef.current);
        rejoinRetryRef.current = null;
      }
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
      }
      disconnectFromGame();
      connectedRef.current = false;
    };
  }, [
    gameId,
    hasHydrated,
    isReady,
    token,
    playerId,
    playerSecret,
    queuedSkin,
    router,
    restorePersistedSession,
    setGameId,
    setPlayerId,
  ]);

  useEffect(() => {
    if (gameState && rejoinRetryRef.current) {
      clearInterval(rejoinRetryRef.current);
      rejoinRetryRef.current = null;
    }
  }, [gameState]);

  useEffect(() => {
    if (!rematchGameId || rematchGameId === gameId) return;
    router.replace(`/game/${rematchGameId}`);
    clearRematch();
  }, [clearRematch, gameId, rematchGameId, router]);

  const handleStart = () => {
    wsStartGame();
  };

  const handlePlayAgain = () => {
    setRematchRequested(true);
    wsPlayAgain();
  };

  const showRestoreOverlay = !hasHydrated || !isReady || phase === "idle";

  return (
    <div className="fixed inset-0 bg-[var(--bg-primary)]">
      {showRestoreOverlay && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[var(--bg-primary)]">
          <div className="text-2xl font-bold text-[var(--text-warm)] mb-3 font-[family-name:var(--font-fredoka)]">
            {hasHydrated && isReady ? "Restoring match..." : "Restoring session..."}
          </div>
          <div className="text-sm text-[var(--text-dim)] mb-4 font-[family-name:var(--font-geist-sans)]">
            Rejoining game {gameId}
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-full bg-[var(--accent-orange)] animate-pulse"
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
