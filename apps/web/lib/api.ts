import { API_BASE } from "./constants";
import type { GameResult, MapConfig } from "./types";

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }
  return res.json();
}

export async function getMaps(): Promise<MapConfig[]> {
  return apiFetch("/v1/game/maps");
}

export async function getSkins(): Promise<string[]> {
  return apiFetch("/v1/game/skins");
}

export async function createGame(
  token: string,
  body: {
    map_type: string;
    skin: string;
    position?: { x: number; z: number };
    wait_time_seconds?: number;
  },
): Promise<{ game_id: string; host_id: string; game_state: unknown }> {
  return apiFetch("/v1/game/create", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

export async function getLatestGames(limit = 12): Promise<GameResult[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  return apiFetch(`/v1/game/latest?${params.toString()}`);
}
