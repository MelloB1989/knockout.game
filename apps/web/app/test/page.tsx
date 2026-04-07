"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useGameStore } from "@/lib/game-store";
import GameControls from "@/components/game/GameControls";
import GameHUD from "@/components/game/GameHUD";
import type { Penguin, GameState } from "@/lib/types";

const GameArena = dynamic(() => import("@/components/game/GameArena"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0a0a0f]">
      <div className="text-white/40 text-sm">Loading 3D arena...</div>
    </div>
  ),
});

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */
const PLAYER_ID = "you";
const MAP_LENGTH = 50;
const MAP_WIDTH = 25;
const MAP_FRICTION = 0.18;
const POWER_SCALE = 2.5;
const DT = 0.3;
const VEL_EPSILON = 0.3;
const COLLISION_DIST = 2.0;
const TICK_INTERVAL_MS = 30;

/* ------------------------------------------------------------------ */
/*  Mock player creation                                              */
/* ------------------------------------------------------------------ */
function createMockPlayers(): Record<string, Penguin> {
  const m = 3; // margin
  const rp = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

  return {
    [PLAYER_ID]: {
      id: PLAYER_ID,
      type: "registered",
      skin: "lava",
      position: { x: MAP_LENGTH / 2, z: MAP_WIDTH / 2 },
      mass: 1, accel: 0, velocity: 0, direction: 45, eliminated: 0, score: 0,
    },
    "bot-alpha": {
      id: "bot-alpha",
      type: "anonymous",
      skin: "icy",
      position: { x: rp(m, MAP_LENGTH - m), z: rp(m, MAP_WIDTH - m) },
      mass: 1, accel: 0, velocity: 0, direction: Math.random() * 360, eliminated: 0, score: 0,
    },
    "bot-beta": {
      id: "bot-beta",
      type: "anonymous",
      skin: "neon",
      position: { x: rp(m, MAP_LENGTH - m), z: rp(m, MAP_WIDTH - m) },
      mass: 1, accel: 0, velocity: 0, direction: Math.random() * 360, eliminated: 0, score: 0,
    },
    "bot-gamma": {
      id: "bot-gamma",
      type: "anonymous",
      skin: "shadow",
      position: { x: rp(m, MAP_LENGTH - m), z: rp(m, MAP_WIDTH - m) },
      mass: 1, accel: 0, velocity: 0, direction: Math.random() * 360, eliminated: 0, score: 0,
    },
  };
}

function initialGameState(): GameState {
  return {
    players: createMockPlayers(),
    map: { id: "test", type: "frozen_lake", length: MAP_LENGTH, width: MAP_WIDTH, friction: MAP_FRICTION },
    current_moves: {},
    current_round: 1,
    wait_time: 8,
    host_id: PLAYER_ID,
    started: false,
  };
}

/* ------------------------------------------------------------------ */
/*  Client-side physics simulation (mirrors server logic)             */
/* ------------------------------------------------------------------ */
type SimPlayer = {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  velocity: number;
  direction: number;
  eliminated: number;
  score: number;
  skin: string;
  mass: number;
  lastHitBy?: string;
};

function buildSimPlayers(
  players: Record<string, Penguin>,
  moves: Record<string, { direction: number; power: number }>
): Record<string, SimPlayer> {
  const sim: Record<string, SimPlayer> = {};
  for (const [id, p] of Object.entries(players)) {
    const move = moves[id];
    const dir = move ? move.direction : p.direction;
    const vel = move && p.eliminated === 0 ? move.power * POWER_SCALE : 0;
    const rad = (dir * Math.PI) / 180;
    sim[id] = {
      id,
      x: p.position.x,
      z: p.position.z,
      vx: vel * Math.cos(rad),
      vz: vel * Math.sin(rad),
      velocity: vel,
      direction: dir,
      eliminated: p.eliminated,
      score: p.score,
      skin: p.skin,
      mass: p.mass,
    };
  }
  return sim;
}

