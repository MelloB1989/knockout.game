"use client";

import { useCallback, useRef, useEffect } from "react";
import { mobileInput } from "@/lib/mobile-input";

const JOYSTICK_SIZE = 120;
const KNOB_SIZE = 48;
const MAX_DISTANCE = (JOYSTICK_SIZE - KNOB_SIZE) / 2;

interface Props {
  visible: boolean;
}

export default function MobileJoystick({ visible }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const touchIdRef = useRef<number | null>(null);
  const centerRef = useRef({ x: 0, y: 0 });

  const updateKnob = useCallback((dx: number, dy: number) => {
    const distance = Math.hypot(dx, dy);
    const clampedDistance = Math.min(distance, MAX_DISTANCE);
    const angle = Math.atan2(dy, dx);
    const clampedDx = Math.cos(angle) * clampedDistance;
    const clampedDy = Math.sin(angle) * clampedDistance;

    if (knobRef.current) {
      knobRef.current.style.transform = `translate(${clampedDx}px, ${clampedDy}px)`;
    }

    const normalizedX = clampedDx / MAX_DISTANCE;
    const normalizedY = clampedDy / MAX_DISTANCE;

    mobileInput.moveX = normalizedX;
    mobileInput.moveZ = normalizedY;
    mobileInput.active = distance > 8;
  }, []);

  const resetKnob = useCallback(() => {
    if (knobRef.current) {
      knobRef.current.style.transform = "translate(0px, 0px)";
    }
    mobileInput.moveX = 0;
    mobileInput.moveZ = 0;
    mobileInput.active = false;
    touchIdRef.current = null;
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (touchIdRef.current !== null) return;
      const touch = e.changedTouches[0];
      if (!touch || !containerRef.current) return;

      touchIdRef.current = touch.identifier;
      const rect = containerRef.current.getBoundingClientRect();
      centerRef.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      updateKnob(
        touch.clientX - centerRef.current.x,
        touch.clientY - centerRef.current.y,
      );
    },
    [updateKnob],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (touchIdRef.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch && touch.identifier === touchIdRef.current) {
          e.preventDefault();
          updateKnob(
            touch.clientX - centerRef.current.x,
            touch.clientY - centerRef.current.y,
          );
          return;
        }
      }
    },
    [updateKnob],
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (touchIdRef.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch && touch.identifier === touchIdRef.current) {
          resetKnob();
          return;
        }
      }
    },
    [resetKnob],
  );

  useEffect(() => {
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchEnd);
    return () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
      resetKnob();
    };
  }, [handleTouchMove, handleTouchEnd, resetKnob]);

  if (!visible) return null;

  return (
    <div
      className="absolute z-30 pointer-events-auto sm:hidden"
      style={{
        left: "1.25rem",
        bottom: "max(5.5rem, calc(env(safe-area-inset-bottom) + 5.5rem))",
      }}
    >
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        className="relative flex items-center justify-center touch-none select-none"
        style={{
          width: JOYSTICK_SIZE,
          height: JOYSTICK_SIZE,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(28,24,20,0.7) 0%, rgba(28,24,20,0.4) 100%)",
          border: "2px solid rgba(255, 184, 0, 0.2)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.3), inset 0 0 24px rgba(0,0,0,0.15)",
        }}
      >
        {/* Direction indicators */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <svg width={JOYSTICK_SIZE - 16} height={JOYSTICK_SIZE - 16} viewBox="0 0 100 100" className="opacity-20">
            <polygon points="50,12 56,24 44,24" fill="var(--accent-gold)" />
            <polygon points="50,88 56,76 44,76" fill="var(--accent-gold)" />
            <polygon points="12,50 24,44 24,56" fill="var(--accent-gold)" />
            <polygon points="88,50 76,44 76,56" fill="var(--accent-gold)" />
          </svg>
        </div>
        {/* Knob */}
        <div
          ref={knobRef}
          className="absolute"
          style={{
            width: KNOB_SIZE,
            height: KNOB_SIZE,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 40% 35%, rgba(255,184,0,0.5) 0%, rgba(255,107,44,0.35) 100%)",
            border: "2px solid rgba(255, 184, 0, 0.45)",
            boxShadow:
              "0 2px 8px rgba(0,0,0,0.3), 0 0 16px rgba(255,184,0,0.15)",
            transition: "none",
          }}
        />
      </div>
      <p className="text-center mt-1.5 text-[9px] uppercase tracking-widest text-[var(--text-dim)] font-[family-name:var(--font-fredoka)]">
        Move
      </p>
    </div>
  );
}
