import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { API_BASE } from "./constants";

interface AuthState {
  token: string | null;
  playerId: string | null;
  playerSecret: string | null;
  username: string;
  pfp: string;
  selectedSkin: string;
  isReady: boolean;
  hasHydrated: boolean;

  initGuest: (username: string, pfp?: string) => Promise<void>;
  setToken: (token: string, playerId: string, playerSecret: string) => void;
  setSelectedSkin: (skin: string) => void;
  restorePersistedSession: () => boolean;
  clear: () => void;
}

interface PersistedAuthSnapshot {
  token: string | null;
  playerId: string | null;
  playerSecret: string | null;
  username: string;
  pfp: string;
  selectedSkin: string;
}

function readPersistedSession(): PersistedAuthSnapshot | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem("knockout-auth");
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { state?: Partial<PersistedAuthSnapshot> };
    const state = parsed?.state;
    if (!state) return null;

    return {
      token: state.token ?? null,
      playerId: state.playerId ?? null,
      playerSecret: state.playerSecret ?? null,
      username: state.username ?? "",
      pfp: state.pfp ?? "",
      selectedSkin: state.selectedSkin ?? "default",
    };
  } catch {
    return null;
  }
}

function generateSecret(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      playerId: null,
      playerSecret: null,
      username: "",
      pfp: "",
      selectedSkin: "default",
      isReady: false,
      hasHydrated: false,

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
          selectedSkin: "default",
          isReady: true,
          hasHydrated: true,
        });
      },

      setToken: (token, playerId, playerSecret) =>
        set({
          token,
          playerId,
          playerSecret,
          isReady: true,
          hasHydrated: true,
        }),

      setSelectedSkin: (selectedSkin) => set({ selectedSkin }),

      restorePersistedSession: () => {
        const persisted = readPersistedSession();
        if (!persisted) {
          set({
            hasHydrated: true,
            isReady: false,
          });
          return false;
        }

        const isReady = !!(
          persisted.token &&
          persisted.playerId &&
          persisted.playerSecret
        );

        set({
          token: persisted.token,
          playerId: persisted.playerId,
          playerSecret: persisted.playerSecret,
          username: persisted.username,
          pfp: persisted.pfp,
          selectedSkin: persisted.selectedSkin,
          hasHydrated: true,
          isReady,
        });

        return isReady;
      },

      clear: () =>
        set({
          token: null,
          playerId: null,
          playerSecret: null,
          username: "",
          pfp: "",
          selectedSkin: "default",
          isReady: false,
          hasHydrated: true,
        }),
    }),
    {
      name: "knockout-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token: state.token,
        playerId: state.playerId,
        playerSecret: state.playerSecret,
        username: state.username,
        pfp: state.pfp,
        selectedSkin: state.selectedSkin,
      }),
      onRehydrateStorage: () => (state) => {
        useAuthStore.setState({
          hasHydrated: true,
          isReady: !!(state?.token && state?.playerId && state?.playerSecret),
        });
      },
    },
  ),
);
