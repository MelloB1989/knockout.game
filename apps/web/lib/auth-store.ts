import { create } from "zustand";
import { API_BASE } from "./constants";

interface AuthState {
  token: string | null;
  playerId: string | null;
  playerSecret: string | null;
  username: string;
  pfp: string;
  isReady: boolean;

  initGuest: (username: string, pfp?: string) => Promise<void>;
  setToken: (token: string, playerId: string, playerSecret: string) => void;
  clear: () => void;
}

function generateSecret(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  playerId: null,
  playerSecret: null,
  username: "",
  pfp: "",
  isReady: false,

  initGuest: async (username: string, pfp = "") => {
    const secret = generateSecret();
    const res = await fetch(`${API_BASE}/v1/auth/guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_secret: secret,
        username,
        pfp,
      }),
    });

    if (!res.ok) {
      throw new Error("Failed to authenticate");
    }

    const data = await res.json();
    set({
      token: data.token,
      playerId: data.player_id,
      playerSecret: secret,
      username,
      pfp,
      isReady: true,
    });
  },

  setToken: (token, playerId, playerSecret) =>
    set({ token, playerId, playerSecret, isReady: true }),

  clear: () =>
    set({
      token: null,
      playerId: null,
      playerSecret: null,
      username: "",
      pfp: "",
      isReady: false,
    }),
}));
