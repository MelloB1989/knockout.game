"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuthStore } from "@/lib/auth-store";
import { useGameStore } from "@/lib/game-store";
import { createGame, getMaps } from "@/lib/api";
import { ALL_SKINS } from "@/lib/constants";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import type { GameState, MapConfig } from "@/lib/types";

const PenguinPreview = dynamic(() => import("@/components/ui/PenguinPreview"), {
  ssr: false,
});

const SKIN_DATA: Record<
  string,
  { name: string; gradient: string; emoji: string; ring: string }
> = {
  default: {
    name: "Classic",
    gradient: "from-neutral-500 to-neutral-700",
    emoji: "🐧",
    ring: "#6B7280",
  },
  icy: {
    name: "Icy",
    gradient: "from-gray-300 to-gray-500",
    emoji: "❄️",
    ring: "#9CA3AF",
  },
  lava: {
    name: "Lava",
    gradient: "from-red-500 to-orange-600",
    emoji: "🔥",
    ring: "#EF4444",
  },
  forest: {
    name: "Forest",
    gradient: "from-green-500 to-emerald-700",
    emoji: "🌿",
    ring: "#22C55E",
  },
  neon: {
    name: "Neon",
    gradient: "from-yellow-400 to-amber-500",
    emoji: "⚡",
    ring: "#EAB308",
  },
  shadow: {
    name: "Shadow",
    gradient: "from-neutral-700 to-neutral-900",
    emoji: "🌑",
    ring: "#404040",
  },
  pink: {
    name: "Pink",
    gradient: "from-pink-400 to-rose-500",
    emoji: "🌸",
    ring: "#EC4899",
  },
  shark: {
    name: "Shark",
    gradient: "from-neutral-500 to-neutral-700",
    emoji: "🦈",
    ring: "#6B7280",
  },
  tuxedo: {
    name: "Tuxedo",
    gradient: "from-neutral-800 to-neutral-950",
    emoji: "🎩",
    ring: "#262626",
  },
  goldking: {
    name: "Gold King",
    gradient: "from-yellow-500 to-amber-600",
    emoji: "👑",
    ring: "#F59E0B",
  },
};

const ENV_DATA: Record<
  string,
  { name: string; emoji: string; gradient: string; desc: string }
> = {
  Arctic: {
    name: "Arctic",
    emoji: "❄️",
    gradient: "from-gray-200/10 to-gray-400/5",
    desc: "Icy tundra",
  },
  Beach: {
    name: "Beach",
    emoji: "🏖️",
    gradient: "from-amber-400/10 to-orange-400/5",
    desc: "Sunny shores",
  },
  Desert: {
    name: "Desert",
    emoji: "🌋",
    gradient: "from-orange-500/10 to-red-500/5",
    desc: "Volcanic heat",
  },
  Rainy: {
    name: "Rainy",
    emoji: "🌧️",
    gradient: "from-gray-400/10 to-gray-600/5",
    desc: "Storm clouds",
  },
  Dystopian: {
    name: "Dystopian",
    emoji: "⚡",
    gradient: "from-emerald-500/10 to-green-700/5",
    desc: "Neon wasteland",
  },
};

const MAP_ENV: Record<string, string> = {
  frozen_lake: "Arctic",
  tundra_ring: "Arctic",
  glacier_pass: "Rainy",
  volcano_rim: "Desert",
  neon_arena: "Dystopian",
};

