"use client";

import { useRef, useCallback, useEffect } from "react";
import { useGameStore } from "@/lib/game-store";
import { registerMove } from "@/lib/ws";

const POWER_LEVELS = [2, 4, 6, 8, 10];
const POWER_LABELS = ["Tap", "Light", "Med", "Strong", "MAX"];
const POWER_COLORS = ["#22d3ee", "#06b6d4", "#eab308", "#f97316", "#ef4444"];

/** Degrees rotated per pixel of horizontal drag */
const SENSITIVITY = 0.4;

export default function GameControls() {
  const phase = useGameStore((s) => s.phase);
  const countdown = useGameStore((s) => s.countdown);
  const totalCountdown = useGameStore((s) => s.totalCountdown);
  const moveSubmitted = useGameStore((s) => s.moveSubmitted);
  const currentRound = useGameStore((s) => s.currentRound);
  const aimDirection = useGameStore((s) => s.aimDirection);
  const aimPower = useGameStore((s) => s.aimPower);

  const dragging = useRef(false);
  const lastX = useRef(0);

  const powerIndex = POWER_LEVELS.indexOf(aimPower);

  /* ── Submit move ── */
  const handleSubmit = useCallback(() => {
    if (moveSubmitted) return;
    const move = useGameStore.getState().submitMove();
    if (move) registerMove(move);
  }, [moveSubmitted]);

  /* ── Drag-to-rotate handlers ── */
  const onDragStart = useCallback(
    (clientX: number) => {
      if (moveSubmitted) return;
      dragging.current = true;
      lastX.current = clientX;
    },
    [moveSubmitted]
  );

  const onDragMove = useCallback((clientX: number) => {
    if (!dragging.current) return;
    const dx = clientX - lastX.current;
    lastX.current = clientX;
    const store = useGameStore.getState();
    let newDir = store.aimDirection + dx * SENSITIVITY;
    // Normalize 0-360
    newDir = ((newDir % 360) + 360) % 360;
    store.setAimDirection(newDir);
  }, []);

  const onDragEnd = useCallback(() => {
    dragging.current = false;
  }, []);

  /* ── Global pointer listeners for drag ── */
  useEffect(() => {
    if (phase !== "countdown") return;

    const handleMouseDown = (e: MouseEvent) => onDragStart(e.clientX);
    const handleMouseMove = (e: MouseEvent) => onDragMove(e.clientX);
    const handleMouseUp = () => onDragEnd();

    const handleTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) onDragStart(t.clientX);
    };
    const handleTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) onDragMove(t.clientX);
    };
    const handleTouchEnd = () => onDragEnd();

    // Attach to window so dragging works even outside UI elements
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [phase, onDragStart, onDragMove, onDragEnd]);

  if (phase !== "countdown") return null;

  const countdownPct = totalCountdown > 0 ? countdown / totalCountdown : 0;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-between">
      {/* ── Top: Countdown bar ── */}
      <div className="pointer-events-none px-4 pt-16">
        <div className="max-w-md mx-auto">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-white/60 font-medium">Round {currentRound}</span>
            <span
              className={`text-2xl font-black tabular-nums ${
                countdown <= 3 ? "text-red-400 animate-pulse" : "text-cyan-400"
              }`}
            >
              {countdown}s
            </span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                countdown <= 3 ? "bg-red-500" : "bg-cyan-500"
              }`}
              style={{ width: `${countdownPct * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Center: Drag hint ── */}
      <div className="pointer-events-none flex items-center justify-center">
        {!moveSubmitted && (
          <div className="text-white/20 text-sm select-none flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M5 12l4-4M5 12l4 4M19 12l-4-4M19 12l-4 4" />
            </svg>
            Drag to aim
          </div>
        )}
      </div>

      {/* ── Bottom: Power + Lock ── */}
      <div className="pointer-events-auto pb-6 px-4">
        <div className="max-w-lg mx-auto flex flex-col gap-3">
          {/* Direction readout */}
          <div className="text-center">
            <span className="text-xs text-white/40 tabular-nums">
              {Math.round(aimDirection)}&deg;
            </span>
          </div>

          {/* Power selector */}
          <div className="flex justify-center gap-2">
            {POWER_LEVELS.map((level, i) => (
              <button
                key={level}
                onClick={(e) => {
                  e.stopPropagation();
                  useGameStore.getState().setAimPower(level);
                }}
                disabled={moveSubmitted}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  i <= powerIndex
                    ? "text-white shadow-sm"
                    : "bg-white/5 text-white/30 border border-white/10"
                }`}
                style={
                  i <= powerIndex
                    ? {
                        backgroundColor: POWER_COLORS[i],
                        boxShadow: `0 0 8px ${POWER_COLORS[i]}40`,
                      }
                    : undefined
                }
              >
                {POWER_LABELS[i]}
              </button>
            ))}
          </div>

          {/* Lock Aim / Submit button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSubmit();
            }}
            disabled={moveSubmitted}
            className={`w-full py-4 rounded-xl font-bold text-base transition-all ${
              moveSubmitted
                ? "bg-green-500/20 border-2 border-green-500/40 text-green-400"
                : "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50 active:scale-[0.98]"
            }`}
          >
            {moveSubmitted ? "Aim Locked!" : "Lock Aim"}
          </button>
        </div>
      </div>
    </div>
  );
}
