"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useGameStore } from "@/lib/game-store";
import { registerMove } from "@/lib/ws";
import type { PenguinMove } from "@/lib/types";

const POWER_LEVELS = [2, 4, 6, 8, 10];
const POWER_LABELS = ["Tap", "Light", "Medium", "Strong", "MAX"];
const POWER_COLORS = ["#22d3ee", "#06b6d4", "#eab308", "#f97316", "#ef4444"];

export default function GameControls() {
  const { phase, countdown, totalCountdown, moveSubmitted, currentRound } =
    useGameStore();

  const [direction, setDirection] = useState(0);
  const [powerIndex, setPowerIndex] = useState(2);
  const [isDragging, setIsDragging] = useState(false);
  const joystickRef = useRef<HTMLDivElement>(null);
  const knobPosRef = useRef({ x: 0, y: 0 });
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });

  const handleSubmit = useCallback(() => {
    if (moveSubmitted) return;
    const move: PenguinMove = {
      direction,
      power: POWER_LEVELS[powerIndex] ?? 6,
    };
    useGameStore.getState().setPendingMove(move);
    useGameStore.getState().submitMove();
    registerMove(move);
  }, [direction, powerIndex, moveSubmitted]);

  // Joystick handlers
  const handleJoystickStart = useCallback(
    (clientX: number, clientY: number) => {
      if (!joystickRef.current || moveSubmitted) return;
      setIsDragging(true);
      const rect = joystickRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      updateJoystick(clientX, clientY, centerX, centerY, rect.width / 2);
    },
    [moveSubmitted]
  );

  const updateJoystick = useCallback(
    (clientX: number, clientY: number, centerX: number, centerY: number, radius: number) => {
      const dx = clientX - centerX;
      const dy = clientY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clampedDist = Math.min(dist, radius - 10);
      const angle = Math.atan2(dy, dx);

      const nx = (clampedDist / (radius - 10)) * Math.cos(angle) * (radius - 10);
      const ny = (clampedDist / (radius - 10)) * Math.sin(angle) * (radius - 10);

      knobPosRef.current = { x: nx, y: ny };
      setKnobPos({ x: nx, y: ny });

      // Convert to game direction (degrees, 0 = right, CCW)
      let deg = (angle * 180) / Math.PI;
      if (deg < 0) deg += 360;
      setDirection(Math.round(deg));
    },
    []
  );

  const handleJoystickMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!isDragging || !joystickRef.current) return;
      const rect = joystickRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      updateJoystick(clientX, clientY, centerX, centerY, rect.width / 2);
    },
    [isDragging, updateJoystick]
  );

  const handleJoystickEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handleJoystickMove(e.clientX, e.clientY);
    const onMouseUp = () => handleJoystickEnd();
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) {
        handleJoystickMove(touch.clientX, touch.clientY);
      }
    };
    const onTouchEnd = () => handleJoystickEnd();

    if (isDragging) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("touchend", onTouchEnd);
    }

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isDragging, handleJoystickMove, handleJoystickEnd]);

  if (phase !== "countdown") return null;

  const countdownPct = totalCountdown > 0 ? countdown / totalCountdown : 0;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none">
      {/* Countdown bar */}
      <div className="absolute top-0 left-0 right-0 -translate-y-full px-4 pb-2">
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

      {/* Controls area */}
      <div className="pointer-events-auto bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-12 pb-6 px-4">
        <div className="max-w-lg mx-auto flex items-end justify-between gap-4">
          {/* Direction joystick */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] text-white/40 uppercase tracking-widest">Direction</span>
            <div
              ref={joystickRef}
              className="relative w-32 h-32 rounded-full border-2 border-white/20 bg-white/5 backdrop-blur-sm cursor-pointer select-none touch-none"
              onMouseDown={(e) => handleJoystickStart(e.clientX, e.clientY)}
              onTouchStart={(e) => {
                const touch = e.touches[0];
                if (touch) {
                  handleJoystickStart(touch.clientX, touch.clientY);
                }
              }}
            >
              {/* Direction indicator lines */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                <div
                  key={deg}
                  className="absolute w-0.5 h-3 bg-white/10 left-1/2 top-1 -translate-x-1/2 origin-[50%_calc(64px-4px)]"
                  style={{ transform: `translateX(-50%) rotate(${deg}deg)` }}
                />
              ))}
              {/* Direction line from center */}
              <div
                className="absolute w-0.5 h-14 bg-cyan-500/30 left-1/2 top-1/2 origin-top"
                style={{
                  transform: `translateX(-50%) rotate(${direction}deg)`,
                }}
              />
              {/* Knob */}
              <div
                className={`absolute w-10 h-10 rounded-full left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-shadow ${
                  isDragging
                    ? "bg-cyan-400 shadow-lg shadow-cyan-400/50"
                    : "bg-cyan-500/80 shadow-md shadow-cyan-500/30"
                }`}
                style={{
                  transform: `translate(calc(-50% + ${knobPos.x}px), calc(-50% + ${knobPos.y}px))`,
                }}
              >
                <div className="absolute inset-1 rounded-full bg-cyan-300/20" />
              </div>
              {/* Degree readout */}
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-white/40 tabular-nums">
                {direction}&deg;
              </span>
            </div>
          </div>

          {/* Submit button */}
          <div className="flex flex-col items-center gap-2 pb-2">
            <button
              onClick={handleSubmit}
              disabled={moveSubmitted}
              className={`w-20 h-20 rounded-full font-bold text-sm transition-all ${
                moveSubmitted
                  ? "bg-green-500/20 border-2 border-green-500/40 text-green-400"
                  : "bg-gradient-to-b from-cyan-400 to-blue-600 text-white shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50 hover:scale-105 active:scale-95"
              }`}
            >
              {moveSubmitted ? "Sent!" : "PUSH"}
            </button>
          </div>

          {/* Power slider */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] text-white/40 uppercase tracking-widest">Power</span>
            <div className="flex flex-col-reverse gap-1.5">
              {POWER_LEVELS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPowerIndex(i)}
                  disabled={moveSubmitted}
                  className={`w-16 h-7 rounded-lg text-xs font-bold transition-all ${
                    i <= powerIndex
                      ? `text-white shadow-sm`
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
            <span className="text-xs text-white/50 font-bold tabular-nums">
              {POWER_LEVELS[powerIndex]}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
