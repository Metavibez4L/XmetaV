"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, ChevronRight } from "lucide-react";

export function QuickCommand() {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: "main", message: input.trim() }),
      });

      if (res.ok) {
        setInput("");
        router.push("/agent");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-center">
      <ChevronRight className="h-4 w-4 shrink-0" style={{ color: '#00f0ff66' }} />
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="enter command for main agent..."
        className="flex-1 h-10 rounded px-3 font-mono text-sm cyber-input"
        disabled={sending}
      />
      <button
        type="submit"
        disabled={sending || !input.trim()}
        className="h-10 w-10 rounded flex items-center justify-center cyber-btn disabled:opacity-30 shrink-0"
      >
        {sending ? (
          <span className="inline-block w-3.5 h-3.5 border border-t-transparent rounded-full animate-spin" style={{ borderColor: '#00f0ff' }} />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </button>
    </form>
  );
}
