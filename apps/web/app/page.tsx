"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { motion } from "framer-motion";

const ADJECTIVES = ["Swift", "Fierce", "Icy", "Mighty", "Shadow", "Turbo", "Sneaky", "Bold"];
const NOUNS = ["Penguin", "Slider", "Dasher", "Glider", "Chiller", "Brawler", "Drifter"];

function randomName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
}

// Floating particle component
function Particles() {
  const particles = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: 3 + Math.random() * 5,
      duration: 8 + Math.random() * 12,
      delay: Math.random() * 10,
      color: Math.random() > 0.5
        ? `rgba(255, 107, 44, ${0.3 + Math.random() * 0.4})`
        : `rgba(255, 184, 0, ${0.2 + Math.random() * 0.3})`,
    })), []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: p.left,
            bottom: "-20px",
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animation: `float-particle ${p.duration}s ${p.delay}s linear infinite`,
          }}
        />
      ))}
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { initGuest, isReady } = useAuthStore();
  const [username, setUsername] = useState(() => randomName());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const authenticate = async () => {
    if (isReady) return;
    setLoading(true);
    setError("");
    try {
      await initGuest(username);
    } catch {
      setError("Failed to connect. Is the server running?");
      setLoading(false);
      throw new Error("auth failed");
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    try {
      await authenticate();
      router.push("/create");
    } catch {
      // error already set
    }
  };

  const handleJoin = async () => {
    try {
      await authenticate();
      router.push("/join");
    } catch {
      // error already set
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-[#0F0D0A]" />
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255, 107, 44, 0.08) 0%, transparent 100%),
            radial-gradient(ellipse 60% 40% at 30% 80%, rgba(255, 184, 0, 0.05) 0%, transparent 100%),
            radial-gradient(ellipse 50% 30% at 80% 60%, rgba(46, 204, 113, 0.04) 0%, transparent 100%)
          `,
        }}
      />

      <Particles />

      {/* Content */}
      <motion.div
        className="relative z-10 flex flex-col items-center gap-10 px-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {/* Penguin decorations */}
        <motion.div
          className="flex gap-3 text-4xl select-none"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5, type: "spring", bounce: 0.5 }}
        >
          <span className="animate-bounce" style={{ animationDelay: "0s", animationDuration: "2s" }}>🐧</span>
          <span className="animate-bounce" style={{ animationDelay: "0.3s", animationDuration: "2.2s" }}>🐧</span>
          <span className="animate-bounce" style={{ animationDelay: "0.6s", animationDuration: "1.8s" }}>🐧</span>
        </motion.div>

        {/* Title */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.5, type: "spring", bounce: 0.3 }}
        >
          <h1
            className="text-8xl sm:text-9xl font-[family-name:var(--font-bungee)] text-gradient-warm title-3d leading-none"
          >
            KNOCKOUT
          </h1>
          <p className="text-sm sm:text-base text-[var(--text-muted)] mt-3 font-[family-name:var(--font-fredoka)] font-medium tracking-[0.25em] uppercase">
            Penguin Battle Royale
          </p>
        </motion.div>

        {/* Name input */}
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <label className="block text-xs text-[var(--text-dim)] uppercase tracking-[0.2em] mb-2.5 text-center font-[family-name:var(--font-fredoka)] font-medium">
            Your Name
          </label>
          <div className="relative">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={20}
              className="w-full bg-[var(--bg-card)] border-2 border-[var(--border-warm)] rounded-xl px-4 py-3.5 text-center text-lg font-semibold text-[var(--text-warm)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--accent-orange)]/40 focus:shadow-[0_0_20px_rgba(255,107,44,0.15)] transition-all font-[family-name:var(--font-fredoka)]"
              placeholder="Enter name..."
            />
            <button
              type="button"
              onClick={() => setUsername(randomName())}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xl hover:scale-110 active:scale-95 transition-transform"
              title="Random name"
            >
              🎲
            </button>
          </div>
        </motion.div>

        {/* Action buttons */}
        <motion.div
          className="flex flex-col sm:flex-row gap-4 w-full max-w-sm"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.4 }}
        >
          <button
            onClick={handleCreate}
            disabled={loading || !username.trim()}
            className="game-btn-primary flex-1 font-[family-name:var(--font-fredoka)]"
          >
            {loading ? "Connecting..." : "Create Game"}
          </button>

          <button
            onClick={handleJoin}
            disabled={loading || !username.trim()}
            className="game-btn-secondary flex-1 font-[family-name:var(--font-fredoka)]"
          >
            {loading ? "Connecting..." : "Join Game"}
          </button>
        </motion.div>

        {error && (
          <motion.p
            className="text-[var(--accent-red)] text-sm font-medium"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {error}
          </motion.p>
        )}

        {/* Footer */}
        <motion.p
          className="text-[var(--text-dim)] text-xs mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ delay: 0.8 }}
        >
          Last penguin standing wins
        </motion.p>
      </motion.div>
    </main>
  );
}
