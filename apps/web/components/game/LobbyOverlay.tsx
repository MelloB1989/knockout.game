"use client";

import { useMemo, useState } from "react";
import { useGameStore } from "@/lib/game-store";

interface LobbyOverlayProps {
  gameId: string;
  playerId: string;
  onStart: () => void;
}

const cardStyle = {
  background:
    "linear-gradient(180deg, rgba(10,15,21,0.94) 0%, rgba(19,26,36,0.92) 100%)",
  border: "1px solid rgba(169, 196, 222, 0.18)",
  boxShadow:
    "0 10px 22px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)",
};

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

  return (
    <div className="absolute inset-0 z-30 pointer-events-none px-3 py-3 sm:px-4 sm:py-4">
      <div
        className="pointer-events-auto absolute left-4 top-4 space-y-3 sm:left-6 sm:top-6"
        style={{ width: "min(22rem, calc(100vw - 1rem))" }}
      >
        <div className="rounded-none px-2.5 py-2.5 sm:px-3" style={cardStyle}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#9db1c3] font-[family-name:var(--font-geist-sans)]">
                Game Code
              </p>
              <p className="mt-1 text-xs leading-snug text-[#d4deea] font-[family-name:var(--font-geist-sans)]">
                Share this code to bring everyone onto the stage.
              </p>
            </div>
            <button
              onClick={handleCopy}
              className="shrink-0 rounded-none border px-2 py-1 text-[11px] font-medium text-[#f5f8fc] transition-colors hover:bg-[#182331] font-[family-name:var(--font-geist-sans)]"
              style={{
                background: "rgba(20, 30, 43, 0.92)",
                borderColor: "rgba(170, 197, 222, 0.28)",
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-2.5 rounded-none border border-white/10 bg-[#111924]/88 px-2.5 py-1.5">
            <code className="block overflow-hidden text-ellipsis whitespace-nowrap text-center font-[family-name:var(--font-geist-mono)] text-[1.8rem] font-semibold tracking-[0.12em] text-[#fff6e9] sm:text-[2.1rem]">
              {gameId}
            </code>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            mapLabel,
            `${gameState.map.length} x ${gameState.map.width}`,
            "WASD walk",
            "Drag camera",
          ].map((label) => (
            <span
              key={label}
              className="rounded-none border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-[#d6e1ec] font-[family-name:var(--font-geist-sans)]"
              style={{
                background: "rgba(10, 15, 22, 0.78)",
                borderColor: "rgba(169, 196, 222, 0.14)",
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      <div
        className="pointer-events-auto absolute bottom-4 left-4 space-y-3 sm:bottom-6 sm:left-6"
        style={{ width: "min(24rem, calc(100vw - 1rem))" }}
      >
        <div className="rounded-none px-2.5 py-2.5 sm:px-3" style={cardStyle}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#9db1c3] font-[family-name:var(--font-geist-sans)]">
                Players
              </p>
              <p className="mt-1 text-[1.4rem] font-semibold text-[var(--text-warm)] font-[family-name:var(--font-geist-sans)] leading-none">
                {players.length} in room
              </p>
              <p className="mt-1.5 text-xs text-[#d4deea] font-[family-name:var(--font-geist-sans)]">
                Same roster carries into round one.
              </p>
            </div>
            <div className="shrink-0 rounded-none border border-[#a9c4de24] bg-[#101821]/80 px-2 py-0.5 text-right">
              <p className="text-[9px] uppercase tracking-[0.16em] text-[#9db1c3] font-[family-name:var(--font-geist-sans)]">
                Arena
              </p>
              <p className="mt-0.5 text-[11px] text-[#f5f8fc] font-[family-name:var(--font-geist-sans)]">
                {mapLabel}
              </p>
            </div>
          </div>

          <div className="mt-3 max-h-[36vh] space-y-2 overflow-y-auto pr-1">
            {sortedPlayers.map((p, index) => {
              const isYou = p.id === playerId;
              const isHostPlayer = p.id === gameState.host_id;

              return (
                <div
                  key={p.id}
                  className="grid grid-cols-[2rem,minmax(0,1fr),auto] items-center gap-2 rounded-none border px-2 py-2"
                  style={{
                    background: isYou
                      ? "linear-gradient(135deg, rgba(88,165,255,0.16) 0%, rgba(88,165,255,0.08) 100%)"
                      : "rgba(255,255,255,0.04)",
                    borderColor: isYou
                      ? "rgba(128,196,255,0.28)"
                      : "rgba(169,196,222,0.12)",
                  }}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-white/10 bg-white/[0.04] text-xs font-semibold text-[var(--text-warm)] font-[family-name:var(--font-geist-mono)]">
                    {index + 1}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-warm)] font-[family-name:var(--font-geist-sans)]">
                      {p.id}
                    </p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-[#9db1c3] font-[family-name:var(--font-geist-sans)]">
                      {isHostPlayer ? "Room host" : "On stage"}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {isHostPlayer && (
                      <span className="rounded-none border border-amber-200/25 bg-amber-200/10 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] text-amber-100 font-[family-name:var(--font-geist-sans)]">
                        Host
                      </span>
                    )}
                    {isYou && (
                      <span className="rounded-none border border-sky-200/25 bg-sky-200/10 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.12em] text-sky-100 font-[family-name:var(--font-geist-sans)]">
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
            className="block w-full rounded-none px-3 py-2 text-[0.85rem] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-45 font-[family-name:var(--font-geist-sans)]"
            style={{
              background:
                "linear-gradient(180deg, rgba(34,197,94,0.95) 0%, rgba(21,128,61,0.94) 100%)",
              color: "#f7fff8",
              border: "1px solid rgba(209,255,225,0.18)",
              boxShadow: "0 14px 28px rgba(21,128,61,0.24)",
            }}
          >
            {players.length < 2
              ? "Waiting for another player"
              : `Start match for ${players.length}`}
          </button>
        ) : (
          <div
            className="flex w-full items-center justify-center gap-2.5 rounded-none px-3 py-2"
            style={cardStyle}
          >
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-1.5 w-1.5 rounded-none bg-[var(--accent-orange)] animate-pulse"
                  style={{ animationDelay: `${i * 0.25}s` }}
                />
              ))}
            </div>
            <span className="text-xs text-[#f5f8fc] font-[family-name:var(--font-geist-sans)]">
              Waiting for host to start
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
