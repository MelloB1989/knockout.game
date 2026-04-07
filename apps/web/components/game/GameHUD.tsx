"use client";

import { useGameStore } from "@/lib/game-store";
import { useAuthStore } from "@/lib/auth-store";

export default function GameHUD() {
  const { gameState, phase, currentRound, eliminatedThisRound, roundMoves } =
    useGameStore();
  const { playerId } = useAuthStore();

  if (!gameState || phase === "lobby" || phase === "ended" || phase === "countdown") return null;

  const players = Object.values(gameState.players);
  const alive = players.filter((p) => p.eliminated === 0);
  const total = players.length;

  // Sort: alive first (by score desc), then eliminated (by round desc)
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.eliminated === 0 && b.eliminated !== 0) return -1;
    if (b.eliminated === 0 && a.eliminated !== 0) return 1;
    if (a.eliminated === 0 && b.eliminated === 0) return (b.score ?? 0) - (a.score ?? 0);
    return b.eliminated - a.eliminated;
  });

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

        {/* Player scoreboard */}
        <div className="bg-black/50 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/10 min-w-[160px]">
          <p className="text-[10px] text-white/40 uppercase tracking-widest mb-1.5">
            Players
          </p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {sortedPlayers.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
                  p.id === playerId
                    ? "bg-cyan-500/10"
                    : ""
                } ${p.eliminated > 0 ? "opacity-40" : ""}`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${
                  p.eliminated === 0 ? "bg-green-400" : "bg-red-400"
                }`} />
                <span className="flex-1 text-white font-medium truncate max-w-[80px]">
                  {p.id}
                </span>
                <span className="text-white/60 tabular-nums font-bold">
                  {p.score ?? 0}
                </span>
                {p.eliminated > 0 && (
                  <span className="text-[9px] text-red-400/60">
                    R{p.eliminated}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Elimination notices */}
      {eliminatedThisRound.length > 0 && (
        <div className="flex flex-col items-center gap-1 mt-2">
          {eliminatedThisRound.map((e) => (
            <div
              key={e.playerId}
              className="bg-red-500/20 border border-red-500/30 rounded-lg px-4 py-1.5 text-sm text-red-300 font-medium animate-pulse"
            >
              {e.playerId} knocked out!
              {e.eliminatedBy && (
                <span className="text-white/50 ml-1">by {e.eliminatedBy}</span>
              )}
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
