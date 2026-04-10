"use client";

import { useMemo, useState } from "react";
import { useGameStore } from "@/lib/game-store";
import type { Penguin } from "@/lib/types";

interface LobbyOverlayProps {
  gameId: string;
  playerId: string;
  onStart: () => void;
}

function displayName(p: Penguin): string {
  if (p.username) return p.username;
  if (p.id.startsWith("anonymous_")) return p.id.slice(10);
  return p.id;
}

export default function LobbyOverlay({
  gameId,
  playerId,
  onStart,
}: LobbyOverlayProps) {
  const { gameState, isHost } = useGameStore();
  const [copied, setCopied] = useState(false);

  if (!gameState) return null;

  const players = Object.values(gameState.players);
  const mapLabel = gameState.map.type.replace(/_/g, " ");
  const sortedPlayers = useMemo(
    () =>
      [...players].sort((a, b) => {
        if (a.id === gameState.host_id && b.id !== gameState.host_id) return -1;
        if (b.id === gameState.host_id && a.id !== gameState.host_id) return 1;
        if (a.id === playerId && b.id !== playerId) return -1;
        if (b.id === playerId && a.id !== playerId) return 1;
        return a.id.localeCompare(b.id);
      }),
    [gameState.host_id, playerId, players],
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(gameId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/game/${gameId}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Join my Knockout game!",
          text: `Game code: ${gameId}`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }
    } catch { /* user cancelled */ }
  };

  const cardStyle = {
    background:
      "linear-gradient(180deg, rgba(28,24,20,0.93) 0%, rgba(15,13,10,0.95) 100%)",
    border: "1.5px solid rgba(255, 184, 0, 0.15)",
    boxShadow:
      "0 12px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)",
  };

  return (
    <div className="absolute inset-0 z-30 pointer-events-none px-3 py-3 sm:px-4 sm:py-4">
      {/* Top section: Game code */}
      <div
        className="pointer-events-auto absolute left-3 top-3 space-y-2.5 sm:left-5 sm:top-5"
        style={{ width: "min(22rem, calc(100vw - 1.5rem))" }}
      >
        <div className="rounded-2xl px-3.5 py-3 sm:px-4 backdrop-blur-md" style={cardStyle}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-[family-name:var(--font-fredoka)] font-semibold">
                Game Code
              </p>
              <p className="mt-1 text-xs leading-snug text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">
                Share this to invite players
              </p>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <button
                onClick={handleCopy}
                className="rounded-lg border px-2.5 py-1.5 text-[11px] font-[family-name:var(--font-fredoka)] font-semibold text-[var(--text-warm)] transition-all hover:bg-white/5 active:scale-95"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  borderColor: "rgba(255,184,0,0.2)",
                }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                onClick={handleShare}
                className="rounded-lg border px-2.5 py-1.5 text-[11px] font-[family-name:var(--font-fredoka)] font-semibold text-[var(--accent-gold)] transition-all hover:bg-[var(--accent-gold)]/5 active:scale-95 sm:hidden"
                style={{
                  background: "rgba(255,184,0,0.06)",
                  borderColor: "rgba(255,184,0,0.25)",
                }}
              >
                Share
              </button>
            </div>
          </div>
          <div
            className="mt-2.5 rounded-xl border px-3 py-2"
            style={{
              background: "rgba(15, 13, 10, 0.6)",
              borderColor: "rgba(255, 184, 0, 0.1)",
            }}
          >
            <code className="block overflow-hidden text-ellipsis whitespace-nowrap text-center font-[family-name:var(--font-bungee)] text-[1.6rem] sm:text-[2rem] tracking-[0.14em] text-[var(--accent-gold)]">
              {gameId}
            </code>
          </div>
        </div>

        {/* Map info pills */}
        <div className="flex flex-wrap gap-1.5">
          {[
            mapLabel,
            `${gameState.map.length} x ${gameState.map.width}`,
          ].map((label) => (
            <span
              key={label}
              className="rounded-lg border px-2 py-1 text-[9px] uppercase tracking-widest text-[var(--text-muted)] font-[family-name:var(--font-fredoka)] font-medium backdrop-blur-sm"
              style={{
                background: "rgba(28, 24, 20, 0.8)",
                borderColor: "rgba(255, 184, 0, 0.1)",
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Bottom section: Players + Start */}
      <div
        className="pointer-events-auto absolute bottom-3 left-3 space-y-2.5 sm:bottom-5 sm:left-5"
        style={{ width: "min(24rem, calc(100vw - 1.5rem))" }}
      >
        <div className="rounded-2xl px-3.5 py-3 sm:px-4 backdrop-blur-md" style={cardStyle}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-[family-name:var(--font-fredoka)] font-semibold">
                Players
              </p>
              <p className="mt-1 text-2xl font-[family-name:var(--font-bungee)] text-[var(--text-warm)] leading-none">
                {players.length}
                <span className="text-sm text-[var(--text-muted)] font-[family-name:var(--font-fredoka)] font-medium ml-2">
                  in room
                </span>
              </p>
            </div>
            <div
              className="shrink-0 rounded-lg border px-2.5 py-1.5 text-right"
              style={{
                background: "rgba(15, 13, 10, 0.5)",
                borderColor: "rgba(255, 184, 0, 0.1)",
              }}
            >
              <p className="text-[9px] uppercase tracking-widest text-[var(--text-dim)] font-[family-name:var(--font-fredoka)]">
                Arena
              </p>
              <p className="text-xs text-[var(--text-warm)] font-[family-name:var(--font-fredoka)] font-medium capitalize">
                {mapLabel}
              </p>
            </div>
          </div>

          <div className="mt-3 max-h-[32vh] sm:max-h-[36vh] space-y-1.5 overflow-y-auto pr-1">
            {sortedPlayers.map((p, index) => {
              const isYou = p.id === playerId;
              const isHostPlayer = p.id === gameState.host_id;

              return (
                <div
                  key={p.id}
                  className="grid grid-cols-[1.75rem,minmax(0,1fr),auto] items-center gap-2 rounded-xl border px-2.5 py-2"
                  style={{
                    background: isYou
                      ? "linear-gradient(135deg, rgba(255,107,44,0.12) 0%, rgba(255,107,44,0.04) 100%)"
                      : "rgba(255,255,255,0.03)",
                    borderColor: isYou
                      ? "rgba(255,107,44,0.25)"
                      : "rgba(255,184,0,0.08)",
                  }}
                >
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-[family-name:var(--font-bungee)]"
                    style={{
                      background: "rgba(255,184,0,0.08)",
                      border: "1px solid rgba(255,184,0,0.12)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {index + 1}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-[family-name:var(--font-fredoka)] font-medium text-[var(--text-warm)]">
                      {displayName(p)}
                    </p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-widest text-[var(--text-dim)] font-[family-name:var(--font-fredoka)]">
                      {isHostPlayer ? "Room host" : "On stage"}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {isHostPlayer && (
                      <span
                        className="rounded-md px-1.5 py-0.5 text-[8px] uppercase tracking-wider font-[family-name:var(--font-fredoka)] font-semibold"
                        style={{
                          background: "rgba(255,184,0,0.12)",
                          border: "1px solid rgba(255,184,0,0.25)",
                          color: "var(--accent-gold)",
                        }}
                      >
                        Host
                      </span>
                    )}
                    {isYou && (
                      <span
                        className="rounded-md px-1.5 py-0.5 text-[8px] uppercase tracking-wider font-[family-name:var(--font-fredoka)] font-semibold"
                        style={{
                          background: "rgba(255,107,44,0.12)",
                          border: "1px solid rgba(255,107,44,0.25)",
                          color: "var(--accent-orange)",
                        }}
                      >
                        You
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {isHost ? (
          <button
            onClick={onStart}
            disabled={players.length < 2}
            className="game-btn-green block w-full rounded-xl text-sm font-[family-name:var(--font-fredoka)]"
          >
            {players.length < 2
              ? "Waiting for another player..."
              : `Start match for ${players.length}`}
          </button>
        ) : (
          <div
            className="flex w-full items-center justify-center gap-2.5 rounded-xl px-3 py-3 backdrop-blur-md"
            style={cardStyle}
          >
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-2 w-2 rounded-full bg-[var(--accent-orange)] animate-pulse"
                  style={{ animationDelay: `${i * 0.25}s` }}
                />
              ))}
            </div>
            <span className="text-sm text-[var(--text-warm)] font-[family-name:var(--font-fredoka)] font-medium">
              Waiting for host to start
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
