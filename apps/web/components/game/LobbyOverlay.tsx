"use client";

import { useGameStore } from "@/lib/game-store";

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
    <div className="absolute inset-0 z-30 pointer-events-none flex flex-col justify-between p-4">
      {/* Top: Game code */}
      <div className="flex justify-center pointer-events-auto">
        <div className="bg-black/60 backdrop-blur-md border border-white/15 rounded-2xl px-8 py-4 text-center">
          <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] mb-1">
            Game Code
          </p>
          <p className="text-3xl font-mono font-black tracking-[0.3em] text-cyan-400">
            {gameId}
          </p>
          <button
            onClick={() => navigator.clipboard.writeText(gameId)}
            className="mt-1 text-[10px] text-white/30 hover:text-white/60 transition-colors"
          >
            Tap to copy
          </button>
        </div>
      </div>

      {/* Middle area — empty, shows 3D arena */}
      <div />

      {/* Bottom: Player list + Start */}
      <div className="flex flex-col items-center gap-3 pointer-events-auto">
        {/* Player list */}
        <div className="bg-black/60 backdrop-blur-md border border-white/15 rounded-xl px-4 py-3 max-w-sm w-full">
          <p className="text-[10px] text-white/40 uppercase tracking-widest mb-2">
            Players ({players.length})
          </p>
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {players.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                  p.id === playerId
                    ? "bg-cyan-500/15 border border-cyan-500/20"
                    : "bg-white/5"
                }`}
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-b from-white/20 to-white/5 flex items-center justify-center text-[10px] font-bold text-white">
                  {p.id.charAt(0).toUpperCase()}
                </div>
                <span className="flex-1 text-white font-medium truncate text-xs">
                  {p.id}
                </span>
                {p.id === gameState.host_id && (
                  <span className="text-[9px] text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded-full font-medium">
                    HOST
                  </span>
                )}
                {p.id === playerId && (
                  <span className="text-[9px] text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded-full font-medium">
                    YOU
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Map info */}
        <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-lg px-4 py-2">
          <span className="text-[10px] text-white/40">
            {gameState.map.type.replace(/_/g, " ")} &middot; {gameState.map.length}x{gameState.map.width}
          </span>
        </div>

        {/* Start button or waiting */}
        {isHost ? (
          <button
            onClick={onStart}
            disabled={players.length < 2}
            className="px-10 py-3 rounded-xl font-bold text-base bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/25 hover:shadow-green-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {players.length < 2
              ? "Waiting for players..."
              : `Start Game (${players.length} players)`}
          </button>
        ) : (
          <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl px-6 py-3 flex items-center gap-2">
            <span className="text-white/40 text-sm">Waiting for host to start</span>
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"
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
