"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { useGameStore } from "@/lib/game-store";
import { registerMove } from "@/lib/ws";

const POWER_LEVELS = [2, 4, 6, 8, 10];
const MAX_SLOTS = 10;
const TURN_SPEED_DEG_PER_SEC = 160;
const AIM_BROADCAST_INTERVAL_MS = 50;

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function filledPowerStyle(index: number) {
  if (index >= 8) {
    return {
      background: "linear-gradient(180deg, #F87171 0%, #DC2626 100%)",
      boxShadow:
        "0 0 12px rgba(248,113,113,0.4), inset 0 1px 0 rgba(255,255,255,0.25)",
      border: "1.5px solid rgba(248,113,113,0.8)",
    };
  }

  if (index >= 4) {
    return {
      background: "linear-gradient(180deg, #FFB800 0%, #FF8F00 100%)",
      boxShadow:
        "0 0 12px rgba(255,184,0,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
      border: "1.5px solid rgba(255,184,0,0.7)",
    };
  }

  return {
    background: "linear-gradient(180deg, #34D399 0%, #10B981 100%)",
    boxShadow:
      "0 0 12px rgba(52,211,153,0.4), inset 0 1px 0 rgba(255,255,255,0.25)",
    border: "1.5px solid rgba(52,211,153,0.8)",
  };
}

function canAimCurrentPlayer() {
  const { phase, gameState } = useGameStore.getState();
  const { playerId } = useAuthStore.getState();
  const player = playerId ? gameState?.players[playerId] : undefined;
  return (
    phase === "countdown" &&
    !!player &&
    player.eliminated === 0 &&
    player.zone !== "stage"
  );
}

function sendCurrentAim() {
  if (!canAimCurrentPlayer()) return;
  const { aimDirection, aimPower } = useGameStore.getState();
  registerMove({ direction: aimDirection, power: aimPower });
}