/** Run one simulation tick. Returns true when all stopped. */
function simTick(sim: Record<string, SimPlayer>, mapLen: number, mapW: number, round: number): boolean {
  const damping = Math.max(0, 1 - MAP_FRICTION * DT);
  const ids: string[] = [];

  for (const [id, p] of Object.entries(sim)) {
    if (p.eliminated > 0) continue;
    p.vx *= damping;
    p.vz *= damping;
    const speed = Math.hypot(p.vx, p.vz);
    if (speed < VEL_EPSILON) {
      p.vx = 0;
      p.vz = 0;
      p.velocity = 0;
    } else {
      p.velocity = speed;
    }
    ids.push(id);
  }

  // Move
  for (const id of ids) {
    const p = sim[id];
    if (!p || p.vx === 0 && p.vz === 0) continue;
    p.x += p.vx * DT;
    p.z += p.vz * DT;

    // Boundary check
    if (p.x < 0 || p.x > mapLen || p.z < 0 || p.z > mapW) {
      p.eliminated = round;
      p.velocity = 0;
      p.vx = 0;
      p.vz = 0;

      // Score to last hitter
      if (p.lastHitBy) {
        const hitter = sim[p.lastHitBy];
        if (hitter && hitter.eliminated === 0) {
          hitter.score += 10;
        }
      }
    }
  }

  // Collisions
  const alive = ids.filter((id) => sim[id]!.eliminated === 0);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const p1 = sim[alive[i]!]!;
      const p2 = sim[alive[j]!]!;
      const dx = p1.x - p2.x;
      const dz = p1.z - p2.z;
      const distSq = dx * dx + dz * dz;
      if (distSq === 0 || distSq > COLLISION_DIST * COLLISION_DIST) continue;

      const dvx = p1.vx - p2.vx;
      const dvz = p1.vz - p2.vz;
      const dot = dvx * dx + dvz * dz;
      if (dot >= 0) continue;

      const factor = dot / distSq;
      p1.vx -= factor * dx;
      p1.vz -= factor * dz;
      p2.vx += factor * dx;
      p2.vz += factor * dz;

      // Track last hitter
      p1.lastHitBy = alive[j]!;
      p2.lastHitBy = alive[i]!;
    }
  }

  // Update direction from velocity
  let allStopped = true;
  for (const id of ids) {
    const p = sim[id]!;
    if (p.eliminated > 0) continue;
    const speed = Math.hypot(p.vx, p.vz);
    if (speed < VEL_EPSILON) {
      p.velocity = 0;
    } else {
      p.velocity = speed;
      let dir = (Math.atan2(p.vz, p.vx) * 180) / Math.PI;
      if (dir < 0) dir += 360;
      p.direction = dir;
      allStopped = false;
    }
  }

  return allStopped;
}

