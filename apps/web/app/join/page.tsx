"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { useGameStore } from "@/lib/game-store";
import { ALL_SKINS } from "@/lib/constants";

export default function JoinPage() {
  const router = useRouter();
  const { isReady } = useAuthStore();
  const { setGameId, setIsHost } = useGameStore();

  const [gameCode, setGameCode] = useState("");
  const [selectedSkin, setSelectedSkin] = useState("default");

  useEffect(() => {
    if (!isReady) {
      router.replace("/");
    }
  }, [isReady, router]);

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

  const handleJoin = () => {
    if (!gameCode.trim()) return;
    setGameId(gameCode.trim().toUpperCase());
    setIsHost(false);
    // Store skin choice for the game page to use
    sessionStorage.setItem("selectedSkin", selectedSkin);
    router.push(`/game/${gameCode.trim()}`);
  };

  return (
    <main className="min-h-screen flex flex-col items-center relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a2e] via-[#0a0a0f] to-[#0f0a1a]" />

      <div className="relative z-10 w-full max-w-md px-4 py-12 flex flex-col gap-8">
        <button
          onClick={() => router.push("/")}
          className="text-white/40 hover:text-white/70 transition-colors self-start text-sm"
        >
          &larr; Back
        </button>

        <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
          Join Game
        </h1>

        {/* Game Code */}
        <div>
          <label className="block text-xs text-white/40 uppercase tracking-widest mb-2">
            Game Code
          </label>
          <input
            type="text"
            value={gameCode}
            onChange={(e) => setGameCode(e.target.value.toUpperCase())}
            maxLength={10}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-center text-2xl font-mono font-bold text-white tracking-[0.3em] placeholder-white/20 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all uppercase"
            placeholder="ABCDEF"
            autoFocus
          />
        </div>

        {/* Skin Selection */}
        <section>
          <h2 className="text-xs text-white/40 uppercase tracking-widest mb-3">
            Choose Your Penguin
          </h2>
          <div className="grid grid-cols-5 gap-2">
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
                <div className="w-5 h-5 rounded-full bg-gradient-to-b from-white/20 to-white/5" />
                <span className="text-[9px] text-white/50">
                  {skinDisplayNames[skin] || skin}
                </span>
              </button>
            ))}
          </div>
        </section>

        <button
          onClick={handleJoin}
          disabled={!gameCode.trim()}
          className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Join Game
        </button>
      </div>
    </main>
  );
}
