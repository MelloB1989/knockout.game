"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { useGameStore } from "@/lib/game-store";
import { ALL_SKINS } from "@/lib/constants";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";

const PenguinPreview = dynamic(() => import("@/components/ui/PenguinPreview"), { ssr: false });

const SKIN_DATA: Record<string, { name: string; gradient: string; emoji: string; ring: string }> = {
  default: { name: "Classic", gradient: "from-neutral-500 to-neutral-700", emoji: "🐧", ring: "#6B7280" },
  icy: { name: "Icy", gradient: "from-gray-300 to-gray-500", emoji: "❄️", ring: "#9CA3AF" },
  lava: { name: "Lava", gradient: "from-red-500 to-orange-600", emoji: "🔥", ring: "#EF4444" },
  forest: { name: "Forest", gradient: "from-green-500 to-emerald-700", emoji: "🌿", ring: "#22C55E" },
  neon: { name: "Neon", gradient: "from-yellow-400 to-amber-500", emoji: "⚡", ring: "#EAB308" },
  shadow: { name: "Shadow", gradient: "from-neutral-700 to-neutral-900", emoji: "🌑", ring: "#404040" },
  pink: { name: "Pink", gradient: "from-pink-400 to-rose-500", emoji: "🌸", ring: "#EC4899" },
  shark: { name: "Shark", gradient: "from-neutral-500 to-neutral-700", emoji: "🦈", ring: "#6B7280" },
  tuxedo: { name: "Tuxedo", gradient: "from-neutral-800 to-neutral-950", emoji: "🎩", ring: "#262626" },
  goldking: { name: "Gold King", gradient: "from-yellow-500 to-amber-600", emoji: "👑", ring: "#F59E0B" },
};

export default function JoinPage() {
  const router = useRouter();
  const {
    isReady,
    hasHydrated,
    selectedSkin: persistedSkin,
    setSelectedSkin: persistSelectedSkin,
  } = useAuthStore();
  const { setGameId, setIsHost } = useGameStore();

  const [gameCode, setGameCode] = useState("");
  const [selectedSkin, setSelectedSkin] = useState(persistedSkin || "default");

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isReady) router.replace("/");
  }, [hasHydrated, isReady, router]);

  useEffect(() => {
    if (!hasHydrated) return;
    setSelectedSkin(persistedSkin || "default");
  }, [hasHydrated, persistedSkin]);

  const skinKeys = Object.keys(ALL_SKINS);
  const skinInfo = SKIN_DATA[selectedSkin] ?? SKIN_DATA["default"]!;

  const handleJoin = () => {
    if (!gameCode.trim()) return;
    setGameId(gameCode.trim());
    setIsHost(false);
    persistSelectedSkin(selectedSkin);
    router.push(`/game/${gameCode.trim()}`);
  };

  return (
    <main className="min-h-screen flex flex-col items-center relative overflow-hidden">
      <div className="absolute inset-0 bg-[var(--bg-primary)]" />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          background: `
            radial-gradient(ellipse 70% 40% at 50% 0%, rgba(255, 107, 44, 0.06) 0%, transparent 100%),
            radial-gradient(ellipse 50% 30% at 20% 80%, rgba(255, 184, 0, 0.04) 0%, transparent 100%)
          `,
        }}
      />

      <motion.div
        className="relative z-10 w-full max-w-lg px-4 py-8 flex flex-col gap-8"
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
            <span className="text-lg">&larr;</span> Back
          </button>
          <h1 className="text-2xl font-[family-name:var(--font-bungee)] text-gradient-warm">
            KNOCKOUT
          </h1>
        </div>

        <h2 className="text-3xl font-[family-name:var(--font-fredoka)] font-bold text-[var(--text-warm)]">
          Join a Game
        </h2>

        {/* Game Code Input */}
        <div>
          <label className="block text-xs text-[var(--text-dim)] uppercase tracking-[0.2em] mb-2.5 font-[family-name:var(--font-fredoka)] font-medium">
            Game Code
          </label>
          <input
            type="text"
            value={gameCode}
            onChange={(e) => setGameCode(e.target.value)}
            maxLength={36}
            className="w-full bg-[var(--bg-card)] border-2 border-[var(--border-warm)] rounded-xl px-4 py-4 text-center text-2xl font-mono font-bold text-[var(--text-warm)] tracking-[0.15em] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent-orange)]/40 focus:shadow-[0_0_20px_rgba(255,107,44,0.15)] transition-all"
            placeholder="Paste game code"
            autoFocus
          />
        </div>

        {/* Skin Selection */}
        <section>
          <h3 className="text-lg font-[family-name:var(--font-fredoka)] font-semibold text-[var(--text-warm)] mb-4 flex items-center gap-2">
            <span className="text-xl">🐧</span> Choose Your Penguin
          </h3>

          <div className="flex flex-col items-center gap-4">
            {/* Preview */}
            <div
              className="rounded-2xl overflow-hidden border-2 transition-all duration-300"
              style={{
                borderColor: skinInfo.ring + "60",
                boxShadow: `0 0 30px ${skinInfo.ring}20`,
                background: "linear-gradient(135deg, #1C1814 0%, #0F0D0A 100%)",
              }}
            >
              <PenguinPreview skin={selectedSkin} width={200} height={240} />
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={selectedSkin}
                className="text-base font-[family-name:var(--font-fredoka)] font-semibold text-[var(--text-warm)] flex items-center gap-2"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <span>{skinInfo.emoji}</span> {skinInfo.name}
              </motion.p>
            </AnimatePresence>

            {/* Grid */}
            <div className="grid grid-cols-5 gap-2.5 w-full">
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
                    <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${info.gradient} flex items-center justify-center text-sm`}>
                      {info.emoji}
                    </div>
                    <span className="text-[9px] font-[family-name:var(--font-fredoka)] font-medium text-[var(--text-muted)]">
                      {info.name}
                    </span>
                    {isSelected && (
                      <motion.div
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--accent-orange)] flex items-center justify-center"
                        layoutId="skin-check-join"
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </motion.div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Join Button */}
        <button
          onClick={handleJoin}
          disabled={!gameCode.trim()}
          className="game-btn-green w-full font-[family-name:var(--font-fredoka)] text-xl"
        >
          Join Game
        </button>
      </motion.div>
    </main>
  );
}
