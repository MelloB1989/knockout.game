import { create } from "zustand";
import type {
  GameState,
  Penguin,
  PenguinMove,
  CountdownPayload,
  RoundMovesPayload,
  PlayerEliminatedPayload,
  GameEndedPayload,
} from "./types";

export type GamePhase = "idle" | "lobby" | "countdown" | "playing" | "animating" | "ended";

interface GameStore {
  // Core state
  gameId: string | null;
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

  // Elimination & end
  eliminatedThisRound: string[];
  winnerId: string | null;

  // Animated positions (for smooth interpolation)
  animatedPositions: Record<string, { x: number; z: number }>;

  // Actions
  setGameId: (id: string) => void;
  setGameState: (gs: GameState) => void;
  setPhase: (phase: GamePhase) => void;
  setIsHost: (h: boolean) => void;

  handleCountdown: (payload: CountdownPayload) => void;
  handleRoundMoves: (payload: RoundMovesPayload) => void;
  handlePlayerJoined: (player: Penguin) => void;
  handlePlayerEliminated: (payload: PlayerEliminatedPayload) => void;
  handleGameEnded: (payload: GameEndedPayload, gs: GameState | null) => void;
  handleMoveAck: () => void;

  setPendingMove: (move: PenguinMove | null) => void;
  submitMove: () => PenguinMove | null;

  updateAnimatedPositions: (positions: Record<string, { x: number; z: number }>) => void;

  reset: () => void;
}

const initialState = {
  gameId: null,
  gameState: null,
  phase: "idle" as GamePhase,
  isHost: false,
  countdown: 0,
  totalCountdown: 0,
  currentRound: 1,
  pendingMove: null,
  moveSubmitted: false,
  roundMoves: null,
  eliminatedThisRound: [],
  winnerId: null,
  animatedPositions: {},
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  setGameId: (id) => set({ gameId: id }),
  setGameState: (gs) => {
    const positions: Record<string, { x: number; z: number }> = {};
    if (gs?.players) {
      for (const [id, p] of Object.entries(gs.players)) {
        positions[id] = { x: p.position.x, z: p.position.z };
      }
    }
    set({
      gameState: gs,
      currentRound: gs?.current_round ?? 1,
      animatedPositions: positions,
      phase: gs?.started ? (get().phase === "idle" ? "playing" : get().phase) : "lobby",
    });
  },
  setPhase: (phase) => set({ phase }),
  setIsHost: (h) => set({ isHost: h }),

  handleCountdown: (payload) => {
    set({
      countdown: payload.seconds_remaining,
      totalCountdown: payload.total_seconds,
      currentRound: payload.round,
      phase: "countdown",
      moveSubmitted: false,
      roundMoves: null,
      eliminatedThisRound: [],
    });
  },

  handleRoundMoves: (payload) => {
    set({
      roundMoves: payload.moves,
      phase: "animating",
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
      eliminatedThisRound: [...s.eliminatedThisRound, payload.player_id],
    }));
  },

  handleGameEnded: (payload, gs) => {
    set({
      winnerId: payload.winner_id ?? null,
      phase: "ended",
      gameState: gs ?? get().gameState,
    });
  },

  handleMoveAck: () => {
    set({ moveSubmitted: true });
  },

  setPendingMove: (move) => set({ pendingMove: move }),

  submitMove: () => {
    const move = get().pendingMove;
    if (!move) return null;
    set({ moveSubmitted: true });
    return move;
  },

  updateAnimatedPositions: (positions) => set({ animatedPositions: positions }),

  reset: () => set(initialState),
}));
