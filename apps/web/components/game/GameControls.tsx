"use client";

import { useCallback, useEffect } from "react";
import { useGameStore } from "@/lib/game-store";
import { registerMove } from "@/lib/ws";

const POWER_LEVELS = [2, 4, 6, 8, 10];
const MAX_SLOTS = 10;

/** Send current aim to server */
function sendCurrentAim() {
  const { aimDirection, aimPower } = useGameStore.getState();
  registerMove({ direction: aimDirection, power: aimPower });
}

export default function GameControls() {
  const phase = useGameStore((s) => s.phase);
  const countdown = useGameStore((s) => s.countdown);
  const moveSubmitted = useGameStore((s) => s.moveSubmitted);
  const currentRound = useGameStore((s) => s.currentRound);
  const aimPower = useGameStore((s) => s.aimPower);

  const filledSlots = aimPower;

  /* ── Power cycling ── */
  const decreasePower = useCallback(() => {
    if (moveSubmitted) return;
    const idx = POWER_LEVELS.indexOf(useGameStore.getState().aimPower);
    if (idx > 0) {
      useGameStore.getState().setAimPower(POWER_LEVELS[idx - 1]!);
      sendCurrentAim();
    }
  }, [moveSubmitted]);

  const increasePower = useCallback(() => {
    if (moveSubmitted) return;
    const idx = POWER_LEVELS.indexOf(useGameStore.getState().aimPower);
    if (idx < POWER_LEVELS.length - 1) {
      useGameStore.getState().setAimPower(POWER_LEVELS[idx + 1]!);
      sendCurrentAim();
    }
  }, [moveSubmitted]);

  /* ── Send initial aim when countdown starts ── */
  useEffect(() => {
    if (phase === "countdown" && !moveSubmitted) {
      const t = setTimeout(() => sendCurrentAim(), 200);
      return () => clearTimeout(t);
    }
  }, [phase, currentRound, moveSubmitted]);

  /* ── Keyboard listener for Q/E power ── */
  useEffect(() => {
    if (phase !== "countdown") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "q" || e.key === "Q") decreasePower();
      if (e.key === "e" || e.key === "E") increasePower();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [phase, decreasePower, increasePower]);

  if (phase === "lobby") {
    return (
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
        <div className="bg-black/50 backdrop-blur-sm border border-[var(--border-warm)] rounded-xl px-5 py-2.5 text-center">
          <span className="text-[var(--text-dim)] text-sm select-none font-[family-name:var(--font-fredoka)]">
            WASD to walk &middot; Drag to orbit camera
          </span>
        </div>
      </div>
    );
  }

  if (phase !== "countdown") return null;

  const isUrgent = countdown <= 3;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-between">
      {/* ── Top: Countdown banner + Round pill ── */}
      <div className="pointer-events-none flex flex-col items-center pt-4 gap-1.5">
        <div
          className="rounded-full px-10 py-2.5 shadow-lg"
          style={{
            background: "linear-gradient(135deg, rgba(15,13,10,0.85) 0%, rgba(30,25,18,0.85) 100%)",
            border: `2px solid ${isUrgent ? "var(--accent-red)" : "var(--accent-orange)"}`,
            boxShadow: isUrgent
              ? "0 0 20px rgba(239,68,68,0.3), 0 4px 12px rgba(0,0,0,0.4)"
              : "0 0 20px rgba(255,107,44,0.15), 0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          <span className="text-[var(--text-warm)] font-bold text-xl font-[family-name:var(--font-fredoka)] tracking-wide">
            Revealing aims in{" "}
            <span
              className="font-[family-name:var(--font-bungee)] text-2xl"
              style={{ color: isUrgent ? "var(--accent-red)" : "var(--accent-gold)" }}
            >
              {countdown}
            </span>
          </span>
        </div>
        <div
          className="rounded-full px-5 py-1"
          style={{
            background: "rgba(15,13,10,0.7)",
            border: "1px solid var(--border-warm)",
          }}
        >
          <span className="text-[var(--text-muted)] text-sm font-semibold font-[family-name:var(--font-fredoka)] tracking-wide">
            Round {currentRound}
          </span>
        </div>
      </div>

      {/* ── Center: Drag hint ── */}
      <div className="pointer-events-none flex items-center justify-center">
        {!moveSubmitted && (
          <div className="text-[var(--text-dim)] text-sm select-none flex items-center gap-2 font-[family-name:var(--font-fredoka)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M5 12l4-4M5 12l4 4M19 12l-4-4M19 12l-4 4" />
            </svg>
            Drag to aim &middot; Scroll to zoom
          </div>
        )}
      </div>

      {/* ── Bottom: Power bar ── */}
      <div className="pointer-events-auto pb-5 px-4">
        <div className="max-w-xl mx-auto flex flex-col gap-2 items-center">
          {/* Power label pill */}
          <div
            className="rounded-full px-6 py-1.5"
            style={{
              background: "linear-gradient(135deg, rgba(15,13,10,0.9) 0%, rgba(25,20,14,0.9) 100%)",
              border: "1.5px solid var(--border-warm)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            }}
          >
            <span className="text-[var(--text-warm)] font-bold text-base font-[family-name:var(--font-fredoka)] tracking-wide">
              Power {aimPower}
            </span>
          </div>

          {/* Power bar with Q/E controls */}
          <div
            className="flex items-center gap-2 rounded-2xl px-3 py-2.5 w-full"
            style={{
              background: "linear-gradient(135deg, rgba(15,13,10,0.9) 0%, rgba(25,20,14,0.9) 100%)",
              border: "2px solid var(--border-warm)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)",
            }}
          >
            {/* Q Button */}
            <button
              onClick={(e) => { e.stopPropagation(); decreasePower(); }}
              disabled={moveSubmitted}
              className="flex flex-col items-center gap-0.5 shrink-0 group"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center font-[family-name:var(--font-bungee)] text-xl transition-all group-hover:scale-105 group-active:scale-95"
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)",
                  border: "2px solid var(--border-warm)",
                  color: "var(--text-warm)",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
                }}
              >
                Q
              </div>
              <span className="text-[8px] text-[var(--text-dim)] font-[family-name:var(--font-fredoka)] font-semibold tracking-wider uppercase">
                or tap
              </span>
            </button>

            {/* Power slots */}
            <div className="flex gap-1 flex-1 justify-center">
              {Array.from({ length: MAX_SLOTS }).map((_, i) => {
                const isFilled = i < filledSlots;
                return (
                  <button
                    key={i}
                    onClick={(e) => {
                      e.stopPropagation();
                      const level = POWER_LEVELS[Math.min(Math.floor(i / 2), POWER_LEVELS.length - 1)]!;
                      useGameStore.getState().setAimPower(level);
                      sendCurrentAim();
                    }}
                    disabled={moveSubmitted}
                    className="flex-1 h-10 rounded-lg transition-all"
                    style={
                      isFilled
                        ? {
                            background: "linear-gradient(180deg, #2ECC71 0%, #27AE60 100%)",
                            boxShadow: "0 0 8px rgba(46,204,113,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
                            border: "1.5px solid rgba(46,204,113,0.6)",
                          }
                        : {
                            background: "rgba(255,255,255,0.03)",
                            border: "1.5px solid var(--border-warm)",
                          }
                    }
                  />
                );
              })}
            </div>

            {/* E Button */}
            <button
              onClick={(e) => { e.stopPropagation(); increasePower(); }}
              disabled={moveSubmitted}
              className="flex flex-col items-center gap-0.5 shrink-0 group"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center font-[family-name:var(--font-bungee)] text-xl transition-all group-hover:scale-105 group-active:scale-95"
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)",
                  border: "2px solid var(--border-warm)",
                  color: "var(--text-warm)",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
                }}
              >
                E
              </div>
              <span className="text-[8px] text-[var(--text-dim)] font-[family-name:var(--font-fredoka)] font-semibold tracking-wider uppercase">
                or tap
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
