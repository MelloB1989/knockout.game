"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";

const ADJECTIVES = ["Swift", "Fierce", "Icy", "Mighty", "Shadow", "Turbo", "Sneaky", "Bold"];
const NOUNS = ["Penguin", "Slider", "Dasher", "Glider", "Chiller", "Brawler", "Drifter"];

function randomName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
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
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a2e] via-[#0a0a0f] to-[#0f0a1a]" />
      <div className="absolute inset-0 opacity-20">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-cyan-500/20 animate-pulse"
            style={{
              width: `${20 + (i * 7) % 40}px`,
              height: `${20 + (i * 11) % 40}px`,
              left: `${(i * 17) % 100}%`,
              top: `${(i * 23) % 100}%`,
              animationDelay: `${(i * 0.4) % 3}s`,
              animationDuration: `${2 + (i * 0.3) % 3}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 px-4">
        <div className="text-center">
          <h1 className="text-7xl font-black tracking-tighter bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent drop-shadow-2xl">
            KNOCKOUT
          </h1>
          <p className="text-lg text-white/50 mt-2 font-medium tracking-wide">
            PENGUIN BATTLE ROYALE
          </p>
        </div>

        <div className="w-full max-w-xs">
          <label className="block text-xs text-white/40 uppercase tracking-widest mb-2 text-center">
            Your Name
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={20}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center text-lg font-semibold text-white placeholder-white/20 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all"
            placeholder="Enter name..."
          />
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={handleCreate}
            disabled={loading || !username.trim()}
            className="group relative w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
          >
            <span className="relative z-10">
              {loading ? "Connecting..." : "Create Game"}
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>

          <button
            onClick={handleJoin}
            disabled={loading || !username.trim()}
            className="group relative w-full py-4 rounded-xl font-bold text-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Connecting..." : "Join Game"}
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-sm animate-pulse">{error}</p>
        )}
      </div>
    </main>
  );
}
