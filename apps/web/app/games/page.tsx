"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { API_BASE } from "@/lib/constants";
import type { GameResult, GameResultPlayerScore, LiveGame } from "@/lib/types";

const MAP_LABELS: Record<string, { name: string; icon: string }> = {
  frozen_lake: { name: "Frozen Lake", icon: "\u2744\uFE0F" },
  tundra_ring: { name: "Tundra Ring", icon: "\uD83C\uDF28\uFE0F" },
  glacier_pass: { name: "Glacier Pass", icon: "\uD83C\uDFD4\uFE0F" },
  volcano_rim: { name: "Volcano Rim", icon: "\uD83C\uDF0B" },
  neon_arena: { name: "Neon Arena", icon: "\uD83D\uDFE3" },
};

function mapLabel(type: string) {
  return MAP_LABELS[type] || { name: type.replace(/_/g, " "), icon: "\uD83C\uDFAE" };
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

function timeAgo(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return formatDate(value);
}

function sortScores(scores: GameResultPlayerScore[]) {
  return [...scores].sort((a, b) => {
    if (a.score === b.score) return a.eliminated_round - b.eliminated_round;
    return b.score - a.score;
  });
}

function playerDisplayName(score: GameResultPlayerScore): string {
  if (score.username) return score.username;
  if (score.player_id.startsWith("anonymous_")) return score.player_id.slice(10);
  return score.player_id;
}

const PODIUM_COLORS = ["#FFB800", "#C0C0C0", "#CD7F32"];

export default function GamesPage() {
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [pastGames, setPastGames] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [liveRes, pastRes] = await Promise.allSettled([
      fetch(`${API_BASE}/v1/game/live`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_BASE}/v1/game/latest?limit=20`, { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : [],
      ),
    ]);
    setLiveGames(
      Array.isArray(liveRes.status === "fulfilled" ? liveRes.value : [])
        ? (liveRes as PromiseFulfilledResult<LiveGame[]>).value
        : [],
    );
    setPastGames(
      Array.isArray(pastRes.status === "fulfilled" ? pastRes.value : [])
        ? (pastRes as PromiseFulfilledResult<GameResult[]>).value
        : [],
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 8000);
    return () => clearInterval(id);
  }, [fetchData]);

  const activeLive = liveGames.filter((g) => g.player_count > 0);
  const totalPlayers = activeLive.reduce((s, g) => s + g.player_count, 0);

  return (
    <main className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 bg-[#0F0D0A]" />
      <div
        className="absolute inset-0 opacity-70"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,107,44,0.08) 0%, transparent 100%),
            radial-gradient(ellipse 60% 40% at 20% 80%, rgba(255,184,0,0.06) 0%, transparent 100%),
            radial-gradient(ellipse 50% 30% at 80% 70%, rgba(46,204,113,0.05) 0%, transparent 100%)
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

        {/* Live stats bar */}
        {activeLive.length > 0 && (
          <div
            className="rounded-2xl px-5 py-4 mb-8 flex flex-wrap items-center gap-x-6 gap-y-2"
            style={{
              background: "linear-gradient(135deg, rgba(46,204,113,0.08) 0%, rgba(46,204,113,0.02) 100%)",
              border: "1.5px solid rgba(46,204,113,0.18)",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent-green)] opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--accent-green)]" />
              </span>
              <span className="text-sm font-[family-name:var(--font-fredoka)] font-semibold text-[var(--accent-green)]">
                Live Now
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-[family-name:var(--font-bungee)] text-[var(--text-warm)]">
                {activeLive.length}
              </span>
              <span className="text-xs text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">
                {activeLive.length === 1 ? "game" : "games"}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-[family-name:var(--font-bungee)] text-[var(--text-warm)]">
                {totalPlayers}
              </span>
              <span className="text-xs text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">
                {totalPlayers === 1 ? "player" : "players"} online
              </span>
            </div>
          </div>
        )}

        {/* Live Games Section */}
        {activeLive.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl sm:text-2xl font-[family-name:var(--font-bungee)] text-[var(--text-warm)] mb-4 flex items-center gap-2.5">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent-green)] opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent-green)]" />
              </span>
              Live Games
            </h2>
            <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeLive.map((game) => {
                const map = mapLabel(game.map_type);
                const status = !game.started
                  ? "In Lobby"
                  : `Round ${game.current_round}`;

                return (
                  <Link
                    key={game.id}
                    href={`/game/${game.id}`}
                    className="group rounded-2xl overflow-hidden transition-all hover:scale-[1.015]"
                    style={{
                      background: "linear-gradient(180deg, rgba(28,24,20,0.95) 0%, rgba(15,13,10,0.98) 100%)",
                      border: "1.5px solid rgba(46,204,113,0.2)",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.3), 0 0 24px rgba(46,204,113,0.04)",
                    }}
                  >
                    {/* Card top bar */}
                    <div
                      className="px-4 py-2.5 flex items-center justify-between"
                      style={{
                        borderBottom: "1px solid rgba(46,204,113,0.1)",
                        background: "rgba(46,204,113,0.04)",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent-green)] opacity-75 animate-ping" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent-green)]" />
                        </span>
                        <span className="text-xs font-[family-name:var(--font-fredoka)] font-semibold text-[var(--accent-green)]">
                          {status}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-[var(--text-dim)] tracking-wider uppercase">
                        {game.id}
                      </span>
                    </div>

                    {/* Card body */}
                    <div className="px-4 py-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                          style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          {map.icon}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-[family-name:var(--font-fredoka)] font-semibold text-[var(--text-warm)] truncate">
                            {map.name}
                          </p>
                          <p className="text-xs text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">
                            {game.player_count} {game.player_count === 1 ? "player" : "players"}
                          </p>
                        </div>
                      </div>

                      <span
                        className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-[family-name:var(--font-fredoka)] font-semibold transition-colors group-hover:bg-[var(--accent-green)] group-hover:text-[#0F0D0A]"
                        style={{
                          background: "rgba(46,204,113,0.12)",
                          color: "var(--accent-green)",
                          border: "1px solid rgba(46,204,113,0.2)",
                        }}
                      >
                        {game.started ? "Watch" : "Join"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Match History */}
        <section>
          <div className="flex items-baseline justify-between mb-4 gap-3">
            <h2 className="text-xl sm:text-2xl font-[family-name:var(--font-bungee)] text-gradient-warm">
              Match History
            </h2>
            {pastGames.length > 0 && (
              <span className="text-xs text-[var(--text-dim)] font-[family-name:var(--font-fredoka)] shrink-0">
                {pastGames.length} recent
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2.5 h-2.5 rounded-full bg-[var(--accent-orange)] animate-pulse"
                    style={{ animationDelay: `${i * 0.2}s` }}
                  />
                ))}
              </div>
            </div>
          ) : pastGames.length === 0 ? (
            <div
              className="rounded-2xl p-8 sm:p-12 text-center max-w-lg mx-auto"
              style={{
                background: "linear-gradient(180deg, rgba(28,24,20,0.8) 0%, rgba(15,13,10,0.9) 100%)",
                border: "1.5px solid rgba(255,184,0,0.12)",
                boxShadow: "0 12px 32px rgba(0,0,0,0.3)",
              }}
            >
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
                style={{
                  background: "rgba(255,184,0,0.06)",
                  border: "1.5px solid rgba(255,184,0,0.12)",
                }}
              >
                <span className="text-3xl">&#x1F3C6;</span>
              </div>
              <p className="text-lg text-[var(--text-warm)] font-[family-name:var(--font-fredoka)] font-semibold">
                No games recorded yet
              </p>
              <p className="mt-1.5 text-sm text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">
                Complete a match to see results here
              </p>
              <Link
                href="/create"
                className="game-btn-primary inline-block mt-5 px-8 py-3 text-sm font-[family-name:var(--font-fredoka)] rounded-xl"
              >
                Play Now
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {pastGames.map((game) => {
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
                    {/* Card header */}
                    <div
                      className="px-4 py-2.5 flex items-center justify-between"
                      style={{
                        borderBottom: "1px solid rgba(255,184,0,0.08)",
                        background: "rgba(255,184,0,0.03)",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-[family-name:var(--font-bungee)] text-[var(--accent-gold)]">
                          {game.round}
                        </span>
                        <span className="text-xs text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">
                          {game.round === 1 ? "round" : "rounds"}
                        </span>
                        <span className="text-[var(--text-dim)] text-xs">/</span>
                        <span className="text-xs text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">
                          {game.player_scores.length}p
                        </span>
                      </div>
                      <span className="text-[10px] text-[var(--text-dim)] font-[family-name:var(--font-fredoka)]">
                        {timeAgo(game.played_at)}
                      </span>
                    </div>

                    <div className="px-4 py-3.5 space-y-2.5">
                      {/* Winner highlight */}
                      {winner && (
                        <div
                          className="rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2"
                          style={{
                            background: "linear-gradient(135deg, rgba(255,184,0,0.1) 0%, rgba(255,184,0,0.03) 100%)",
                            border: "1px solid rgba(255,184,0,0.18)",
                          }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-base">&#x1F3C6;</span>
                            <div className="min-w-0">
                              <p className="text-[8px] uppercase tracking-[0.15em] text-[var(--accent-gold)] font-[family-name:var(--font-fredoka)] font-semibold leading-none mb-0.5">
                                Winner
                              </p>
                              <p className="text-sm text-[var(--text-warm)] font-[family-name:var(--font-fredoka)] font-semibold truncate leading-tight">
                                {playerDisplayName(winner)}
                              </p>
                            </div>
                          </div>
                          <span className="text-base text-[var(--accent-gold)] font-[family-name:var(--font-bungee)] tabular-nums shrink-0">
                            {winner.score}
                          </span>
                        </div>
                      )}

                      {/* Runner-ups */}
                      {topThree.slice(1).map((score, i) => (
                        <div
                          key={`${game.id}-${score.player_id}`}
                          className="flex items-center justify-between rounded-lg px-3 py-1.5 text-xs"
                          style={{
                            background: "rgba(255,255,255,0.02)",
                            border: "1px solid rgba(255,255,255,0.04)",
                          }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="font-[family-name:var(--font-bungee)] text-[10px] w-4 text-center shrink-0"
                              style={{ color: PODIUM_COLORS[i + 1] || "var(--text-dim)" }}
                            >
                              {i + 2}
                            </span>
                            <span className="text-[var(--text-warm)] font-[family-name:var(--font-fredoka)] truncate">
                              {playerDisplayName(score)}
                            </span>
                          </div>
                          <span className="text-[var(--accent-gold)] font-[family-name:var(--font-bungee)] text-[10px] tabular-nums shrink-0 ml-2">
                            {score.score}
                          </span>
                        </div>
                      ))}

                      {/* Footer */}
                      <div className="flex items-center justify-between text-[10px] text-[var(--text-dim)] font-[family-name:var(--font-fredoka)] pt-0.5">
                        <span className="font-mono text-[9px] tracking-wider opacity-60 uppercase">
                          {game.id}
                        </span>
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
        </section>
      </div>
    </main>
  );
}
