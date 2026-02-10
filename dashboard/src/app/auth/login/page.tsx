"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [mounted, setMounted] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    window.location.href = "/";
  }

  return (
    <div className="min-h-screen flex items-center justify-center cyber-bg scanline-overlay hex-pattern overflow-hidden">
      {/* Floating hex particles */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {mounted && Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="absolute text-[10px] font-mono opacity-[0.04]"
            style={{
              color: '#00f0ff',
              left: `${10 + i * 12}%`,
              top: `${20 + (i * 37) % 60}%`,
              animation: `hex-float ${6 + i * 1.5}s ease-in-out infinite`,
              animationDelay: `${i * 0.8}s`,
            }}
          >
            {['0xF0FF', '0xDEAD', '0xBEEF', '0xCAFE', '0xC0DE', '0xFACE', '0x1337', '0xBABE'][i]}
          </div>
        ))}
      </div>

      <div className={`w-full max-w-md transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {/* Glitch title */}
        <div className="text-center mb-8">
          <h1
            className="text-4xl font-bold tracking-wider neon-glow-strong glitch-text"
            data-text="XMETAV"
            style={{ color: '#00f0ff' }}
          >
            XMETAV
          </h1>
          <div className="mt-2 flex items-center justify-center gap-2">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#00f0ff33]" />
            <span className="text-[10px] font-mono uppercase tracking-[0.3em]" style={{ color: '#00f0ff66' }}>
              control plane
            </span>
            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#00f0ff33]" />
          </div>
        </div>

        {/* Login card */}
        <div className="cyber-card rounded-lg p-6 neon-border-breathe">
          {/* Corner accents */}
          <div className="absolute top-0 left-0 w-4 h-4 border-t border-l" style={{ borderColor: '#00f0ff44' }} />
          <div className="absolute top-0 right-0 w-4 h-4 border-t border-r" style={{ borderColor: '#00f0ff44' }} />
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l" style={{ borderColor: '#00f0ff44' }} />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r" style={{ borderColor: '#00f0ff44' }} />

          <div className="text-center mb-6">
            <p className="text-sm font-mono" style={{ color: '#4a6a8a' }}>
              {mode === "login"
                ? "// authenticate to access system"
                : "// initialize new operator"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider mb-1.5" style={{ color: '#00f0ff66' }}>
                Operator ID
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full h-11 rounded px-3 font-mono text-sm cyber-input"
                placeholder="operator@xmetav.io"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider mb-1.5" style={{ color: '#00f0ff66' }}>
                Access Key
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full h-11 rounded px-3 font-mono text-sm cyber-input"
                placeholder="••••••••••"
              />
            </div>

            {error && (
              <div className="rounded border px-3 py-2" style={{ borderColor: '#ff2d5e33', background: '#ff2d5e08' }}>
                <p className="text-xs font-mono" style={{ color: '#ff2d5e' }}>
                  [ERROR] {error}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded font-mono text-sm uppercase tracking-wider cyber-btn cyber-btn-primary disabled:opacity-40"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: '#00f0ff' }} />
                  Authenticating...
                </span>
              ) : mode === "login" ? (
                "[ AUTHENTICATE ]"
              ) : (
                "[ INITIALIZE ]"
              )}
            </button>
          </form>

          <div className="mt-5 text-center">
            <button
              type="button"
              className="text-[11px] font-mono transition-colors hover:underline"
              style={{ color: '#00f0ff55' }}
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#00f0ff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#00f0ff55')}
            >
              {mode === "login"
                ? "// new operator? initialize account"
                : "// existing operator? authenticate"}
            </button>
          </div>
        </div>

        {/* Bottom status line */}
        <div className="mt-4 flex items-center justify-between px-1">
          <span className="text-[9px] font-mono" style={{ color: '#00f0ff22' }}>
            v1.0.0
          </span>
          <span className="text-[9px] font-mono" style={{ color: '#00f0ff22' }}>
            SUPABASE::ENCRYPTED
          </span>
        </div>
      </div>
    </div>
  );
}
