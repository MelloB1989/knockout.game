import type {
  OutgoingMessage,
  PenguinMove,
  Penguin,
  CountdownPayload,
  RoundMovesPayload,
  PlayerEliminatedPayload,
  GameEndedPayload,
  GameState,
  RematchCreatedPayload,
} from "./types";
import { useGameStore } from "./game-store";
import { API_BASE } from "./constants";

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRegistration: Partial<Penguin> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let intentionalClose = false;
let pendingPlayAgain = false;
let spectateMode = false;
let positionApplyTimer: ReturnType<typeof setTimeout> | null = null;
let positionQueue: GameState[] = [];
let playbackClockOffsetMs: number | null = null;
let lastAppliedServerFrame = -1;

const POSITION_PLAYBACK_DELAY_MS = 75;
const MAX_BUFFERED_POSITION_STATES = 12;

function stopPositionApply() {
  if (positionApplyTimer) {
    clearTimeout(positionApplyTimer);
    positionApplyTimer = null;
  }
}

function resetPositionPlayback() {
  stopPositionApply();
  positionQueue = [];
  playbackClockOffsetMs = null;
  lastAppliedServerFrame = -1;
}

function hasServerPlaybackMeta(gs: GameState) {
  return Number.isFinite(gs.server_frame) && Number.isFinite(gs.server_time_ms);
}

function schedulePositionPlayback() {
  stopPositionApply();

  if (positionQueue.length === 0) return;

  while (positionQueue.length > 0) {
    const next = positionQueue[0];
    if (!next) break;
    const now = Date.now();

    if (!hasServerPlaybackMeta(next)) {
      positionQueue.shift();
      useGameStore.getState().handlePositionUpdate(next);
      continue;
    }

    const clockOffset = playbackClockOffsetMs ?? 0;
    const dueAt =
      next.server_time_ms + clockOffset + POSITION_PLAYBACK_DELAY_MS;
    const waitMs = dueAt - now;

    if (waitMs > 0) {
      positionApplyTimer = setTimeout(() => {
        positionApplyTimer = null;
        schedulePositionPlayback();
      }, waitMs);
      return;
    }

    positionQueue.shift();
    if (next.server_frame <= lastAppliedServerFrame) {
      continue;
    }

    lastAppliedServerFrame = next.server_frame;
    useGameStore.getState().handlePositionUpdate(next);
  }
}

function enqueuePositionUpdate(gs: GameState) {
  if (!gs.started || gs.accepting_moves) {
    resetPositionPlayback();
    useGameStore.getState().handlePositionUpdate(gs);
    return;
  }

  if (hasServerPlaybackMeta(gs)) {
    const observedOffset = Date.now() - gs.server_time_ms;
    playbackClockOffsetMs =
      playbackClockOffsetMs === null
        ? observedOffset
        : Math.min(playbackClockOffsetMs, observedOffset);

    const existingIndex = positionQueue.findIndex(
      (entry) => entry.server_frame >= gs.server_frame,
    );
    const existingState =
      existingIndex >= 0 ? positionQueue[existingIndex] : undefined;

    if (existingIndex === -1) {
      positionQueue.push(gs);
    } else if (existingState?.server_frame === gs.server_frame) {
      positionQueue[existingIndex] = gs;
    } else {
      positionQueue.splice(existingIndex, 0, gs);
    }

    if (positionQueue.length > MAX_BUFFERED_POSITION_STATES) {
      positionQueue = positionQueue.slice(-MAX_BUFFERED_POSITION_STATES);
    }

    schedulePositionPlayback();
    return;
  }

  useGameStore.getState().handlePositionUpdate(gs);
}

function flushRealtimeState() {
  resetPositionPlayback();
}

function getWsBase() {
  const base = API_BASE.replace(/^http/, "ws");
  return base;
}

