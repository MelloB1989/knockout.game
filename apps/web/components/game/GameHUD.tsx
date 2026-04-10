"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/lib/game-store";
import { useAuthStore } from "@/lib/auth-store";
import type { Penguin } from "@/lib/types";

function displayName(p: Penguin): string {
  if (p.username) return p.username;
  if (p.id.startsWith("anonymous_")) return p.id.slice(10);
  return p.id;
}

export default function GameHUD() {
  const { gameState, phase, currentRound, eliminatedThisRound } =
    useGameStore();
  const { playerId } = useAuthStore();
  const [showRoster, setShowRoster] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      setShowRoster(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      setShowRoster(false);
    };
    const onBlur = () => setShowRoster(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  if (!gameState) return null;

  const players = Object.values(gameState.players);
  const alive = players.filter((p) => p.eliminated === 0);

  const sortedPlayers = [...players].sort((a, b) => {
    if (a.eliminated === 0 && b.eliminated !== 0) return -1;
    if (b.eliminated === 0 && a.eliminated !== 0) return 1;
    if (a.eliminated === 0 && b.eliminated === 0)
      return (b.score ?? 0) - (a.score ?? 0);
    return b.eliminated - a.eliminated;
  });

  const rosterOverlay = showRoster ? (
    <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
      <div
        className="w-full max-w-[22rem] sm:max-w-[26rem] rounded-2xl px-4 py-4 mx-4 backdrop-blur-lg"
        style={{
          background:
            "linear-gradient(180deg, rgba(28,24,20,0.95) 0%, rgba(15,13,10,0.95) 100%)",
          border: "1.5px solid rgba(255, 184, 0, 0.2)",
          boxShadow: "0 24px 48px rgba(0,0,0,0.5), 0 0 32px rgba(255,184,0,0.05)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-widest text-[var(--text-muted)] font-[family-name:var(--font-fredoka)] font-semibold">
            Scoreboard
          </p>
          <p className="text-[10px] text-[var(--text-dim)] font-[family-name:var(--font-fredoka)]">
            Hold TAB
          </p>
        </div>
        <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
          {sortedPlayers.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
                p.id === playerId
                  ? "bg-[var(--accent-orange)]/10 border-[var(--accent-orange)]/25"
                  : "bg-white/[0.03] border-white/[0.06]"
              }`}
            >
              <span className="text-xs font-[family-name:var(--font-bungee)] text-[var(--text-dim)] w-5 text-center">
                {i + 1}
              </span>
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  p.eliminated === 0 ? "bg-[var(--accent-green)]" : "bg-[var(--accent-red)]"
                }`}
                style={{
                  boxShadow: p.eliminated === 0
                    ? "0 0 6px rgba(46,204,113,0.4)"
                    : "0 0 6px rgba(239,68,68,0.3)",
                }}
              />
              <span className="flex-1 truncate text-[var(--text-warm)] text-sm font-[family-name:var(--font-fredoka)] font-medium">
                {displayName(p)}
                {p.id === playerId && (
                  <span className="text-[var(--accent-gold)] text-[10px] ml-1.5">(you)</span>
                )}
              </span>
              <span className="shrink-0 text-[11px] text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">
                {p.eliminated === 0 ? "Alive" : `R${p.eliminated}`}
              </span>
              <span className="text-sm text-[var(--accent-gold)] font-[family-name:var(--font-bungee)] tabular-nums min-w-[1.5rem] text-right">
                {p.score ?? 0}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  ) : null;

  if (phase === "lobby" || phase === "ended" || phase === "countdown") {
    return rosterOverlay;
  }

  return (
    <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
      {rosterOverlay}
      <div className="flex justify-between items-start p-2.5 sm:p-3">
        {/* Round info */}
        <div
          className="backdrop-blur-md rounded-2xl px-3.5 py-2 sm:px-4 sm:py-2.5"
          style={{
            background: "rgba(28, 24, 20, 0.85)",
            border: "1.5px solid rgba(255, 184, 0, 0.15)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          <p className="text-[9px] sm:text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-[family-name:var(--font-fredoka)] font-medium">
            Round
          </p>
          <p className="text-xl sm:text-2xl font-[family-name:var(--font-bungee)] text-[var(--accent-gold)] tabular-nums leading-tight">
            {currentRound}
          </p>
          <p className="text-[9px] text-[var(--text-dim)] font-[family-name:var(--font-fredoka)]">
            {alive.length} alive
          </p>
        </div>

        {/* Player scoreboard */}
        <div
          className="backdrop-blur-md rounded-2xl px-2.5 py-2 sm:px-3 sm:py-2.5 min-w-[140px] sm:min-w-[180px]"
          style={{
            background: "rgba(28, 24, 20, 0.85)",
            border: "1.5px solid rgba(255, 184, 0, 0.15)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          <p className="text-[9px] sm:text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-1.5 font-[family-name:var(--font-fredoka)] font-medium">
            Players
          </p>
          <div className="space-y-1 max-h-40 sm:max-h-48 overflow-y-auto">
            {sortedPlayers.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-1.5 sm:gap-2 rounded-lg border px-2 py-1 sm:px-2.5 sm:py-1.5 text-[10px] sm:text-[11px] ${
                  p.id === playerId
                    ? "bg-[var(--accent-orange)]/8 border-[var(--accent-orange)]/20"
                    : "bg-white/[0.03] border-white/[0.05]"
                } ${p.eliminated > 0 ? "opacity-40" : ""}`}
              >
                <div
                  className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0 ${
                    p.eliminated === 0 ? "bg-[var(--accent-green)]" : "bg-[var(--accent-red)]"
                  }`}
                />
                <span className="flex-1 text-[var(--text-warm)] font-[family-name:var(--font-fredoka)] font-medium truncate max-w-[60px] sm:max-w-[100px]">
                  {displayName(p)}
                </span>
                <span className="text-[var(--accent-gold)] tabular-nums font-[family-name:var(--font-bungee)] text-[9px] sm:text-[10px]">
                  {p.score ?? 0}
                </span>
                {p.eliminated > 0 && (
                  <span className="text-[8px] sm:text-[9px] text-[var(--accent-red)]/60 font-[family-name:var(--font-fredoka)]">
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
        <div className="flex flex-col items-center gap-1.5 mt-1">
          {eliminatedThisRound.map((e) => (
            <div
              key={e.playerId}
              className="rounded-xl px-4 py-2 text-sm font-[family-name:var(--font-fredoka)] font-semibold backdrop-blur-sm animate-bounce-in"
              style={{
                background: "linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(239,68,68,0.08) 100%)",
                border: "1.5px solid rgba(239,68,68,0.35)",
                color: "#fca5a5",
                boxShadow: "0 4px 16px rgba(239,68,68,0.15)",
              }}
            >
              {e.playerId} knocked out!
              {e.eliminatedBy && (
                <span className="text-[var(--accent-gold)] ml-1.5">
                  by {e.eliminatedBy}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
