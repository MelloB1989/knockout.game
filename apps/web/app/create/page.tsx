"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { useGameStore } from "@/lib/game-store";
import { createGame, getMaps } from "@/lib/api";
import { ALL_SKINS, skinToGlb, ENVIRONMENT_MAP } from "@/lib/constants";
import type { MapConfig } from "@/lib/types";

export default function CreatePage() {
  const router = useRouter();
  const { token, playerId, isReady } = useAuthStore();
  const { setGameId, setIsHost } = useGameStore();

  const [maps, setMaps] = useState<MapConfig[]>([]);
  const [selectedMap, setSelectedMap] = useState("");
  const [selectedSkin, setSelectedSkin] = useState("default");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
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
  }, [isReady, router]);

  const handleCreate = async () => {
    if (!token || !selectedMap) return;
    setLoading(true);
    setError("");
    try {
      const res = await createGame(token, {
        map_type: selectedMap,
        skin: selectedSkin,
      });
      sessionStorage.setItem("selectedSkin", selectedSkin);
      setGameId(res.game_id);
      setIsHost(true);
      router.push(`/game/${res.game_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create game");
      setLoading(false);
    }
  };

  const skinKeys = Object.keys(ALL_SKINS);
  const skinDisplayNames: Record<string, string> = {
    default: "Classic",
    icy: "Icy",
    lava: "Lava",
    forest: "Forest",
    neon: "Neon",
    shadow: "Shadow",
    pink: "Pink",
    shark: "Shark",
    tuxedo: "Tuxedo",
    goldking: "Gold King",
  };

  const mapEnvironments: Record<string, string> = {
    frozen_lake: "Arctic",
    tundra_ring: "Arctic",
    glacier_pass: "Rainy",
    volcano_rim: "Desert",
    neon_arena: "Dystopian",
  };

  return (
    <main className="min-h-screen flex flex-col items-center relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a2e] via-[#0a0a0f] to-[#0f0a1a]" />

      <div className="relative z-10 w-full max-w-2xl px-4 py-12 flex flex-col gap-8">
        <button
          onClick={() => router.push("/")}
          className="text-white/40 hover:text-white/70 transition-colors self-start text-sm"
        >
          &larr; Back
        </button>

        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
          Create Game
        </h1>

        {/* Map Selection */}
        <section>
          <h2 className="text-sm text-white/40 uppercase tracking-widest mb-3">
            Select Arena
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {maps.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMap(m.id)}
                className={`relative p-4 rounded-xl border transition-all text-left ${
                  selectedMap === m.id
                    ? "border-cyan-500/60 bg-cyan-500/10 shadow-lg shadow-cyan-500/10"
                    : "border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/20"
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-white">{m.name}</p>
                    <p className="text-xs text-white/40 mt-1">
                      {m.length}x{m.width} &middot; Friction: {m.friction}
                    </p>
                  </div>
                  <span className="text-xs text-white/30 bg-white/5 px-2 py-1 rounded-md">
                    {mapEnvironments[m.id] || "Beach"}
                  </span>
                </div>
                {selectedMap === m.id && (
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-cyan-400" />
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Skin Selection */}
        <section>
          <h2 className="text-sm text-white/40 uppercase tracking-widest mb-3">
            Choose Your Penguin
          </h2>
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
            {skinKeys.map((skin) => (
              <button
                key={skin}
                onClick={() => setSelectedSkin(skin)}
                className={`aspect-square rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                  selectedSkin === skin
                    ? "border-cyan-500/60 bg-cyan-500/10 scale-110 shadow-lg shadow-cyan-500/10"
                    : "border-white/10 bg-white/5 hover:bg-white/8 hover:border-white/20"
                }`}
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-b from-white/20 to-white/5" />
                <span className="text-[10px] text-white/50">
                  {skinDisplayNames[skin] || skin}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Create Button */}
        <button
          onClick={handleCreate}
          disabled={loading || !selectedMap}
          className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Creating..." : "Create & Enter Lobby"}
        </button>

        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}
      </div>
    </main>
  );
}