export function connectToGame(gameId: string, token: string, spectate = false) {
  resetPositionPlayback();
  pendingPlayAgain = false;
  spectateMode = spectate;

  // Close any existing connection cleanly
  if (ws) {
    ws.onclose = null; // prevent reconnect loop from old socket
    ws.close();
    ws = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const url = `${getWsBase()}/v1/game/ws/${gameId}?token=${encodeURIComponent(token)}`;
  intentionalClose = false;
  ws = new WebSocket(url);

  ws.onopen = () => {
    reconnectAttempts = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (spectateMode) {
      // In spectate mode, don't register as player.
      // Game state will arrive via subscription events.
      return;
    }
    // If we have a pending registration, send it now then request state
    if (pendingRegistration) {
      sendEvent("register_player", pendingRegistration);
      pendingRegistration = null;
      sendEvent("get_state");
    } else {
      // Already registered (e.g. host) — just fetch state
      sendEvent("get_state");
    }
    // If play_again was requested while disconnected, send it now
    if (pendingPlayAgain) {
      pendingPlayAgain = false;
      sendEvent("play_again");
    }
  };

  ws.onmessage = (ev) => {
    try {
      const msg: OutgoingMessage = JSON.parse(ev.data);
      handleServerEvent(msg);
    } catch {
      // ignore malformed messages
    }
  };

  ws.onclose = () => {
    resetPositionPlayback();
    if (
      !intentionalClose &&
      reconnectAttempts < MAX_RECONNECT_ATTEMPTS
    ) {
      reconnectAttempts++;
      reconnectTimer = setTimeout(() => {
        connectToGame(gameId, token);
      }, 2000);
    }
  };

  ws.onerror = () => {
    ws?.close();
  };
}

export function disconnectFromGame() {
  intentionalClose = true;
  pendingPlayAgain = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  resetPositionPlayback();
  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  pendingRegistration = null;
  reconnectAttempts = 0;
}

export function sendEvent(event: string, data?: unknown) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ event, data }));
}

export function registerPlayer(player: Partial<Penguin>) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    sendEvent("register_player", player);
    sendEvent("get_state");
  } else {
    // Queue for when WS opens
    pendingRegistration = player;
  }
}

export function registerMove(move: PenguinMove) {
  sendEvent("register_move", move);
}

export function sendPosition(pos: { x: number; z: number; direction?: number }) {
  sendEvent("update_position", pos);
}

export function startGame() {
  sendEvent("start_game");
}

export function playAgain() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    pendingPlayAgain = true;
    return;
  }
  sendEvent("play_again");
}

export function getState() {
  sendEvent("get_state");
}

function handleServerEvent(msg: OutgoingMessage) {
  const store = useGameStore.getState();

  switch (msg.event) {
    case "game_state": {
      flushRealtimeState();
      const gs = msg.data as GameState;
      store.setGameState(gs);
      break;
    }
    case "player_joined": {
      const player = msg.data as Penguin;
      store.handlePlayerJoined(player);
      break;
    }
    case "round_start_countdown": {
      flushRealtimeState();
      const payload = msg.data as CountdownPayload;
      store.handleCountdown(payload);
      break;
    }
    case "player_made_move": {
      flushRealtimeState();
      const payload = msg.data as RoundMovesPayload;
      store.handleRoundMoves(payload);
      break;
    }
    case "player_eliminated": {
      const payload = msg.data as PlayerEliminatedPayload;
      store.handlePlayerEliminated(payload);
      break;
    }
    case "game_ended": {
      flushRealtimeState();
      const payload = msg.data as GameEndedPayload;
      store.handleGameEnded(payload, msg.game_state ?? null);
      break;
    }
    case "player_move_ack": {
      store.handleMoveAck();
      break;
    }
    case "rematch_created": {
      flushRealtimeState();
      const payload = msg.data as RematchCreatedPayload;
      store.handleRematchCreated(payload);
      break;
    }
    case "players_position_update": {
      const gs = msg.data as GameState;
      if (gs) {
        enqueuePositionUpdate(gs);
      }
      break;
    }
    case "error": {
      console.error("[ws] server error:", msg.error);
      useGameStore.getState().setRematchRequested(false);
      break;
    }
  }
}
