"use client";

import { useGameStore } from "@/lib/game-store";
import type { Penguin } from "@/lib/types";

interface LobbyOverlayProps {
  gameId: string;
  playerId: string;
  onStart: () => void;
}

export default function LobbyOverlay({ gameId, playerId, onStart }: LobbyOverlayProps) {
  const { gameState, isHost } = useGameStore();

  if (!gameState) return null;

  const players = Object.values(gameState.players);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#12121f]/95 border border-white/10 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        {/* Game code */}
        <div className="text-center mb-6">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-2">
            Game Code
          </p>
          <p className="text-4xl font-mono font-black tracking-[0.3em] text-cyan-400">
            {gameId}
          </p>
          <button
            onClick={() => navigator.clipboard.writeText(gameId)}
            className="mt-2 text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            Tap to copy
          </button>
        </div>

        {/* Player list */}
        <div className="mb-6">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-3">
            Players ({players.length})
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {players.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-3 p-3 rounded-xl ${
                  p.id === playerId
                    ? "bg-cyan-500/10 border border-cyan-500/20"
                    : "bg-white/5 border border-white/5"
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-b from-white/20 to-white/5 flex items-center justify-center text-xs font-bold">
                  {p.id.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {p.id}
                  </p>
                  <p className="text-[10px] text-white/30">{p.skin}</p>
                </div>
                {p.id === gameState.host_id && (
                  <span className="text-[10px] text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full font-medium">
                    HOST
                  </span>
                )}
                {p.id === playerId && (
                  <span className="text-[10px] text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-full font-medium">
                    YOU
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Map info */}
        <div className="mb-6 p-3 rounded-xl bg-white/5 border border-white/5">
          <div className="flex justify-between text-xs text-white/50">
            <span>Map: {gameState.map.type}</span>
            <span>
              {gameState.map.length}x{gameState.map.width}
            </span>
          </div>
        </div>

        {/* Start button (host only) */}
        {isHost ? (
          <button
            onClick={onStart}
            disabled={players.length < 2}
            className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/25 hover:shadow-green-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {players.length < 2
              ? "Waiting for players..."
              : `Start Game (${players.length} players)`}
          </button>
        ) : (
          <div className="text-center py-4">
            <p className="text-white/40 text-sm">Waiting for host to start...</p>
            <div className="flex justify-center gap-1 mt-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"
                  style={{ animationDelay: `${i * 0.3}s` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