export default function CreatePage() {
  const router = useRouter();
  const {
    token,
    isReady,
    hasHydrated,
    selectedSkin: persistedSkin,
    setSelectedSkin: persistSelectedSkin,
  } = useAuthStore();
  const { setGameId, setGameState, setIsHost } = useGameStore();

  const [maps, setMaps] = useState<MapConfig[]>([]);
  const [selectedMap, setSelectedMap] = useState("");
  const [selectedSkin, setSelectedSkin] = useState(persistedSkin || "default");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isReady) {
      router.replace("/");
      return;
    }
    getMaps()
      .then((m) => {
        setMaps(m);
        if (m.length > 0 && m[0]) setSelectedMap(m[0].id);
      })
      .catch(() => setError("Failed to load maps"));
  }, [hasHydrated, isReady, router]);

  useEffect(() => {
    if (!hasHydrated) return;
    setSelectedSkin(persistedSkin || "default");
  }, [hasHydrated, persistedSkin]);

  const handleCreate = async () => {
    if (!token || !selectedMap) return;
    setLoading(true);
    setError("");
    try {
      const res = await createGame(token, {
        map_type: selectedMap,
        skin: selectedSkin,
        wait_time_seconds: 10,
      });
      persistSelectedSkin(selectedSkin);
      setGameId(res.game_id);
      setGameState(res.game_state as GameState);
      setIsHost(true);
      router.push(`/game/${res.game_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create game");
      setLoading(false);
    }
  };

  const skinKeys = Object.keys(ALL_SKINS);
  const skinInfo = SKIN_DATA[selectedSkin] ?? SKIN_DATA["default"]!;

  return (
    <main className="min-h-screen flex flex-col items-center relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-[var(--bg-primary)]" />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background: `
            radial-gradient(ellipse 70% 40% at 50% 0%, rgba(255, 107, 44, 0.06) 0%, transparent 100%),
            radial-gradient(ellipse 50% 30% at 80% 90%, rgba(255, 184, 0, 0.04) 0%, transparent 100%)
          `,
        }}
      />

      <motion.div
        className="relative z-10 w-full max-w-4xl px-4 py-8 flex flex-col gap-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push("/")}
            className="text-[var(--text-dim)] hover:text-[var(--text-warm)] transition-colors text-sm font-[family-name:var(--font-fredoka)] font-medium flex items-center gap-1.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back
          </button>
          <Image src="/logo.png" alt="Knockout" width={200} height={40} className="h-8 sm:h-10 w-auto" />
        </div>

        {/* Penguin Selection */}
        <section>
          <h2 className="text-lg font-[family-name:var(--font-fredoka)] font-semibold text-[var(--text-warm)] mb-4 flex items-center gap-2">
            <span className="text-xl">🐧</span> Choose Your Penguin
          </h2>

          <div className="flex flex-col md:flex-row gap-6">
            {/* 3D Preview */}
            <div className="flex flex-col items-center gap-3">
              <div
                className="rounded-2xl overflow-hidden border-2 transition-all duration-300"
                style={{
                  borderColor: skinInfo.ring + "60",
                  boxShadow: `0 0 30px ${skinInfo.ring}20, 0 0 60px ${skinInfo.ring}10`,
                  background:
                    "linear-gradient(135deg, #1C1814 0%, #0F0D0A 100%)",
                }}
              >
                <PenguinPreview skin={selectedSkin} width={240} height={280} />
              </div>
              <AnimatePresence mode="wait">
                <motion.p
                  key={selectedSkin}
                  className="text-lg font-[family-name:var(--font-fredoka)] font-semibold text-[var(--text-warm)] flex items-center gap-2"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                >
                  <span>{skinInfo.emoji}</span> {skinInfo.name}
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Skin Grid */}
            <div className="flex-1">
              <div className="grid grid-cols-5 gap-2.5">
                {skinKeys.map((skin) => {
                  const info = SKIN_DATA[skin] ?? SKIN_DATA["default"]!;
                  const isSelected = selectedSkin === skin;
                  return (
                    <motion.button
                      key={skin}
                      onClick={() => {
                        setSelectedSkin(skin);
                        persistSelectedSkin(skin);
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`relative aspect-square rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                        isSelected
                          ? "card-selected bg-[var(--bg-card-hover)]"
                          : "border-[var(--border-warm)] bg-[var(--bg-card)] hover:border-[var(--accent-gold)]/30 hover:bg-[var(--bg-card-hover)]"
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full bg-gradient-to-br ${info.gradient} flex items-center justify-center text-base`}
                      >
                        {info.emoji}
                      </div>
                      <span className="text-[10px] font-[family-name:var(--font-fredoka)] font-medium text-[var(--text-muted)]">
                        {info.name}
                      </span>
                      {isSelected && (
                        <motion.div
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--accent-orange)] flex items-center justify-center"
                          layoutId="skin-check"
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            fill="none"
                          >
                            <path
                              d="M2 5L4 7L8 3"
                              stroke="white"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </motion.div>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Map Selection */}
        <section>
          <h2 className="text-lg font-[family-name:var(--font-fredoka)] font-semibold text-[var(--text-warm)] mb-4 flex items-center gap-2">
            <span className="text-xl">🗺️</span> Choose Your Arena
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {maps.map((m) => {
              const envKey = MAP_ENV[m.id] || "Beach";
              const env = ENV_DATA[envKey] ?? ENV_DATA["Beach"]!;
              const isSelected = selectedMap === m.id;

              return (
                <motion.button
                  key={m.id}
                  onClick={() => setSelectedMap(m.id)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`relative p-4 rounded-xl border-2 transition-all text-left overflow-hidden ${
                    isSelected
                      ? "card-selected bg-[var(--bg-card-hover)]"
                      : "border-[var(--border-warm)] bg-[var(--bg-card)] hover:border-[var(--accent-gold)]/30 hover:bg-[var(--bg-card-hover)]"
                  }`}
                >
                  {/* Themed gradient overlay */}
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${env.gradient} pointer-events-none`}
                  />

                  <div className="relative flex items-start gap-3">
                    <div className="text-3xl mt-0.5">{env.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-[family-name:var(--font-fredoka)] font-semibold text-[var(--text-warm)] text-base">
                        {m.name}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {env.desc}
                      </p>
                      <div className="flex gap-3 mt-2">
                        <span className="text-[10px] text-[var(--text-dim)] bg-white/5 px-2 py-0.5 rounded-md font-mono">
                          {m.length}×{m.width}
                        </span>
                        <span className="text-[10px] text-[var(--text-dim)] bg-white/5 px-2 py-0.5 rounded-md font-mono">
                          friction: {m.friction}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </section>

        {/* Create Button */}
        <button
          onClick={handleCreate}
          disabled={loading || !selectedMap}
          className="game-btn-primary w-full font-[family-name:var(--font-fredoka)] text-xl rounded-xl"
        >
          {loading ? "Creating..." : "Create & Enter Lobby"}
        </button>

        {error && (
          <p className="text-[var(--accent-red)] text-sm text-center font-medium">
            {error}
          </p>
        )}
      </motion.div>
    </main>
  );
}
