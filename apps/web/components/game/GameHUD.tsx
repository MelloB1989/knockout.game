"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/lib/game-store";
import { useAuthStore } from "@/lib/auth-store";

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
  const total = players.length;

  // Sort: alive first (by score desc), then eliminated (by round desc)
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
        className="w-full max-w-[26rem] rounded-none px-3 py-3"
        style={{
          background:
            "linear-gradient(180deg, rgba(8,12,18,0.94) 0%, rgba(16,21,29,0.92) 100%)",
          border: "1px solid rgba(169, 196, 222, 0.18)",
          boxShadow: "0 18px 40px rgba(0,0,0,0.32)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#9db1c3] font-[family-name:var(--font-geist-sans)]">
            Current Game
          </p>
          <p className="text-[11px] text-[#d6e1ec] font-[family-name:var(--font-geist-sans)]">
            Hold TAB
          </p>
        </div>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {sortedPlayers.map((p) => (
            <div
              key={p.id}
              className={`flex items-center gap-2 rounded-none border px-2.5 py-2 ${
                p.id === playerId
                  ? "bg-sky-300/[0.08] border-sky-300/[0.16]"
                  : "bg-white/[0.04] border-white/[0.06]"
              }`}
            >
              <div
                className={`w-2.5 h-2.5 rounded-none ${
                  p.eliminated === 0 ? "bg-green-400" : "bg-red-400"
                }`}
              />
              <span className="flex-1 truncate text-[var(--text-warm)] text-sm font-medium font-[family-name:var(--font-geist-sans)]">
                {p.id}
              </span>
              <span className="shrink-0 text-[11px] text-[var(--text-muted)] font-[family-name:var(--font-geist-sans)]">
                {p.eliminated === 0 ? "Alive" : `Eliminated R${p.eliminated}`}
              </span>
              <span className="text-sm text-[var(--accent-gold)] font-semibold tabular-nums font-[family-name:var(--font-geist-mono)]">
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
      <div className="flex justify-between items-start p-3">
        {/* Round info */}
        <div
          className="backdrop-blur-sm rounded-none px-4 py-2.5"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,12,18,0.9) 0%, rgba(16,21,29,0.88) 100%)",
            border: "1px solid rgba(169, 196, 222, 0.16)",
            boxShadow: "0 12px 28px rgba(0,0,0,0.25)",
          }}
        >
          <p className="text-[10px] text-[#9db1c3] uppercase tracking-[0.2em] font-[family-name:var(--font-geist-sans)] font-medium">
            Round
          </p>
          <p className="text-2xl font-[family-name:var(--font-geist-mono)] font-semibold text-[var(--accent-gold)] tabular-nums">
            {currentRound}
          </p>
        </div>

        {/* Player scoreboard */}
        <div
          className="backdrop-blur-sm rounded-none px-2.5 py-2.5 min-w-[180px]"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,12,18,0.9) 0%, rgba(16,21,29,0.88) 100%)",
            border: "1px solid rgba(169, 196, 222, 0.16)",
            boxShadow: "0 12px 28px rgba(0,0,0,0.25)",
          }}
        >
          <p className="text-[10px] text-[#9db1c3] uppercase tracking-[0.2em] mb-2 font-[family-name:var(--font-geist-sans)] font-medium">
            Players
          </p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {sortedPlayers.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 rounded-none border px-2.5 py-1.5 text-[11px] ${
                  p.id === playerId
                    ? "bg-sky-300/[0.08] border-sky-300/[0.16]"
                    : "bg-white/[0.04] border-white/[0.05]"
                } ${p.eliminated > 0 ? "opacity-40" : ""}`}
              >
                <div
                  className={`w-2 h-2 rounded-none ${
                    p.eliminated === 0 ? "bg-green-400" : "bg-red-400"
                  }`}
                />
                <span className="flex-1 text-[var(--text-warm)] font-medium truncate max-w-[100px] font-[family-name:var(--font-geist-sans)]">
                  {p.id}
                </span>
                <span className="text-[var(--accent-gold)] tabular-nums font-semibold font-[family-name:var(--font-geist-mono)]">
                  {p.score ?? 0}
                </span>
                {p.eliminated > 0 && (
                  <span className="text-[9px] text-red-400/60 font-[family-name:var(--font-geist-sans)]">
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
              className="rounded-none px-3 py-1.5 text-[13px] font-medium animate-pulse font-[family-name:var(--font-fredoka)]"
              style={{
                background: "rgba(239,68,68,0.15)",
                border: "1.5px solid rgba(239,68,68,0.3)",
                color: "#fca5a5",
              }}
            >
              {e.playerId} knocked out!
              {e.eliminatedBy && (
                <span className="text-[var(--text-muted)] ml-1">
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