export default function GameControls() {
  const phase = useGameStore((s) => s.phase);
  const countdown = useGameStore((s) => s.countdown);
  const currentRound = useGameStore((s) => s.currentRound);
  const aimPower = useGameStore((s) => s.aimPower);
  const gameState = useGameStore((s) => s.gameState);
  const playerId = useAuthStore((s) => s.playerId);
  const currentPlayer = playerId ? gameState?.players[playerId] : undefined;
  const canAim =
    phase === "countdown" &&
    !!currentPlayer &&
    currentPlayer.eliminated === 0 &&
    currentPlayer.zone !== "stage";
  const canWalkStage =
    !!currentPlayer &&
    currentPlayer.zone === "stage" &&
    (phase === "lobby" || currentPlayer.eliminated > 0);

  const filledSlots = aimPower;
  const turnDirRef = useRef<-1 | 0 | 1>(0);
  const leftPressedRef = useRef(false);
  const rightPressedRef = useRef(false);
  const turnFrameRef = useRef<number | null>(null);
  const lastTurnAtRef = useRef<number | null>(null);
  const lastBroadcastAtRef = useRef(0);

  // Touch aim state
  const [leftTouching, setLeftTouching] = useState(false);
  const [rightTouching, setRightTouching] = useState(false);

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

  const turnLoop = useCallback(
    (timestamp: number) => {
      if (!canAimCurrentPlayer()) {
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

        if (
          timestamp - lastBroadcastAtRef.current >=
          AIM_BROADCAST_INTERVAL_MS
        ) {
          lastBroadcastAtRef.current = timestamp;
          registerMove({
            direction: nextAimDirection,
            power: store.aimPower,
          });
        }
      }

      turnFrameRef.current = requestAnimationFrame(turnLoop);
    },
    [stopTurning],
  );

  const syncTurnDirection = useCallback(() => {
    const nextDir =
      leftPressedRef.current === rightPressedRef.current
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

  const setTurnPressed = useCallback(
    (dir: -1 | 1, pressed: boolean) => {
      if (dir < 0) {
        leftPressedRef.current = pressed;
      } else {
        rightPressedRef.current = pressed;
      }
      syncTurnDirection();
    },
    [syncTurnDirection],
  );

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

  useEffect(() => {
    if (canAim) {
      lastBroadcastAtRef.current = 0;
      sendCurrentAim();
      return () => stopTurning();
    }
    stopTurning();
  }, [canAim, currentRound, stopTurning]);

  useEffect(() => {
    if (!canAim) return;

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
  }, [canAim, decreasePower, increasePower, setTurnPressed, stopTurning]);

  if (canWalkStage) {
    return (
      <div
        className="absolute z-20 pointer-events-none"
        style={{
          left: "50%",
          transform: "translateX(-50%)",
          bottom: "max(1rem, env(safe-area-inset-bottom))",
          width: "min(30rem, calc(100vw - 1.5rem))",
        }}
      >
        <div
          className="rounded-2xl px-4 py-3 text-center backdrop-blur-md"
          style={{
            background: "rgba(28, 24, 20, 0.85)",
            border: "1px solid rgba(255, 184, 0, 0.15)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
          }}
        >
          <span className="select-none text-sm text-[var(--text-warm)] font-[family-name:var(--font-fredoka)] font-medium">
            <span className="hidden sm:inline">WASD to walk on stage</span>
            <span className="sm:hidden">Drag to move on stage</span>
            <span className="text-[var(--text-muted)] ml-2">Drag to orbit camera</span>
          </span>
        </div>
      </div>
    );
  }

  if (phase !== "countdown") return null;

  const isUrgent = countdown <= 3;
  const countdownProgress = countdown / (useGameStore.getState().totalCountdown || 10);

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      {/* Top: Countdown + Round */}
      <div className="absolute left-1/2 top-3 sm:top-4 flex -translate-x-1/2 flex-col items-center gap-2">
        <div
          className="rounded-2xl px-5 py-2.5 sm:px-6 sm:py-3 backdrop-blur-md"
          style={{
            background: isUrgent
              ? "linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(28,24,20,0.9) 100%)"
              : "linear-gradient(135deg, rgba(255,184,0,0.12) 0%, rgba(28,24,20,0.9) 100%)",
            border: `1.5px solid ${isUrgent ? "rgba(248,113,113,0.5)" : "rgba(255,184,0,0.3)"}`,
            boxShadow: isUrgent
              ? "0 0 24px rgba(239,68,68,0.2), 0 8px 24px rgba(0,0,0,0.4)"
              : "0 0 24px rgba(255,184,0,0.1), 0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          <span className="text-[var(--text-warm)] text-base sm:text-lg font-[family-name:var(--font-fredoka)] font-semibold tracking-wide">
            Revealing aims in{" "}
            <span
              className="font-[family-name:var(--font-bungee)] text-2xl sm:text-3xl"
              style={{
                color: isUrgent ? "var(--accent-red)" : "var(--accent-gold)",
                textShadow: isUrgent
                  ? "0 0 12px rgba(239,68,68,0.5)"
                  : "0 0 12px rgba(255,184,0,0.4)",
              }}
            >
              {countdown}
            </span>
          </span>
          {/* Progress bar */}
          <div className="mt-2 h-1 rounded-full overflow-hidden bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-linear"
              style={{
                width: `${countdownProgress * 100}%`,
                background: isUrgent
                  ? "linear-gradient(90deg, #EF4444, #F87171)"
                  : "linear-gradient(90deg, #FF6B2C, #FFB800)",
              }}
            />
          </div>
        </div>
        <div
          className="rounded-xl px-3 py-1 backdrop-blur-sm"
          style={{
            background: "rgba(28, 24, 20, 0.75)",
            border: "1px solid rgba(255, 184, 0, 0.12)",
          }}
        >
          <span className="text-[var(--text-muted)] text-xs font-[family-name:var(--font-fredoka)] font-medium tracking-widest uppercase">
            Round {currentRound}
          </span>
        </div>
      </div>

      {/* Bottom: Power controls */}
      {canAim && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: "50%",
            transform: "translateX(-50%)",
            bottom: "max(0.75rem, env(safe-area-inset-bottom))",
            width: "min(40rem, calc(100vw - 1rem))",
          }}
        >
          {/* Hint text */}
          <div className="mb-2 flex justify-center">
            <div
              className="rounded-xl px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] backdrop-blur-sm hidden sm:block"
              style={{
                background: "rgba(28, 24, 20, 0.8)",
                border: "1px solid rgba(255, 184, 0, 0.12)",
                color: "var(--text-muted)",
              }}
            >
              Turn with A / D or drag
            </div>
          </div>

          {/* Controls panel */}
          <div
            className="pointer-events-auto rounded-2xl px-2.5 py-3 sm:px-4 sm:py-3.5 backdrop-blur-md"
            style={{
              background:
                "linear-gradient(180deg, rgba(28,24,20,0.92) 0%, rgba(15,13,10,0.95) 100%)",
              border: "1.5px solid rgba(255, 184, 0, 0.15)",
              boxShadow:
                "0 -4px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            <div className="grid grid-cols-[2.5rem,minmax(0,1fr),2.5rem] sm:grid-cols-[3.5rem,minmax(0,1fr),3.5rem] items-end gap-2 sm:gap-3">
              {/* Left turn / Decrease power */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  decreasePower();
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  setLeftTouching(true);
                  setTurnPressed(-1, true);
                }}
                onTouchEnd={() => {
                  setLeftTouching(false);
                  setTurnPressed(-1, false);
                }}
                className={`flex w-full shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl py-2 sm:py-2.5 transition-all active:scale-95 ${
                  leftTouching ? "scale-95" : ""
                }`}
                style={{
                  background: leftTouching
                    ? "linear-gradient(180deg, rgba(255,107,44,0.2) 0%, rgba(255,107,44,0.08) 100%)"
                    : "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
                  border: `1.5px solid ${leftTouching ? "rgba(255,107,44,0.4)" : "rgba(255,184,0,0.15)"}`,
                  color: "var(--text-warm)",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                <span className="text-[8px] sm:text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">
                  Q
                </span>
              </button>

              {/* Power bar */}
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex justify-center">
                  <div
                    className="rounded-lg px-3 py-1"
                    style={{
                      background: "rgba(15, 13, 10, 0.7)",
                      border: "1px solid rgba(255, 184, 0, 0.12)",
                    }}
                  >
                    <span className="font-[family-name:var(--font-fredoka)] text-sm sm:text-base font-semibold text-[var(--text-warm)]">
                      Power{" "}
                      <span className="text-[var(--accent-gold)] font-[family-name:var(--font-bungee)] text-base sm:text-lg">
                        {aimPower}
                      </span>
                    </span>
                  </div>
                </div>

                <div
                  className="grid grid-cols-10 gap-[3px] sm:gap-1.5 rounded-xl px-2 py-2 sm:px-3 sm:py-2.5"
                  style={{
                    background: "rgba(15, 13, 10, 0.6)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    boxShadow: "inset 0 2px 4px rgba(0,0,0,0.3)",
                  }}
                >
                  {Array.from({ length: MAX_SLOTS }).map((_, i) => {
                    const isFilled = i < filledSlots;
                    return (
                      <button
                        key={i}
                        onClick={(e) => {
                          e.stopPropagation();
                          const level =
                            POWER_LEVELS[
                              Math.min(
                                Math.floor(i / 2),
                                POWER_LEVELS.length - 1,
                              )
                            ]!;
                          useGameStore.getState().setAimPower(level);
                          sendCurrentAim();
                        }}
                        className="h-7 sm:h-10 rounded-lg transition-all active:scale-95"
                        style={
                          isFilled
                            ? filledPowerStyle(i)
                            : {
                                background: "rgba(255,255,255,0.04)",
                                border: "1.5px solid rgba(255,255,255,0.08)",
                              }
                        }
                      />
                    );
                  })}
                </div>
              </div>

              {/* Right turn / Increase power */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  increasePower();
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                  setRightTouching(true);
                  setTurnPressed(1, true);
                }}
                onTouchEnd={() => {
                  setRightTouching(false);
                  setTurnPressed(1, false);
                }}
                className={`flex w-full shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl py-2 sm:py-2.5 transition-all active:scale-95 ${
                  rightTouching ? "scale-95" : ""
                }`}
                style={{
                  background: rightTouching
                    ? "linear-gradient(180deg, rgba(255,107,44,0.2) 0%, rgba(255,107,44,0.08) 100%)"
                    : "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
                  border: `1.5px solid ${rightTouching ? "rgba(255,107,44,0.4)" : "rgba(255,184,0,0.15)"}`,
                  color: "var(--text-warm)",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
                <span className="text-[8px] sm:text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-[family-name:var(--font-fredoka)]">
                  E
                </span>
              </button>
            </div>

            {/* Mobile turn buttons */}
            <div className="sm:hidden mt-2 grid grid-cols-2 gap-2">
              <button
                onTouchStart={(e) => {
                  e.stopPropagation();
                  setLeftTouching(true);
                  setTurnPressed(-1, true);
                }}
                onTouchEnd={() => {
                  setLeftTouching(false);
                  setTurnPressed(-1, false);
                }}
                className="rounded-xl py-3 text-center font-[family-name:var(--font-fredoka)] font-semibold text-sm active:scale-95 transition-all"
                style={{
                  background: leftTouching
                    ? "rgba(255,107,44,0.2)"
                    : "rgba(255,255,255,0.05)",
                  border: `1.5px solid ${leftTouching ? "rgba(255,107,44,0.4)" : "rgba(255,184,0,0.12)"}`,
                  color: "var(--text-warm)",
                }}
              >
                Rotate Left
              </button>
              <button
                onTouchStart={(e) => {
                  e.stopPropagation();
                  setRightTouching(true);
                  setTurnPressed(1, true);
                }}
                onTouchEnd={() => {
                  setRightTouching(false);
                  setTurnPressed(1, false);
                }}
                className="rounded-xl py-3 text-center font-[family-name:var(--font-fredoka)] font-semibold text-sm active:scale-95 transition-all"
                style={{
                  background: rightTouching
                    ? "rgba(255,107,44,0.2)"
                    : "rgba(255,255,255,0.05)",
                  border: `1.5px solid ${rightTouching ? "rgba(255,107,44,0.4)" : "rgba(255,184,0,0.12)"}`,
                  color: "var(--text-warm)",
                }}
              >
                Rotate Right
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
