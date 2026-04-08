"use client";

import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import { useGameStore } from "@/lib/game-store";
import { registerMove } from "@/lib/ws";

const POWER_LEVELS = [2, 4, 6, 8, 10];
const MAX_SLOTS = 10;
const TURN_SPEED_DEG_PER_SEC = 160;
const AIM_BROADCAST_INTERVAL_MS = 50;

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

/** Send current aim to server */
function sendCurrentAim() {
  const { aimDirection, aimPower } = useGameStore.getState();
  registerMove({ direction: aimDirection, power: aimPower });
}

export default function GameControls() {
  const phase = useGameStore((s) => s.phase);
  const countdown = useGameStore((s) => s.countdown);
  const currentRound = useGameStore((s) => s.currentRound);
  const aimPower = useGameStore((s) => s.aimPower);

  const filledSlots = aimPower;
  const turnDirRef = useRef<-1 | 0 | 1>(0);
  const leftPressedRef = useRef(false);
  const rightPressedRef = useRef(false);
  const turnFrameRef = useRef<number | null>(null);
  const lastTurnAtRef = useRef<number | null>(null);
  const lastBroadcastAtRef = useRef(0);

  const stopTurning = useCallback(() => {
    turnDirRef.current = 0;
    leftPressedRef.current = false;
    rightPressedRef.current = false;
    lastTurnAtRef.current = null;
    if (turnFrameRef.current !== null) {
      cancelAnimationFrame(turnFrameRef.current);
      turnFrameRef.current = null;
    }
  }, []);

  const turnLoop = useCallback((timestamp: number) => {
    if (useGameStore.getState().phase !== "countdown") {
      stopTurning();
      return;
    }

    const turnDir = turnDirRef.current;
    const lastTurnAt = lastTurnAtRef.current ?? timestamp;
    const dt = Math.max(0, (timestamp - lastTurnAt) / 1000);
    lastTurnAtRef.current = timestamp;

    if (turnDir !== 0 && dt > 0) {
      const store = useGameStore.getState();
      const nextAimDirection = normalizeDegrees(
        store.aimDirection + turnDir * TURN_SPEED_DEG_PER_SEC * dt,
      );
      store.setAimDirection(nextAimDirection);

      if (timestamp - lastBroadcastAtRef.current >= AIM_BROADCAST_INTERVAL_MS) {
        lastBroadcastAtRef.current = timestamp;
        registerMove({
          direction: nextAimDirection,
          power: store.aimPower,
        });
      }
    }

    turnFrameRef.current = requestAnimationFrame(turnLoop);
  }, [stopTurning]);

  const syncTurnDirection = useCallback(() => {
    const nextDir = leftPressedRef.current === rightPressedRef.current
      ? 0
      : leftPressedRef.current
        ? -1
        : 1;

    if (nextDir === 0) {
      turnDirRef.current = 0;
      lastTurnAtRef.current = null;
      return;
    }

    if (turnDirRef.current !== nextDir) {
      turnDirRef.current = nextDir;
      lastTurnAtRef.current = null;
    }

    if (turnFrameRef.current === null) {
      turnFrameRef.current = requestAnimationFrame(turnLoop);
    }
  }, [turnLoop]);

  const setTurnPressed = useCallback((dir: -1 | 1, pressed: boolean) => {
    if (dir < 0) {
      leftPressedRef.current = pressed;
    } else {
      rightPressedRef.current = pressed;
    }
    syncTurnDirection();
  }, [syncTurnDirection]);

  /* ── Power cycling ── */
  const decreasePower = useCallback(() => {
    const idx = POWER_LEVELS.indexOf(useGameStore.getState().aimPower);
    if (idx > 0) {
      useGameStore.getState().setAimPower(POWER_LEVELS[idx - 1]!);
      sendCurrentAim();
    }
  }, []);

  const increasePower = useCallback(() => {
    const idx = POWER_LEVELS.indexOf(useGameStore.getState().aimPower);
    if (idx < POWER_LEVELS.length - 1) {
      useGameStore.getState().setAimPower(POWER_LEVELS[idx + 1]!);
      sendCurrentAim();
    }
  }, []);

  /* ── Send initial aim when countdown starts ── */
  useEffect(() => {
    if (phase === "countdown") {
      lastBroadcastAtRef.current = 0;
      sendCurrentAim();
      return () => stopTurning();
    }
    stopTurning();
  }, [phase, currentRound, stopTurning]);

  /* ── Keyboard listener for turning + Q/E power ── */
  useEffect(() => {
    if (phase !== "countdown") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft") {
        e.preventDefault();
        setTurnPressed(-1, true);
      }
      if (e.key === "d" || e.key === "D" || e.key === "ArrowRight") {
        e.preventDefault();
        setTurnPressed(1, true);
      }
      if (e.key === "q" || e.key === "Q") decreasePower();
      if (e.key === "e" || e.key === "E") increasePower();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft") {
        setTurnPressed(-1, false);
      }
      if (e.key === "d" || e.key === "D" || e.key === "ArrowRight") {
        setTurnPressed(1, false);
      }
    };

    const handleBlur = () => stopTurning();

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      stopTurning();
    };
  }, [phase, decreasePower, increasePower, setTurnPressed, stopTurning]);

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

  const turnButtonProps = (dir: -1 | 1) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setTurnPressed(dir, true);
    },
    onPointerUp: () => setTurnPressed(dir, false),
    onPointerLeave: () => setTurnPressed(dir, false),
    onPointerCancel: () => setTurnPressed(dir, false),
  });

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

      {/* ── Center: Turn controls ── */}
      <div className="pointer-events-auto flex flex-col items-center justify-center gap-3 px-4">
        <div className="text-[var(--text-dim)] text-sm select-none flex items-center gap-2 text-center font-[family-name:var(--font-fredoka)]">
          Hold A / D or Arrow keys to turn your penguin.
        </div>
        <div className="flex items-center gap-3">
          <button
            {...turnButtonProps(-1)}
            className="rounded-xl px-5 py-3 text-sm font-semibold font-[family-name:var(--font-fredoka)]"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)",
              border: "2px solid var(--border-warm)",
              color: "var(--text-warm)",
              boxShadow: "0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            Turn Left
          </button>
          <button
            {...turnButtonProps(1)}
            className="rounded-xl px-5 py-3 text-sm font-semibold font-[family-name:var(--font-fredoka)]"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)",
              border: "2px solid var(--border-warm)",
              color: "var(--text-warm)",
              boxShadow: "0 2px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            Turn Right
          </button>
        </div>
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
