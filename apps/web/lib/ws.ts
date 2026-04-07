import type {
  OutgoingMessage,
  PenguinMove,
  Penguin,
  CountdownPayload,
  RoundMovesPayload,
  PlayerEliminatedPayload,
  GameEndedPayload,
  GameState,
} from "./types";
import { useGameStore } from "./game-store";
import { API_BASE } from "./constants";

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRegistration: Partial<Penguin> | null = null;

function getWsBase() {
  const base = API_BASE.replace(/^http/, "ws");
  return base;
}

export function connectToGame(gameId: string, token: string) {
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
  ws = new WebSocket(url);

  ws.onopen = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    // If we have a pending registration, send it now then request state
    if (pendingRegistration) {
      sendEvent("register_player", pendingRegistration);
      pendingRegistration = null;
      // Request full game state after a brief delay to let registration process
      setTimeout(() => sendEvent("get_state"), 200);
    } else {
      // Already registered (e.g. host) — just fetch state
      sendEvent("get_state");
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
    // Don't reconnect if game ended or deliberately disconnected
    const phase = useGameStore.getState().phase;
    if (phase !== "ended" && ws !== null) {
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
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.onclose = null; // prevent reconnect
    ws.close();
    ws = null;
  }
  pendingRegistration = null;
}

export function sendEvent(event: string, data?: unknown) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ event, data }));
}

export function registerPlayer(player: Partial<Penguin>) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    sendEvent("register_player", player);
    setTimeout(() => sendEvent("get_state"), 200);
  } else {
    // Queue for when WS opens
    pendingRegistration = player;
  }
}

export function registerMove(move: PenguinMove) {
  sendEvent("register_move", move);
}

export function startGame() {
  sendEvent("start_game");
}

export function getState() {
  sendEvent("get_state");
}

function handleServerEvent(msg: OutgoingMessage) {
  const store = useGameStore.getState();

  switch (msg.event) {
    case "game_state": {
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
      const payload = msg.data as CountdownPayload;
      store.handleCountdown(payload);
      break;
    }
    case "player_made_move": {
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
      const payload = msg.data as GameEndedPayload;
      const gs = (msg as { data?: GameEndedPayload; game_state?: GameState }).game_state ?? null;
      store.handleGameEnded(payload, gs);
      break;
    }
    case "player_move_ack": {
      store.handleMoveAck();
      break;
    }
    case "error": {
      console.error("[ws] server error:", msg.error);
      break;
    }
  }
}
