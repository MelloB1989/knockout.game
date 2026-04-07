"use client";

import { useRef, useCallback, useEffect } from "react";
import { useGameStore } from "@/lib/game-store";
import { registerMove } from "@/lib/ws";

const POWER_LEVELS = [2, 4, 6, 8, 10];
const MAX_SLOTS = 10; // visual power slots

/** Degrees rotated per pixel of horizontal drag */
const SENSITIVITY = 0.4;

export default function GameControls() {
  const phase = useGameStore((s) => s.phase);
  const countdown = useGameStore((s) => s.countdown);
  const moveSubmitted = useGameStore((s) => s.moveSubmitted);
  const currentRound = useGameStore((s) => s.currentRound);
  const aimPower = useGameStore((s) => s.aimPower);

  const dragging = useRef(false);
  const lastX = useRef(0);

  const powerIndex = POWER_LEVELS.indexOf(aimPower);
  // Map power level to filled slots (2→2, 4→4, 6→6, 8→8, 10→10)
  const filledSlots = aimPower;

  /* ── Submit move ── */
  const handleSubmit = useCallback(() => {
    if (moveSubmitted) return;
    const move = useGameStore.getState().submitMove();
    if (move) registerMove(move);
  }, [moveSubmitted]);

  /* ── Power cycling with Q/E keys or tap ── */
  const decreasePower = useCallback(() => {
    if (moveSubmitted) return;
    const idx = POWER_LEVELS.indexOf(useGameStore.getState().aimPower);
    if (idx > 0) useGameStore.getState().setAimPower(POWER_LEVELS[idx - 1]!);
  }, [moveSubmitted]);

  const increasePower = useCallback(() => {
    if (moveSubmitted) return;
    const idx = POWER_LEVELS.indexOf(useGameStore.getState().aimPower);
    if (idx < POWER_LEVELS.length - 1) useGameStore.getState().setAimPower(POWER_LEVELS[idx + 1]!);
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
    newDir = ((newDir % 360) + 360) % 360;
    store.setAimDirection(newDir);
  }, []);

  const onDragEnd = useCallback(() => {
    dragging.current = false;
  }, []);

  /* ── Global pointer + keyboard listeners ── */
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

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "q" || e.key === "Q") decreasePower();
      if (e.key === "e" || e.key === "E") increasePower();
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    };

    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [phase, onDragStart, onDragMove, onDragEnd, decreasePower, increasePower, handleSubmit]);

  if (phase !== "countdown") return null;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-between">
      {/* ── Top: Countdown + Round ── */}
      <div className="pointer-events-none flex flex-col items-center pt-4 gap-1">
        <div className="bg-black/50 backdrop-blur-sm border border-white/10 rounded-xl px-6 py-2">
          <span className="text-white font-bold text-lg">
            Revealing aims in{" "}
            <span className={countdown <= 3 ? "text-red-400" : "text-yellow-400"}>
              {countdown}
            </span>
          </span>
        </div>
        <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-lg px-4 py-1">
          <span className="text-white/70 text-sm font-medium">Round {currentRound}</span>
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

      {/* ── Bottom: Power + Lock Aim ── */}
      <div className="pointer-events-auto pb-4 px-4">
        <div className="max-w-lg mx-auto flex flex-col gap-2">
          {/* Power label + Lock Aim button row */}
          <div className="flex items-center justify-center gap-3">
            <div className="bg-black/60 backdrop-blur-sm border border-white/15 rounded-lg px-4 py-2">
              <span className="text-white font-bold text-sm">
                Power {aimPower}
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSubmit();
              }}
              disabled={moveSubmitted}
              className={`rounded-lg px-5 py-2 font-bold text-sm transition-all border ${
                moveSubmitted
                  ? "bg-green-500/20 border-green-500/40 text-green-400"
                  : "bg-green-600/80 border-green-400/40 text-white hover:bg-green-500 active:scale-95"
              }`}
            >
              {moveSubmitted ? "Locked!" : "Lock Aim?"}
            </button>
          </div>

          {/* Power bar with Q/E controls */}
          <div className="flex items-center justify-center gap-1">
            {/* Q button */}
            <button
              onClick={(e) => { e.stopPropagation(); decreasePower(); }}
              disabled={moveSubmitted}
              className="w-9 h-9 rounded-lg bg-black/70 border border-white/20 text-white font-bold text-sm flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all"
            >
              Q
            </button>

            {/* Power slots */}
            <div className="flex gap-0.5 mx-1">
              {Array.from({ length: MAX_SLOTS }).map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Map slot index to nearest power level
                    const level = POWER_LEVELS[Math.min(Math.floor(i / 2), POWER_LEVELS.length - 1)]!;
                    useGameStore.getState().setAimPower(level);
                  }}
                  disabled={moveSubmitted}
                  className={`w-7 h-9 rounded transition-all ${
                    i < filledSlots
                      ? "bg-emerald-500 shadow-sm shadow-emerald-500/30"
                      : "bg-white/5 border border-white/10"
                  }`}
                />
              ))}
            </div>

            {/* E button */}
            <button
              onClick={(e) => { e.stopPropagation(); increasePower(); }}
              disabled={moveSubmitted}
              className="w-9 h-9 rounded-lg bg-black/70 border border-white/20 text-white font-bold text-sm flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all"
            >
              E
            </button>
          </div>

          {/* Keyboard hint */}
          <div className="text-center">
            <span className="text-[10px] text-white/25">Q/E: Power &middot; Drag: Aim &middot; Space: Lock</span>
          </div>
        </div>
      </div>
    </div>
  );
}