/** Convert sim players back to Penguin records */
function simToPlayers(sim: Record<string, SimPlayer>, origPlayers: Record<string, Penguin>): Record<string, Penguin> {
  const out: Record<string, Penguin> = {};
  for (const [id, s] of Object.entries(sim)) {
    const orig = origPlayers[id];
    if (!orig) continue;
    out[id] = {
      ...orig,
      position: { x: s.x, z: s.z },
      velocity: s.velocity,
      direction: s.direction,
      eliminated: s.eliminated,
      score: s.score,
    };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Test Page                                                         */
/* ------------------------------------------------------------------ */
export default function TestPage() {
  const phase = useGameStore((s) => s.phase);
  const gameState = useGameStore((s) => s.gameState);
  const countdown = useGameStore((s) => s.countdown);
  const currentRound = useGameStore((s) => s.currentRound);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const simRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLog((prev) => [...prev.slice(-12), msg]);
  }, []);

  // Initialize mock state
  useEffect(() => {
    const store = useGameStore.getState();
    store.setGameId("test-game");
    store.setPlayerId(PLAYER_ID);
    store.setGameState(initialGameState());
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (simRef.current) clearInterval(simRef.current);
      store.reset();
    };
  }, []);

  const simulateRound = useCallback(
    (round: number) => {
      const store = useGameStore.getState();
      const gs = store.gameState;
      if (!gs) return;

      // Player's move from aim state
      const moves: Record<string, { direction: number; power: number }> = {
        [PLAYER_ID]: { direction: store.aimDirection, power: store.aimPower },
      };

      // Random bot moves — bots aim toward a random alive player or the center
      for (const [id, p] of Object.entries(gs.players)) {
        if (id === PLAYER_ID || p.eliminated > 0) continue;
        const powers = [2, 4, 6, 8, 10];
        moves[id] = {
          direction: Math.random() * 360,
          power: powers[Math.floor(Math.random() * powers.length)] ?? 6,
        };
      }

      addLog(`R${round}: Simulating — you aim ${Math.round(store.aimDirection)}° power ${store.aimPower}`);
      store.handleRoundMoves({ round, moves });

      // Build simulation state
      const sim = buildSimPlayers(gs.players, moves);
      let tick = 0;

      simRef.current = setInterval(() => {
        const done = simTick(sim, gs.map.length, gs.map.width, round);
        tick++;

        // Publish position update to store
        const updatedPlayers = simToPlayers(sim, gs.players);
        store.handlePositionUpdate({ ...gs, players: updatedPlayers });

        if (done || tick >= 200) {
          clearInterval(simRef.current!);
          simRef.current = null;

          // Check eliminations
          const anyEliminated = Object.values(sim).some(s => s.eliminated === round);
          for (const [id, s] of Object.entries(sim)) {
            if (s.eliminated === round) {
              const by = s.lastHitBy ? ` by ${s.lastHitBy}` : "";
              addLog(`R${round}: ${id} eliminated${by}`);
              store.handlePlayerEliminated({
                player_id: id,
                round,
                eliminated_by: s.lastHitBy,
              });
            }
          }

          // Map shrinking: mirror server shrinkMap() — 10% per axis on elimination
          let newMapLength = gs.map.length;
          let newMapWidth = gs.map.width;
          if (anyEliminated) {
            newMapLength = Math.max(1, Math.floor(gs.map.length * 0.9));
            newMapWidth = Math.max(1, Math.floor(gs.map.width * 0.9));
            const scaleX = newMapLength / gs.map.length;
            const scaleZ = newMapWidth / gs.map.width;
            for (const s of Object.values(sim)) {
              if (s.eliminated === 0) {
                s.x = Math.max(0, Math.min(newMapLength, s.x * scaleX));
                s.z = Math.max(0, Math.min(newMapWidth, s.z * scaleZ));
              }
            }
            addLog(`R${round}: Map shrunk to ${newMapLength}x${newMapWidth}`);
          }

          // Update final game state
          const finalPlayers = simToPlayers(sim, gs.players);
          const finalGs: GameState = {
            ...gs,
            players: finalPlayers,
            current_round: round + 1,
            map: { ...gs.map, length: newMapLength, width: newMapWidth },
          };
          store.setGameState(finalGs);

          // Check for game over
          const alive = Object.values(finalPlayers).filter((p) => p.eliminated === 0);
          if (alive.length <= 1) {
            const winner = alive[0]?.id;
            addLog(`Game over! Winner: ${winner ?? "none"}`);
            store.handleGameEnded({ winner_id: winner }, finalGs);
            return;
          }

          // Next countdown after a pause
          addLog(`R${round} done. ${alive.length} alive. Starting R${round + 1}...`);
          setTimeout(() => startCountdown(round + 1), 1000);
        }
      }, TICK_INTERVAL_MS);
    },
    [addLog]
  );

  const startCountdown = useCallback(
    (round: number) => {
      if (countdownRef.current) clearInterval(countdownRef.current);

      let remaining = 8;
      addLog(`R${round}: Countdown ${remaining}s`);
      useGameStore.getState().handleCountdown({
        round,
        seconds_remaining: remaining,
        total_seconds: 8,
      });

      countdownRef.current = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          simulateRound(round);
          return;
        }
        useGameStore.getState().handleCountdown({
          round,
          seconds_remaining: remaining,
          total_seconds: 8,
        });
      }, 1000);
    },
    [addLog, simulateRound]
  );

  const handleStart = useCallback(() => {
    const store = useGameStore.getState();
    const gs = store.gameState;
    if (!gs) return;
    store.setGameState({ ...gs, started: true });
    addLog("Game started!");
    startCountdown(1);
  }, [addLog, startCountdown]);

  const handleReset = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (simRef.current) clearInterval(simRef.current);
    const store = useGameStore.getState();
    store.reset();
    store.setGameId("test-game");
    store.setPlayerId(PLAYER_ID);
    store.setGameState(initialGameState());
    setLog([]);
    addLog("Reset. Ready.");
  }, [addLog]);

  const handlePlayAgain = useCallback(() => {
    handleReset();
  }, [handleReset]);

  return (
    <div className="fixed inset-0 bg-[var(--bg-primary)]">
      {/* 3D Arena */}
      {gameState && <GameArena playerId={PLAYER_ID} />}

      {/* HUD + Controls */}
      <GameHUD />
      <GameControls />

      {/* Game over */}
      {phase === "ended" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div
            className="rounded-2xl p-8 max-w-sm w-full mx-4 text-center"
            style={{
              background: "linear-gradient(135deg, rgba(28,24,20,0.97) 0%, rgba(15,13,10,0.97) 100%)",
              border: "2px solid var(--border-warm)",
              boxShadow: "0 0 40px rgba(255,107,44,0.1), 0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            <h1 className="text-3xl font-[family-name:var(--font-bungee)] text-gradient-warm mb-2">
              {useGameStore.getState().winnerId === PLAYER_ID ? "YOU WIN!" : "GAME OVER"}
            </h1>
            <p className="text-[var(--text-muted)] mb-6 font-[family-name:var(--font-fredoka)]">
              Winner: {useGameStore.getState().winnerId ?? "none"}
            </p>
            {/* Scores */}
            <div className="space-y-1.5 mb-6">
              {gameState &&
                Object.values(gameState.players)
                  .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                  .map((p) => (
                    <div key={p.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${p.id === PLAYER_ID ? "bg-[var(--accent-orange)]/10 border border-[var(--accent-orange)]/20" : "bg-white/5"}`}>
                      <span className={`w-2 h-2 rounded-full ${p.eliminated === 0 ? "bg-green-400" : "bg-red-400"}`} />
                      <span className="flex-1 text-[var(--text-warm)] text-left truncate font-[family-name:var(--font-fredoka)]">{p.id}</span>
                      <span className="text-[var(--accent-gold)] font-bold font-[family-name:var(--font-fredoka)]">{p.score ?? 0}</span>
                    </div>
                  ))}
            </div>
            <button onClick={handlePlayAgain} className="game-btn-primary w-full font-[family-name:var(--font-fredoka)]">
              Play Again
            </button>
          </div>
        </div>
      )}

      {/* ── Test Controls Panel ── */}
      <div className="absolute top-4 left-4 z-50 flex flex-col gap-2 pointer-events-auto max-w-[220px]">
        {/* Phase badge */}
        <div
          className="backdrop-blur-sm rounded-xl px-3 py-2 flex items-center gap-2"
          style={{
            background: "linear-gradient(135deg, rgba(15,13,10,0.85) 0%, rgba(25,20,14,0.85) 100%)",
            border: "1.5px solid var(--border-warm)",
          }}
        >
          <span className="text-[10px] text-[var(--text-dim)] uppercase font-[family-name:var(--font-fredoka)] font-semibold">Phase</span>
          <span className="text-xs text-[var(--accent-orange)] font-mono font-bold">{phase}</span>
          {phase === "countdown" && (
            <span className="text-xs text-[var(--accent-gold)] font-mono ml-auto">{countdown}s</span>
          )}
          <span className="text-[10px] text-[var(--text-dim)] ml-auto font-[family-name:var(--font-fredoka)]">R{currentRound}</span>
        </div>

        {/* Action buttons */}
        {(phase === "lobby" || phase === "idle") && (
          <button
            onClick={handleStart}
            className="game-btn-green font-[family-name:var(--font-fredoka)] text-sm"
          >
            Start Test Game
          </button>
        )}

        <button
          onClick={handleReset}
          className="bg-white/5 hover:bg-white/10 border border-[var(--border-warm)] text-[var(--text-muted)] px-3 py-2 rounded-xl text-xs transition-colors font-[family-name:var(--font-fredoka)] font-semibold"
        >
          Reset
        </button>

        {/* Log */}
        <div
          className="backdrop-blur-sm rounded-xl px-3 py-2 max-h-48 overflow-y-auto"
          style={{
            background: "linear-gradient(135deg, rgba(15,13,10,0.85) 0%, rgba(25,20,14,0.85) 100%)",
            border: "1.5px solid var(--border-warm)",
          }}
        >
          <p className="text-[9px] text-[var(--text-dim)] uppercase tracking-widest mb-1 font-[family-name:var(--font-fredoka)] font-semibold">Log</p>
          {log.length === 0 && <p className="text-[10px] text-[var(--text-dim)] font-[family-name:var(--font-fredoka)]">Ready. Click Start.</p>}
          {log.map((l, i) => (
            <p key={i} className="text-[10px] text-[var(--text-muted)] leading-tight font-[family-name:var(--font-fredoka)]">
              {l}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
