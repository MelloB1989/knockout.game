import Link from "next/link";
import Image from "next/image";
import { API_BASE } from "@/lib/constants";
import type { GameResult, GameResultPlayerScore } from "@/lib/types";

async function fetchLatestGames(): Promise<GameResult[]> {
  try {
    const res = await fetch(`${API_BASE}/v1/game/latest?limit=12`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string) {
  if (!value) return "Unknown";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return dateFormatter.format(d);
}

function sortScores(scores: GameResultPlayerScore[]) {
  return [...scores].sort((a, b) => {
    if (a.score === b.score) {
      return a.eliminated_round - b.eliminated_round;
    }
    return b.score - a.score;
  });
}

function playerDisplayName(score: GameResultPlayerScore): string {
  if (score.username) return score.username;
  if (score.player_id.startsWith("anonymous_")) return score.player_id.slice(10);
  return score.player_id;
}

const PODIUM_COLORS = ["#FFB800", "#C0C0C0", "#CD7F32"];

export default async function LatestGamesPage() {
  const games = await fetchLatestGames();

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[#0F0D0A]" />
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255, 107, 44, 0.08) 0%, transparent 100%),
            radial-gradient(ellipse 60% 40% at 20% 80%, rgba(255, 184, 0, 0.06) 0%, transparent 100%),
            radial-gradient(ellipse 50% 30% at 80% 70%, rgba(46, 204, 113, 0.05) 0%, transparent 100%)
          `,
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-8 sm:mb-10">
          <Link href="/" className="shrink-0">
            <Image src="/logo.png" alt="Knockout" width={200} height={40} className="h-8 sm:h-10 w-auto" />
          </Link>
          <div className="flex gap-2 sm:gap-3">
            <Link
              href="/"
              className="game-btn-secondary px-4 py-2 text-xs sm:text-sm font-[family-name:var(--font-fredoka)] rounded-xl"
            >
              Home
            </Link>
            <Link
              href="/create"
              className="game-btn-primary px-4 py-2 text-xs sm:text-sm font-[family-name:var(--font-fredoka)] rounded-xl"
            >
              Create Game
            </Link>
          </div>
        </div>

        {/* Title */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl font-[family-name:var(--font-bungee)] text-gradient-warm">
            Match History
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">
            Fresh results from the arena
          </p>
        </div>

        {games.length === 0 ? (
          <div
            className="rounded-2xl p-8 sm:p-12 text-center max-w-lg mx-auto"
            style={{
              background: "linear-gradient(180deg, rgba(28,24,20,0.8) 0%, rgba(15,13,10,0.9) 100%)",
              border: "1.5px solid rgba(255,184,0,0.12)",
              boxShadow: "0 12px 32px rgba(0,0,0,0.3)",
            }}
          >
            <div
              className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-5"
              style={{
                background: "rgba(255,184,0,0.06)",
                border: "1.5px solid rgba(255,184,0,0.12)",
              }}
            >
              <span className="text-4xl">&#x1F3AE;</span>
            </div>
            <p className="text-xl text-[var(--text-warm)] font-[family-name:var(--font-fredoka)] font-semibold">
              No games recorded yet
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">
              Complete a match to see results here
            </p>
            <Link
              href="/create"
              className="game-btn-primary inline-block mt-6 px-8 py-3 text-sm font-[family-name:var(--font-fredoka)] rounded-xl"
            >
              Play Now
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((game) => {
              const sorted = sortScores(game.player_scores);
              const winner = sorted[0];
              const topThree = sorted.slice(0, 3);

              return (
                <div
                  key={game.id}
                  className="rounded-2xl overflow-hidden transition-all hover:scale-[1.01]"
                  style={{
                    background: "linear-gradient(180deg, rgba(28,24,20,0.9) 0%, rgba(15,13,10,0.95) 100%)",
                    border: "1.5px solid rgba(255,184,0,0.12)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                  }}
                >
                  {/* Header */}
                  <div
                    className="px-5 py-3"
                    style={{
                      borderBottom: "1px solid rgba(255,184,0,0.08)",
                      background: "rgba(255,184,0,0.03)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-[family-name:var(--font-bungee)] text-[var(--accent-gold)]">
                          {game.round}
                        </span>
                        <span className="text-xs text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">
                          rounds
                        </span>
                        <span className="text-[var(--text-dim)]">|</span>
                        <span className="text-xs text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">
                          {game.player_scores.length} players
                        </span>
                      </div>
                      <span className="text-[10px] text-[var(--text-dim)] font-[family-name:var(--font-fredoka)]">
                        {formatDate(game.played_at)}
                      </span>
                    </div>
                  </div>

                  <div className="px-5 py-4 space-y-3">
                    {/* Winner */}
                    {winner && (
                      <div
                        className="rounded-xl px-4 py-3"
                        style={{
                          background: "linear-gradient(135deg, rgba(255,184,0,0.1) 0%, rgba(255,184,0,0.03) 100%)",
                          border: "1px solid rgba(255,184,0,0.18)",
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="text-lg">&#x1F3C6;</span>
                            <div className="min-w-0">
                              <p className="text-[9px] uppercase tracking-widest text-[var(--accent-gold)] font-[family-name:var(--font-fredoka)] font-semibold">
                                Winner
                              </p>
                              <p className="text-sm text-[var(--text-warm)] font-[family-name:var(--font-fredoka)] font-semibold truncate">
                                {playerDisplayName(winner)}
                              </p>
                            </div>
                          </div>
                          <span className="text-lg text-[var(--accent-gold)] font-[family-name:var(--font-bungee)] tabular-nums shrink-0">
                            {winner.score}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Top scores */}
                    <div className="space-y-1.5">
                      {topThree.map((score, i) => (
                        <div
                          key={`${game.id}-${score.player_id}`}
                          className="flex items-center justify-between rounded-lg px-3.5 py-2 text-xs"
                          style={{
                            background: "rgba(255,255,255,0.02)",
                            border: "1px solid rgba(255,255,255,0.05)",
                          }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="font-[family-name:var(--font-bungee)] text-[11px] w-4 text-center shrink-0"
                              style={{ color: PODIUM_COLORS[i] || "var(--text-dim)" }}
                            >
                              {i + 1}
                            </span>
                            <span className="text-[var(--text-warm)] font-[family-name:var(--font-fredoka)] truncate">
                              {playerDisplayName(score)}
                            </span>
                          </div>
                          <span className="text-[var(--accent-gold)] font-[family-name:var(--font-bungee)] text-[11px] tabular-nums shrink-0 ml-2">
                            {score.score}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Footer stats */}
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-dim)] font-[family-name:var(--font-fredoka)] pt-1">
                      <span className="font-mono text-[9px] text-[var(--text-dim)]/60">{game.id}</span>
                      <span>
                        {sorted.filter((p) => p.eliminated_round > 0).length} eliminated
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
