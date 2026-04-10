"use client";

import { useGameStore } from "@/lib/game-store";
import { useAuthStore } from "@/lib/auth-store";
import type { Penguin } from "@/lib/types";

interface GameOverOverlayProps {
  onPlayAgain: () => void;
}

function displayName(p: Penguin): string {
  if (p.username) return p.username;
  if (p.id.startsWith("anonymous_")) return p.id.slice(10);
  return p.id;
}

const PODIUM_STYLES = [
  { bg: "linear-gradient(135deg, rgba(255,184,0,0.15) 0%, rgba(255,184,0,0.04) 100%)", border: "rgba(255,184,0,0.35)", icon: "1st", color: "#FFB800" },
  { bg: "linear-gradient(135deg, rgba(192,192,192,0.12) 0%, rgba(192,192,192,0.03) 100%)", border: "rgba(192,192,192,0.3)", icon: "2nd", color: "#C0C0C0" },
  { bg: "linear-gradient(135deg, rgba(205,127,50,0.12) 0%, rgba(205,127,50,0.03) 100%)", border: "rgba(205,127,50,0.3)", icon: "3rd", color: "#CD7F32" },
];

export default function GameOverOverlay({ onPlayAgain }: GameOverOverlayProps) {
  const { winnerId, gameState, currentRound, rematchRequested } =
    useGameStore();
  const { playerId } = useAuthStore();

  const isWinner = winnerId === playerId;
  const players = gameState ? Object.values(gameState.players) : [];
  const myPlayer = players.find((p) => p.id === playerId);
  const eliminatedRound = myPlayer?.eliminated || 0;

  const sortedPlayers = [...players].sort((a, b) => {
    if (a.eliminated === 0 && b.eliminated !== 0) return -1;
    if (b.eliminated === 0 && a.eliminated !== 0) return 1;
    if (a.eliminated === 0 && b.eliminated === 0)
      return (b.score ?? 0) - (a.score ?? 0);
    if ((b.score ?? 0) !== (a.score ?? 0))
      return (b.score ?? 0) - (a.score ?? 0);
    return b.eliminated - a.eliminated;
  });

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-lg">
      <div
        className="rounded-3xl p-5 sm:p-7 max-w-sm w-full mx-4 text-center"
        style={{
          background: "linear-gradient(180deg, rgba(28,24,20,0.97) 0%, rgba(15,13,10,0.98) 100%)",
          border: "1.5px solid rgba(255, 184, 0, 0.2)",
          boxShadow: "0 32px 64px rgba(0,0,0,0.6), 0 0 48px rgba(255,184,0,0.06)",
        }}
      >
        {/* Result header */}
        {isWinner ? (
          <>
            <div
              className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full mb-3"
              style={{
                background: "linear-gradient(135deg, rgba(255,184,0,0.2) 0%, rgba(255,107,44,0.15) 100%)",
                border: "2px solid rgba(255,184,0,0.3)",
                boxShadow: "0 0 32px rgba(255,184,0,0.2)",
              }}
            >
              <span className="text-4xl sm:text-5xl">&#x1F3C6;</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-[family-name:var(--font-bungee)] text-gradient-warm mb-1">
              VICTORY!
            </h1>
            <p className="text-[var(--text-muted)] font-[family-name:var(--font-fredoka)] text-sm">
              You knocked them all out!
            </p>
          </>
        ) : winnerId ? (
          <>
            <div
              className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full mb-3"
              style={{
                background: "linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(255,107,44,0.1) 100%)",
                border: "2px solid rgba(239,68,68,0.25)",
              }}
            >
              <span className="text-4xl sm:text-5xl">&#x1F4A5;</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-[family-name:var(--font-bungee)] bg-gradient-to-r from-[var(--accent-red)] to-[var(--accent-orange)] bg-clip-text text-transparent mb-1">
              KNOCKED OUT
            </h1>
            <p className="text-[var(--text-muted)] font-[family-name:var(--font-fredoka)] text-sm">
              Eliminated in round {eliminatedRound}
            </p>
          </>
        ) : (
          <>
            <div
              className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full mb-3"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "2px solid rgba(255,255,255,0.1)",
              }}
            >
              <span className="text-4xl sm:text-5xl">&#x1F3AE;</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-[family-name:var(--font-bungee)] text-[var(--text-warm)] mb-1">
              GAME OVER
            </h1>
            <p className="text-[var(--text-muted)] font-[family-name:var(--font-fredoka)] text-sm">
              No winner — everyone got knocked out!
            </p>
          </>
        )}

        {/* Scoreboard */}
        <div className="mt-5 mb-5">
          <p className="text-[10px] text-[var(--text-dim)] uppercase tracking-widest mb-3 font-[family-name:var(--font-fredoka)] font-semibold">
            Results — {currentRound} rounds
          </p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {sortedPlayers.map((p, i) => {
              const podium = i < 3 ? PODIUM_STYLES[i] : null;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl text-sm transition-all ${
                    p.id === playerId
                      ? "ring-1 ring-[var(--accent-orange)]/30"
                      : ""
                  }`}
                  style={{
                    background: podium
                      ? podium.bg
                      : p.id === playerId
                        ? "rgba(255,107,44,0.08)"
                        : "rgba(255,255,255,0.03)",
                    border: `1px solid ${podium ? podium.border : p.id === playerId ? "rgba(255,107,44,0.15)" : "rgba(255,255,255,0.05)"}`,
                  }}
                >
                  <span
                    className="w-7 font-[family-name:var(--font-bungee)] text-xs text-center"
                    style={{ color: podium ? podium.color : "var(--text-dim)" }}
                  >
                    {podium ? podium.icon : `#${i + 1}`}
                  </span>
                  <span className="flex-1 text-left text-[var(--text-warm)] font-[family-name:var(--font-fredoka)] font-medium truncate">
                    {displayName(p)}
                    {p.id === playerId && (
                      <span className="text-[var(--accent-gold)] text-[10px] ml-1">(you)</span>
                    )}
                  </span>
                  <span className="text-sm text-[var(--accent-gold)] font-[family-name:var(--font-bungee)] tabular-nums">
                    {p.score ?? 0}
                  </span>
                  <span className="text-xs text-[var(--text-dim)] font-[family-name:var(--font-fredoka)] min-w-[2.5rem] text-right">
                    {p.eliminated === 0 ? (
                      <span className="text-[var(--accent-gold)]">Winner</span>
                    ) : (
                      `R${p.eliminated}`
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={onPlayAgain}
          disabled={rematchRequested}
          className="game-btn-primary w-full rounded-xl font-[family-name:var(--font-fredoka)] text-base disabled:opacity-60 disabled:cursor-wait"
        >
          {rematchRequested ? "Creating Rematch..." : "Play Again"}
        </button>
      </div>
    </div>
  );
}
