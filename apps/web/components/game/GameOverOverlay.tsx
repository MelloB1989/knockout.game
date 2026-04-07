"use client";

import { useGameStore } from "@/lib/game-store";
import { useAuthStore } from "@/lib/auth-store";

interface GameOverOverlayProps {
  onPlayAgain: () => void;
}

export default function GameOverOverlay({ onPlayAgain }: GameOverOverlayProps) {
  const { winnerId, gameState, currentRound } = useGameStore();
  const { playerId } = useAuthStore();

  const isWinner = winnerId === playerId;
  const players = gameState ? Object.values(gameState.players) : [];
  const myPlayer = players.find((p) => p.id === playerId);
  const eliminatedRound = myPlayer?.eliminated || 0;

  // Sort by: winner first, then by score desc, then by elimination round desc
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.eliminated === 0 && b.eliminated !== 0) return -1;
    if (b.eliminated === 0 && a.eliminated !== 0) return 1;
    if (a.eliminated === 0 && b.eliminated === 0) return (b.score ?? 0) - (a.score ?? 0);
    if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
    return b.eliminated - a.eliminated;
  });

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div className="bg-[var(--bg-card)]/95 border border-[var(--border-warm)] rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl text-center">
        {/* Result header */}
        {isWinner ? (
          <>
            <div className="text-6xl mb-4">&#x1F3C6;</div>
            <h1 className="text-4xl font-[family-name:var(--font-bungee)] text-gradient-warm mb-2">
              VICTORY!
            </h1>
            <p className="text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">You knocked them all out!</p>
          </>
        ) : winnerId ? (
          <>
            <div className="text-6xl mb-4">&#x1F4A5;</div>
            <h1 className="text-4xl font-[family-name:var(--font-bungee)] bg-gradient-to-r from-[var(--accent-red)] to-[var(--accent-orange)] bg-clip-text text-transparent mb-2">
              KNOCKED OUT
            </h1>
            <p className="text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">
              Eliminated in round {eliminatedRound}
            </p>
          </>
        ) : (
          <>
            <div className="text-6xl mb-4">&#x1F3AE;</div>
            <h1 className="text-4xl font-[family-name:var(--font-bungee)] text-[var(--text-warm)] mb-2">
              GAME OVER
            </h1>
            <p className="text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">No winner — everyone got knocked out!</p>
          </>
        )}

        {/* Scoreboard */}
        <div className="mt-6 mb-6">
          <p className="text-xs text-[var(--text-dim)] uppercase tracking-widest mb-3 font-[family-name:var(--font-fredoka)]">
            Results — {currentRound} rounds
          </p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {sortedPlayers.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center gap-3 p-2.5 rounded-lg text-sm ${
                  p.id === playerId
                    ? "bg-[var(--accent-orange)]/10 border border-[var(--accent-orange)]/20"
                    : "bg-white/5"
                }`}
              >
                <span className="w-6 text-[var(--text-dim)] font-bold text-xs font-[family-name:var(--font-fredoka)]">
                  #{i + 1}
                </span>
                <span className="flex-1 text-left text-[var(--text-warm)] font-medium truncate font-[family-name:var(--font-fredoka)]">
                  {p.id}
                </span>
                <span className="text-sm text-[var(--accent-gold)] font-bold tabular-nums mr-2">
                  {p.score ?? 0}
                </span>
                <span className="text-xs text-[var(--text-dim)] font-[family-name:var(--font-fredoka)]">
                  {p.eliminated === 0 ? (
                    <span className="text-[var(--accent-gold)]">Winner</span>
                  ) : (
                    `R${p.eliminated}`
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onPlayAgain}
          className="game-btn-primary w-full font-[family-name:var(--font-fredoka)] text-lg"
        >
          Play Again
        </button>
      </div>
    </div>
  );
}
