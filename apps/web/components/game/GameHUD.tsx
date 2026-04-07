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
        <div
          className="backdrop-blur-sm rounded-2xl px-5 py-3"
          style={{
            background: "linear-gradient(135deg, rgba(15,13,10,0.8) 0%, rgba(25,20,14,0.8) 100%)",
            border: "2px solid var(--border-warm)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-widest font-[family-name:var(--font-fredoka)] font-semibold">
            Round
          </p>
          <p className="text-2xl font-[family-name:var(--font-bungee)] text-[var(--accent-gold)] tabular-nums">
            {currentRound}
          </p>
        </div>

        {/* Player scoreboard */}
        <div
          className="backdrop-blur-sm rounded-2xl px-3 py-2.5 min-w-[170px]"
          style={{
            background: "linear-gradient(135deg, rgba(15,13,10,0.8) 0%, rgba(25,20,14,0.8) 100%)",
            border: "2px solid var(--border-warm)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-widest mb-1.5 font-[family-name:var(--font-fredoka)] font-semibold">
            Players
          </p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {sortedPlayers.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs ${
                  p.id === playerId
                    ? "bg-[var(--accent-orange)]/10"
                    : ""
                } ${p.eliminated > 0 ? "opacity-40" : ""}`}
              >
                <div className={`w-2 h-2 rounded-full ${
                  p.eliminated === 0 ? "bg-green-400" : "bg-red-400"
                }`} />
                <span className="flex-1 text-[var(--text-warm)] font-medium truncate max-w-[80px] font-[family-name:var(--font-fredoka)]">
                  {p.id}
                </span>
                <span className="text-[var(--accent-gold)] tabular-nums font-bold font-[family-name:var(--font-fredoka)]">
                  {p.score ?? 0}
                </span>
                {p.eliminated > 0 && (
                  <span className="text-[9px] text-red-400/60 font-[family-name:var(--font-fredoka)]">
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
        <div className="flex flex-col items-center gap-1.5 mt-2">
          {eliminatedThisRound.map((e) => (
            <div
              key={e.playerId}
              className="rounded-xl px-5 py-2 text-sm font-medium animate-pulse font-[family-name:var(--font-fredoka)]"
              style={{
                background: "rgba(239,68,68,0.15)",
                border: "1.5px solid rgba(239,68,68,0.3)",
                color: "#fca5a5",
              }}
            >
              {e.playerId} knocked out!
              {e.eliminatedBy && (
                <span className="text-[var(--text-muted)] ml-1">by {e.eliminatedBy}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Animating phase indicator */}
      {phase === "animating" && (
        <div className="flex justify-center mt-4">
          <div
            className="rounded-full px-5 py-2 text-sm font-semibold font-[family-name:var(--font-fredoka)]"
            style={{
              background: "rgba(255,184,0,0.15)",
              border: "1.5px solid rgba(255,184,0,0.3)",
              color: "var(--accent-gold)",
            }}
          >
            Moves playing...
          </div>
        </div>
      )}
    </div>
  );
}
