"use client";

import { useRef, useCallback, useEffect } from "react";
import { useGameStore } from "@/lib/game-store";
import { registerMove } from "@/lib/ws";

const POWER_LEVELS = [2, 4, 6, 8, 10];
const MAX_SLOTS = 10;

/** Degrees rotated per pixel of horizontal drag */
const SENSITIVITY = 0.4;

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

  const dragging = useRef(false);
  const lastX = useRef(0);
  const sendThrottle = useRef(0);

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

    // Throttle server updates to ~20fps
    const now = Date.now();
    if (now - sendThrottle.current > 50) {
      sendThrottle.current = now;
      sendCurrentAim();
    }
  }, []);

  const onDragEnd = useCallback(() => {
    if (dragging.current) {
      dragging.current = false;
      // Send final position
      sendCurrentAim();
    }
  }, []);

  /* ── Send initial aim when countdown starts ── */
  useEffect(() => {
    if (phase === "countdown" && !moveSubmitted) {
      // Small delay to let aimDirection initialize from player state
      const t = setTimeout(() => sendCurrentAim(), 200);
      return () => clearTimeout(t);
    }
  }, [phase, currentRound, moveSubmitted]);

  /* ── Global pointer + keyboard listeners ── */
  useEffect(() => {
    if (phase !== "countdown") return;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) onDragStart(e.clientX); // left click only
    };
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
  }, [phase, onDragStart, onDragMove, onDragEnd, decreasePower, increasePower]);

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
            Drag to aim &middot; Scroll to zoom &middot; Right-drag to tilt
          </div>
        )}
      </div>

      {/* ── Bottom: Power bar ── */}
      <div className="pointer-events-auto pb-4 px-4">
        <div className="max-w-lg mx-auto flex flex-col gap-2">
          {/* Power label */}
          <div className="flex items-center justify-center">
            <div className="bg-black/60 backdrop-blur-sm border border-white/15 rounded-lg px-4 py-2">
              <span className="text-white font-bold text-sm">
                Power {aimPower}
              </span>
            </div>
          </div>

          {/* Power bar with Q/E controls */}
          <div className="flex items-center justify-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); decreasePower(); }}
              disabled={moveSubmitted}
              className="w-9 h-9 rounded-lg bg-black/70 border border-white/20 text-white font-bold text-sm flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all"
            >
              Q
            </button>

            <div className="flex gap-0.5 mx-1">
              {Array.from({ length: MAX_SLOTS }).map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    const level = POWER_LEVELS[Math.min(Math.floor(i / 2), POWER_LEVELS.length - 1)]!;
                    useGameStore.getState().setAimPower(level);
                    sendCurrentAim();
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

            <button
              onClick={(e) => { e.stopPropagation(); increasePower(); }}
              disabled={moveSubmitted}
              className="w-9 h-9 rounded-lg bg-black/70 border border-white/20 text-white font-bold text-sm flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all"
            >
              E
            </button>
          </div>

          <div className="text-center">
            <span className="text-[10px] text-white/25">Q/E: Power &middot; Drag: Aim</span>
          </div>
        </div>
      </div>
    </div>
  );
}
