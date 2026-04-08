import { create } from "zustand";
import type {
  GameState,
  Penguin,
  PenguinMove,
  CountdownPayload,
  RoundMovesPayload,
  PlayerEliminatedPayload,
  GameEndedPayload,
  RematchCreatedPayload,
} from "./types";

export type GamePhase =
  | "idle"
  | "lobby"
  | "countdown"
  | "playing"
  | "animating"
  | "ended";

interface GameStore {
  // Core state
  gameId: string | null;
  playerId: string | null;
  gameState: GameState | null;
  phase: GamePhase;
  isHost: boolean;

  // Round state
  countdown: number;
  totalCountdown: number;
  currentRound: number;

  // Move state
  pendingMove: PenguinMove | null;
  moveSubmitted: boolean;
  roundMoves: Record<string, PenguinMove> | null;

  // Aiming state (player direction in degrees during countdown)
  aimDirection: number;
  aimPower: number;

  // Elimination & end
  eliminatedThisRound: { playerId: string; eliminatedBy?: string }[];
  winnerId: string | null;
  rematchGameId: string | null;
  rematchGameState: GameState | null;
  rematchRequested: boolean;

  // Animated positions (for smooth interpolation)
  animatedPositions: Record<string, { x: number; z: number }>;

  // Actions
  setGameId: (id: string) => void;
  setPlayerId: (id: string) => void;
  setGameState: (gs: GameState) => void;
  setPhase: (phase: GamePhase) => void;
  setIsHost: (h: boolean) => void;

  handleCountdown: (payload: CountdownPayload) => void;
  handleRoundMoves: (payload: RoundMovesPayload) => void;
  handlePlayerJoined: (player: Penguin) => void;
  handlePlayerEliminated: (payload: PlayerEliminatedPayload) => void;
  handleGameEnded: (payload: GameEndedPayload, gs: GameState | null) => void;
  handleRematchCreated: (payload: RematchCreatedPayload) => void;
  handleMoveAck: () => void;
  handlePositionUpdate: (gs: GameState) => void;

  setPendingMove: (move: PenguinMove | null) => void;
  setAimDirection: (deg: number) => void;
  setAimPower: (power: number) => void;
  submitMove: () => PenguinMove | null;

  updateAnimatedPositions: (
    positions: Record<string, { x: number; z: number }>,
  ) => void;
  setRematchRequested: (requested: boolean) => void;
  clearRematch: () => void;

  reset: () => void;
}

function resolvePhaseFromGameState(
  gs: GameState | null,
  currentPhase: GamePhase,
): GamePhase {
  if (!gs) return "idle";
  if (!gs.started) return "lobby";
  if (currentPhase === "ended") return "ended";
  return "playing";
}

