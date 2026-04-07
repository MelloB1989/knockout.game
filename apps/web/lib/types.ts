export interface Position {
  x: number;
  z: number;
}

export interface Penguin {
  id: string;
  player_secret?: string;
  type: "anonymous" | "registered";
  skin: string;
  position: Position;
  mass: number;
  accel: number;
  velocity: number;
  direction: number;
  eliminated: number;
}

export interface PenguinMove {
  direction: number;
  power: number;
}

export interface GameMap {
  id: string;
  type: string;
  length: number;
  width: number;
  friction: number;
}

export interface GameState {
  players: Record<string, Penguin>;
  map: GameMap;
  current_moves: Record<string, PenguinMove>;
  current_round: number;
  wait_time: number;
  host_id: string;
  started: boolean;
}

export interface MapConfig {
  id: string;
  name: string;
  length: number;
  width: number;
  friction: number;
}

// Server -> Client events
export type ServerEvent =
  | "game_created"
  | "player_joined"
  | "player_left"
  | "player_eliminated"
  | "game_ended"
  | "player_made_move"
  | "player_move_ack"
  | "players_position_update"
  | "round_start_countdown"
  | "game_state"
  | "error";

// Client -> Server events
export type ClientEvent =
  | "register_player"
  | "register_move"
  | "get_state"
  | "start_game";

export interface IncomingMessage {
  event: ClientEvent;
  data?: unknown;
}

export interface OutgoingMessage {
  event: ServerEvent;
  data?: unknown;
  error?: string;
}

export interface CountdownPayload {
  round: number;
  seconds_remaining: number;
  total_seconds: number;
}

export interface RoundMovesPayload {
  round: number;
  moves: Record<string, PenguinMove>;
}

export interface PlayerEliminatedPayload {
  player_id: string;
  round: number;
}

export interface GameEndedPayload {
  winner_id?: string;
}

export interface MoveAckPayload {
  player_id: string;
}
