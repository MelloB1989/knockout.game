import Link from "next/link";
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

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8 sm:py-12">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-dim)] font-[family-name:var(--font-fredoka)]">
              Match History
            </p>
            <h1 className="text-3xl sm:text-5xl font-[family-name:var(--font-bungee)] text-gradient-warm">
              Latest Games
            </h1>
            <p className="mt-2 text-sm text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">
              Fresh results from the arena
            </p>
          </div>
          <div className="flex gap-3 mt-4 sm:mt-0">
            <Link
              href="/"
              className="game-btn-secondary px-5 py-2 text-sm font-[family-name:var(--font-fredoka)] rounded-xl"
            >
              Home
            </Link>
            <Link
              href="/create"
              className="game-btn-primary px-5 py-2 text-sm font-[family-name:var(--font-fredoka)] rounded-xl"
            >
              Create Game
            </Link>
          </div>
        </div>

        {games.length === 0 ? (
          <div
            className="mt-12 rounded-2xl px-6 py-10 text-center"
            style={{
              background: "linear-gradient(180deg, rgba(28,24,20,0.8) 0%, rgba(15,13,10,0.9) 100%)",
              border: "1.5px solid rgba(255,184,0,0.12)",
              boxShadow: "0 12px 32px rgba(0,0,0,0.3)",
            }}
          >
            <div className="text-5xl mb-4">&#x1F3AE;</div>
            <p className="text-lg text-[var(--text-warm)] font-[family-name:var(--font-fredoka)] font-semibold">
              No games recorded yet
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">
              Play a match to see results here
            </p>
            <Link
              href="/create"
              className="game-btn-primary inline-block mt-6 px-8 py-3 text-sm font-[family-name:var(--font-fredoka)] rounded-xl"
            >
              Play Now
            </Link>
          </div>
        ) : (
          <div className="mt-8 sm:mt-10 grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
                    className="px-4 py-3"
                    style={{
                      borderBottom: "1px solid rgba(255,184,0,0.08)",
                      background: "rgba(255,184,0,0.03)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full bg-[var(--accent-green)]"
                          style={{ boxShadow: "0 0 6px rgba(46,204,113,0.4)" }}
                        />
                        <span className="text-xs text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">
                          {game.rounds} rounds
                        </span>
                      </div>
                      <span className="text-[10px] text-[var(--text-dim)] font-[family-name:var(--font-fredoka)]">
                        {formatDate(game.played_at)}
                      </span>
                    </div>
                  </div>

                  <div className="px-4 py-4 space-y-3">
                    {/* Winner */}
                    {winner && (
                      <div
                        className="rounded-xl px-3 py-2.5"
                        style={{
                          background: "linear-gradient(135deg, rgba(255,184,0,0.1) 0%, rgba(255,184,0,0.03) 100%)",
                          border: "1px solid rgba(255,184,0,0.18)",
                        }}
                      >
                        <p className="text-[9px] uppercase tracking-widest text-[var(--accent-gold)] font-[family-name:var(--font-fredoka)] font-semibold mb-1">
                          Winner
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-[var(--text-warm)] font-[family-name:var(--font-fredoka)] font-semibold truncate">
                            {playerDisplayName(winner)}
                          </span>
                          <span className="text-base text-[var(--accent-gold)] font-[family-name:var(--font-bungee)] tabular-nums">
                            {winner.score}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Top scores */}
                    <div className="space-y-1">
                      {topThree.map((score, i) => (
                        <div
                          key={`${game.id}-${score.player_id}`}
                          className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs"
                          style={{
                            background: "rgba(255,255,255,0.02)",
                            borderColor: "rgba(255,255,255,0.05)",
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="font-[family-name:var(--font-bungee)] text-[10px]"
                              style={{ color: PODIUM_COLORS[i] || "var(--text-dim)" }}
                            >
                              {i + 1}
                            </span>
                            <span className="text-[var(--text-warm)] font-[family-name:var(--font-fredoka)] truncate">
                              {playerDisplayName(score)}
                            </span>
                          </div>
                          <span className="text-[var(--accent-gold)] font-[family-name:var(--font-bungee)] text-[11px] tabular-nums">
                            {score.score}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Footer stats */}
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-dim)] font-[family-name:var(--font-fredoka)] pt-1">
                      <span>{game.player_scores.length} players</span>
                      <span>
                        {sorted.filter((p) => p.eliminated_round > 0).length} knocked out
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
