"use client";

import { useCallback, useEffect, useRef } from "react";
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
        "0 0 12px rgba(248,113,113,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
      border: "1.5px solid rgba(248,113,113,0.7)",
    };
  }

  if (index >= 4) {
    return {
      background: "linear-gradient(180deg, #FB923C 0%, #EA580C 100%)",
      boxShadow:
        "0 0 12px rgba(251,146,60,0.32), inset 0 1px 0 rgba(255,255,255,0.18)",
      border: "1.5px solid rgba(251,146,60,0.65)",
    };
  }

  return {
    background: "linear-gradient(180deg, #34D399 0%, #10B981 100%)",
    boxShadow:
      "0 0 12px rgba(52,211,153,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
    border: "1.5px solid rgba(52,211,153,0.7)",
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

/** Send current aim to server */
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
    if (canAim) {
      lastBroadcastAtRef.current = 0;
      sendCurrentAim();
      return () => stopTurning();
    }
    stopTurning();
  }, [canAim, currentRound, stopTurning]);

  /* ── Keyboard listener for turning + Q/E power ── */
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
          className="rounded-none px-3 py-2 text-center"
          style={{
            background: "rgba(9, 14, 21, 0.82)",
            border: "1px solid rgba(169, 196, 222, 0.18)",
            boxShadow: "0 10px 26px rgba(0,0,0,0.2)",
          }}
        >
          <span className="select-none text-sm text-[#d6e1ec] font-[family-name:var(--font-geist-sans)]">
            WASD to walk on stage. Drag to orbit camera.
          </span>
        </div>
      </div>
    );
  }

  if (phase !== "countdown") return null;

  const isUrgent = countdown <= 3;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      <div className="absolute left-1/2 top-4 flex -translate-x-1/2 flex-col items-center gap-1.5">
        <div
          className="rounded-none px-4 py-1.5 shadow-lg"
          style={{
            background:
              "linear-gradient(135deg, rgba(8,12,18,0.92) 0%, rgba(18,24,34,0.9) 100%)",
            border: `1px solid ${isUrgent ? "rgba(248,113,113,0.55)" : "rgba(245,187,108,0.42)"}`,
            boxShadow: isUrgent
              ? "0 0 20px rgba(239,68,68,0.3), 0 4px 12px rgba(0,0,0,0.4)"
              : "0 0 20px rgba(255,107,44,0.15), 0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          <span className="text-[var(--text-warm)] text-xl font-semibold tracking-[0.01em] font-[family-name:var(--font-geist-sans)]">
            Revealing aims in{" "}
            <span
              className="font-[family-name:var(--font-geist-mono)] text-2xl"
              style={{
                color: isUrgent ? "var(--accent-red)" : "var(--accent-gold)",
              }}
            >
              {countdown}
            </span>
          </span>
        </div>
        <div
          className="rounded-none px-3 py-0.5"
          style={{
            background: "rgba(10, 15, 22, 0.76)",
            border: "1px solid rgba(169, 196, 222, 0.16)",
          }}
        >
          <span className="text-[#d6e1ec] text-sm font-medium font-[family-name:var(--font-geist-sans)] tracking-[0.08em]">
            Round {currentRound}
          </span>
        </div>
      </div>

      {canAim && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: "50%",
            transform: "translateX(-50%)",
            bottom: "max(0.75rem, env(safe-area-inset-bottom))",
            width: "min(40rem, calc(100vw - 1.5rem))",
          }}
        >
          <div className="mb-2 flex justify-center">
            <div
              className="rounded-none px-3 py-1 text-[10px] uppercase tracking-[0.16em]"
              style={{
                background: "rgba(8, 13, 19, 0.82)",
                border: "1px solid rgba(169, 196, 222, 0.16)",
                color: "#d6e1ec",
              }}
            >
              Turn with A / D or drag
            </div>
          </div>
          <div
            className="pointer-events-auto rounded-none px-2 py-2 sm:px-3"
            style={{
              background:
                "linear-gradient(180deg, rgba(8,12,18,0.95) 0%, rgba(16,21,30,0.93) 100%)",
              border: "1px solid rgba(169, 196, 222, 0.2)",
              boxShadow:
                "0 16px 36px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            <div className="grid grid-cols-[3.25rem,minmax(0,1fr),3.25rem] items-end gap-2 sm:grid-cols-[4rem,minmax(0,1fr),4rem] sm:gap-2.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  decreasePower();
                }}
                className="flex w-full shrink-0 flex-col items-center justify-center gap-1 rounded-none px-2 py-2 transition-transform hover:scale-[1.01] active:scale-95"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
                  border: "1px solid rgba(169, 196, 222, 0.18)",
                  color: "var(--text-warm)",
                }}
              >
                <span className="font-[family-name:var(--font-geist-mono)] text-xl font-semibold">
                  Q
                </span>
                <span className="text-[9px] uppercase tracking-[0.16em] text-[#9db1c3] font-[family-name:var(--font-geist-sans)]">
                  lower
                </span>
              </button>

              <div className="min-w-0 flex-1">
                <div className="mb-2 flex justify-center">
                  <div
                    className="rounded-none px-3 py-1"
                    style={{
                      background: "rgba(4,8,14,0.78)",
                      border: "1px solid rgba(169, 196, 222, 0.16)",
                    }}
                  >
                    <span className="font-[family-name:var(--font-geist-sans)] text-base font-semibold text-[var(--text-warm)]">
                      Power {aimPower}
                    </span>
                  </div>
                </div>

                <div
                  className="grid grid-cols-10 gap-1 rounded-none px-2.5 py-2.5 sm:gap-1.5 sm:px-3"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(2,6,10,0.9) 0%, rgba(10,15,24,0.88) 100%)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    boxShadow:
                      "inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 22px rgba(0,0,0,0.24)",
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
                        className="h-8 rounded-none transition-all hover:-translate-y-0.5 active:translate-y-0 sm:h-10"
                        style={
                          isFilled
                            ? filledPowerStyle(i)
                            : {
                                background: "rgba(255,255,255,0.045)",
                                border: "1.5px solid rgba(255,255,255,0.08)",
                              }
                        }
                      />
                    );
                  })}
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  increasePower();
                }}
                className="flex w-full shrink-0 flex-col items-center justify-center gap-1 rounded-none px-2 py-2 transition-transform hover:scale-[1.01] active:scale-95"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
                  border: "1px solid rgba(169, 196, 222, 0.18)",
                  color: "var(--text-warm)",
                }}
              >
                <span className="font-[family-name:var(--font-geist-mono)] text-xl font-semibold">
                  E
                </span>
                <span className="text-[9px] uppercase tracking-[0.16em] text-[#9db1c3] font-[family-name:var(--font-geist-sans)]">
                  raise
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
