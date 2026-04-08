import Link from "next/link";
import { API_BASE } from "@/lib/constants";
import type { GameResult, GameResultPlayerScore } from "@/lib/types";

async function fetchLatestGames(): Promise<GameResult[]> {
  try {
    const res = await fetch(`${API_BASE}/v1/game/latest?limit=12`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
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

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-12">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--text-dim)] font-[family-name:var(--font-fredoka)]">
              Match History
            </p>
            <h1 className="text-4xl sm:text-5xl font-[family-name:var(--font-bungee)] text-gradient-warm">
              Latest Games
            </h1>
            <p className="mt-2 text-sm text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">
              Fresh results from the arena. Winners, scores, and rounds.
            </p>
          </div>
          <div className="flex gap-3 mt-4 sm:mt-0">
            <Link
              href="/"
              className="game-btn-secondary px-5 py-2 text-sm font-[family-name:var(--font-fredoka)]"
            >
              Home
            </Link>
            <Link
              href="/create"
              className="game-btn-primary px-5 py-2 text-sm font-[family-name:var(--font-fredoka)]"
            >
              Create Game
            </Link>
          </div>
        </div>

        {games.length === 0 ? (
          <div className="mt-12 border border-[var(--border-warm)] bg-[var(--bg-card)]/80 px-6 py-8 text-center">
            <p className="text-lg text-[var(--text-warm)] font-[family-name:var(--font-fredoka)]">
              No games recorded yet.
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Play a match to see results here.
            </p>
          </div>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((game) => {
              const sorted = sortScores(game.player_scores);
              const winner = sorted[0];
              const topThree = sorted.slice(0, 3);

              return (
                <div
                  key={game.id}
                  className="border border-[var(--border-warm)] bg-[var(--bg-card)]/90 shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
                >
                  <div className="border-b border-[var(--border-warm)] px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-dim)]">
                        Game ID
                      </p>
                      <span className="text-xs text-[var(--text-muted)]">
                        {formatDate(game.played_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--text-warm)] font-[family-name:var(--font-geist-mono)]">
                      {game.id}
                    </p>
                  </div>

                  <div className="px-4 py-4 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-muted)]">Rounds</span>
                      <span className="text-[var(--accent-gold)] font-semibold tabular-nums">
                        {game.rounds}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-muted)]">Players</span>
                      <span className="text-[var(--text-warm)] font-semibold tabular-nums">
                        {game.player_scores.length}
                      </span>
                    </div>

                    <div className="border border-[var(--border-warm)] bg-black/20 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-dim)]">
                        Winner
                      </p>
                      {winner ? (
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-sm text-[var(--text-warm)] font-[family-name:var(--font-geist-sans)] truncate">
                            {winner.player_id}
                          </span>
                          <span className="text-sm text-[var(--accent-gold)] font-semibold tabular-nums">
                            {winner.score}
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm text-[var(--text-muted)]">No winner</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-dim)]">
                        Top Scores
                      </p>
                      {topThree.map((score) => (
                        <div
                          key={`${game.id}-${score.player_id}`}
                          className="flex items-center justify-between border border-white/10 bg-white/[0.03] px-3 py-2 text-xs"
                        >
                          <span className="text-[var(--text-warm)] truncate">
                            {score.player_id}
                          </span>
                          <span className="text-[var(--accent-gold)] font-semibold tabular-nums">
                            {score.score}
                          </span>
                        </div>
                      ))}
                      {topThree.length === 0 && (
                        <p className="text-xs text-[var(--text-muted)]">
                          No scores recorded.
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                      <span>Eliminations</span>
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