const initialState = {
  gameId: null,
  playerId: null,
  gameState: null,
  phase: "idle" as GamePhase,
  isHost: false,
  countdown: 0,
  totalCountdown: 0,
  currentRound: 1,
  pendingMove: null,
  moveSubmitted: false,
  roundMoves: null,
  aimDirection: 0,
  aimPower: 6,
  eliminatedThisRound: [] as { playerId: string; eliminatedBy?: string }[],
  winnerId: null,
  rematchGameId: null,
  rematchGameState: null,
  rematchRequested: false,
  animatedPositions: {},
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  setGameId: (id) => set({ gameId: id }),
  setPlayerId: (id) => set({ playerId: id }),
  setGameState: (gs) => {
    const positions: Record<string, { x: number; z: number }> = {};
    if (gs?.players) {
      for (const [id, p] of Object.entries(gs.players)) {
        positions[id] = { x: p.position.x, z: p.position.z };
      }
    }
    const pid = get().playerId;
    set({
      gameState: gs,
      currentRound: gs?.current_round ?? 1,
      animatedPositions: positions,
      isHost: !!(pid && gs?.host_id === pid),
      phase: resolvePhaseFromGameState(gs, get().phase),
    });
  },
  setPhase: (phase) => set({ phase }),
  setIsHost: (h) => set({ isHost: h }),

  handleCountdown: (payload) => {
    const prevPhase = get().phase;
    const currentAimPower = get().aimPower;

    // When transitioning from non-countdown (e.g. animating) to countdown,
    // initialize aim from the player's last direction in game state
    let newAimDir = get().aimDirection;
    if (prevPhase !== "countdown") {
      const pid = get().playerId;
      const gs = get().gameState;
      if (pid && gs?.players[pid]) {
        newAimDir = gs.players[pid].direction;
      }
    }

    set({
      countdown: payload.seconds_remaining,
      totalCountdown: payload.total_seconds,
      currentRound: payload.round,
      phase: "countdown",
      moveSubmitted: false,
      pendingMove: null,
      roundMoves: null,
      eliminatedThisRound: [],
      aimDirection: newAimDir,
      aimPower:
        prevPhase === "countdown" ? currentAimPower : currentAimPower || 6,
    });
  },

  handleRoundMoves: (payload) => {
    const gs = get().gameState;
    const nextGameState = gs
      ? {
          ...gs,
          players: Object.fromEntries(
            Object.entries(gs.players).map(([id, player]) => [
              id,
              payload.moves[id]
                ? {
                    ...player,
                    direction: payload.moves[id]!.direction,
                    public_direction: payload.moves[id]!.direction,
                  }
                : player,
            ]),
          ),
        }
      : null;
    set({
      roundMoves: payload.moves,
      phase: "animating",
      gameState: nextGameState ?? gs,
    });
  },

  handlePlayerJoined: (player) => {
    const gs = get().gameState;
    if (!gs) return;
    const updated = {
      ...gs,
      players: { ...gs.players, [player.id]: player },
    };
    set({ gameState: updated });
  },

  handlePlayerEliminated: (payload) => {
    set((s) => ({
      eliminatedThisRound: [
        ...s.eliminatedThisRound,
        { playerId: payload.player_id, eliminatedBy: payload.eliminated_by },
      ],
    }));
  },

  handleGameEnded: (payload, gs) => {
    set({
      winnerId: payload.winner_id ?? null,
      phase: "ended",
      gameState: gs ?? get().gameState,
    });
  },

  handleRematchCreated: (payload) => {
    const pid = get().playerId;
    set({
      rematchGameId: payload.game_id,
      rematchGameState: payload.game_state,
      rematchRequested: false,
      gameId: payload.game_id,
      gameState: payload.game_state,
      currentRound: payload.game_state?.current_round ?? 1,
      phase: resolvePhaseFromGameState(payload.game_state, "idle"),
      winnerId: null,
      roundMoves: null,
      pendingMove: null,
      moveSubmitted: false,
      eliminatedThisRound: [],
      isHost: !!(pid && payload.game_state?.host_id === pid),
    });
  },

  handleMoveAck: () => {
    // Live aiming sends many register_move events during countdown.
    // An ack confirms receipt, but it should not freeze local input.
    set({ moveSubmitted: false });
  },

  handlePositionUpdate: (gs) => {
    const positions: Record<string, { x: number; z: number }> = {};
    if (gs?.players) {
      for (const [id, p] of Object.entries(gs.players)) {
        positions[id] = { x: p.position.x, z: p.position.z };
      }
    }
    const currentPhase = get().phase;
    set({
      gameState: gs,
      animatedPositions: positions,
      phase:
        currentPhase === "countdown" ||
        currentPhase === "animating" ||
        currentPhase === "ended"
          ? currentPhase
          : resolvePhaseFromGameState(gs, currentPhase),
    });
  },

  setPendingMove: (move) => set({ pendingMove: move }),
  setAimDirection: (deg) => set({ aimDirection: deg }),
  setAimPower: (power) => set({ aimPower: power }),

  submitMove: () => {
    const { aimDirection, aimPower } = get();
    const move: PenguinMove = { direction: aimDirection, power: aimPower };
    set({ pendingMove: move, moveSubmitted: true });
    return move;
  },

  updateAnimatedPositions: (positions) => set({ animatedPositions: positions }),

  setRematchRequested: (requested) => set({ rematchRequested: requested }),
  clearRematch: () =>
    set({
      rematchGameId: null,
      rematchGameState: null,
      rematchRequested: false,
    }),

  reset: () => set(initialState),
}));
