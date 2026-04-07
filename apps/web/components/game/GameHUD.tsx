"use client";

import { useGameStore } from "@/lib/game-store";

export default function GameHUD() {
  const { gameState, phase, currentRound, eliminatedThisRound, roundMoves } =
    useGameStore();

  if (!gameState || phase === "lobby" || phase === "ended" || phase === "countdown") return null;

  const players = Object.values(gameState.players);
  const alive = players.filter((p) => p.eliminated === 0);
  const total = players.length;

  return (
    <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
      <div className="flex justify-between items-start p-4">
        {/* Round info */}
        <div className="bg-black/50 backdrop-blur-sm rounded-xl px-4 py-2 border border-white/10">
          <p className="text-xs text-white/40 uppercase tracking-widest">
            Round
          </p>
          <p className="text-2xl font-black text-white tabular-nums">
            {currentRound}
          </p>
        </div>

        {/* Player count */}
        <div className="bg-black/50 backdrop-blur-sm rounded-xl px-4 py-2 border border-white/10">
          <p className="text-xs text-white/40 uppercase tracking-widest">
            Alive
          </p>
          <p className="text-2xl font-black text-white tabular-nums">
            {alive.length}
            <span className="text-sm text-white/30 font-normal">/{total}</span>
          </p>
        </div>
      </div>

      {/* Elimination notices */}
      {eliminatedThisRound.length > 0 && (
        <div className="flex flex-col items-center gap-1 mt-2">
          {eliminatedThisRound.map((pid) => (
            <div
              key={pid}
              className="bg-red-500/20 border border-red-500/30 rounded-lg px-4 py-1.5 text-sm text-red-300 font-medium animate-pulse"
            >
              {pid} knocked out!
            </div>
          ))}
        </div>
      )}

      {/* Animating phase indicator */}
      {phase === "animating" && (
        <div className="flex justify-center mt-4">
          <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg px-4 py-1.5 text-sm text-yellow-300 font-medium">
            Moves playing...
          </div>
        </div>
      )}
    </div>
  );
}
