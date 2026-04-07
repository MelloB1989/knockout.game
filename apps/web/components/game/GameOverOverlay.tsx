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
      <div className="bg-[#12121f]/95 border border-white/10 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl text-center">
        {/* Result header */}
        {isWinner ? (
          <>
            <div className="text-6xl mb-4">&#x1F3C6;</div>
            <h1 className="text-4xl font-black bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent mb-2">
              VICTORY!
            </h1>
            <p className="text-white/50">You knocked them all out!</p>
          </>
        ) : winnerId ? (
          <>
            <div className="text-6xl mb-4">&#x1F4A5;</div>
            <h1 className="text-4xl font-black bg-gradient-to-r from-red-400 to-orange-500 bg-clip-text text-transparent mb-2">
              KNOCKED OUT
            </h1>
            <p className="text-white/50">
              Eliminated in round {eliminatedRound}
            </p>
          </>
        ) : (
          <>
            <div className="text-6xl mb-4">&#x1F3AE;</div>
            <h1 className="text-4xl font-black text-white/80 mb-2">
              GAME OVER
            </h1>
            <p className="text-white/50">No winner — everyone got knocked out!</p>
          </>
        )}

        {/* Scoreboard */}
        <div className="mt-6 mb-6">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-3">
            Results — {currentRound} rounds
          </p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {sortedPlayers.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center gap-3 p-2.5 rounded-lg text-sm ${
                  p.id === playerId
                    ? "bg-cyan-500/10 border border-cyan-500/20"
                    : "bg-white/5"
                }`}
              >
                <span className="w-6 text-white/30 font-bold text-xs">
                  #{i + 1}
                </span>
                <span className="flex-1 text-left text-white font-medium truncate">
                  {p.id}
                </span>
                <span className="text-sm text-cyan-400 font-bold tabular-nums mr-2">
                  {p.score ?? 0}
                </span>
                <span className="text-xs text-white/40">
                  {p.eliminated === 0 ? (
                    <span className="text-yellow-400">Winner</span>
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
          className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all"
        >
          Play Again
        </button>
      </div>
    </div>
  );
}
