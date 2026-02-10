"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRealtimeMessages } from "@/hooks/useRealtimeMessages";
import { useBridgeStatus } from "@/hooks/useBridgeStatus";
import { AgentSelector } from "./AgentSelector";
import { Send, Loader2, ChevronRight, Hexagon } from "lucide-react";
import type { AgentCommand } from "@/lib/types";

interface ChatMessage {
  role: "user" | "agent";
  content: string;
  commandId?: string;
  status?: string;
  agentId?: string;
  timestamp: string;
}

export function AgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [agentId, setAgentId] = useState("main");
  const [activeCommandId, setActiveCommandId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { fullText, isComplete } = useRealtimeMessages(activeCommandId);
  const { isOnline } = useBridgeStatus();

  useEffect(() => {
    if (!activeCommandId || !fullText) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "agent" && last.commandId === activeCommandId) {
        return [
          ...prev.slice(0, -1),
          { ...last, content: fullText, status: isComplete ? "completed" : "running" },
        ];
      }
      return prev;
    });
  }, [fullText, isComplete, activeCommandId]);

  useEffect(() => {
    if (isComplete && activeCommandId) {
      setActiveCommandId(null);
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isComplete, activeCommandId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setInput("");

    const userMsg: ChatMessage = {
      role: "user",
      content: trimmed,
      agentId,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId, message: trimmed }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to send command");
      }

      const command: AgentCommand = await res.json();

      const agentMsg: ChatMessage = {
        role: "agent",
        content: "",
        commandId: command.id,
        status: "pending",
        agentId,
        timestamp: command.created_at,
      };
      setMessages((prev) => [...prev, agentMsg]);
      setActiveCommandId(command.id);
    } catch (err) {
      setSending(false);
      const errorMsg: ChatMessage = {
        role: "agent",
        content: `[ERROR] ${err instanceof Error ? err.message : "Unknown error"}`,
        status: "failed",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  }, [input, agentId, sending]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: '#00f0ff10', background: 'linear-gradient(90deg, #0a0f1a, #05080f)' }}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Hexagon className="h-4 w-4" style={{ color: '#00f0ff66' }} />
            <h1 className="text-sm font-bold font-mono tracking-wider" style={{ color: '#00f0ff' }}>
              AGENT INTERFACE
            </h1>
          </div>
          <div className="h-4 w-px" style={{ background: '#00f0ff15' }} />
          <AgentSelector value={agentId} onChange={setAgentId} />
        </div>
        <div className="flex items-center gap-2">
          <div
            className="h-2 w-2 rounded-full"
            style={{
              background: isOnline ? '#39ff14' : '#ff2d5e',
              boxShadow: isOnline ? '0 0 6px #39ff14' : '0 0 6px #ff2d5e',
            }}
          />
          <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: isOnline ? '#39ff1488' : '#ff2d5e88' }}>
            {isOnline ? "Bridge Online" : "Bridge Offline"}
          </span>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-auto p-5" ref={scrollRef}>
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.length === 0 && (
            <div className="flex h-64 items-center justify-center">
              <div className="text-center">
                <div className="mb-4 flex justify-center">
                  <Hexagon className="h-12 w-12" style={{ color: '#00f0ff15' }} />
                </div>
                <p className="text-sm font-mono neon-glow" style={{ color: '#00f0ff88' }}>
                  [ AWAITING INPUT ]
                </p>
                <p className="mt-2 text-[11px] font-mono" style={{ color: '#4a6a8a' }}>
                  Send commands, delegate to akua, or orchestrate your fleet.
                </p>
                <div className="mt-4 flex items-center justify-center gap-2">
                  <div className="h-px w-12" style={{ background: 'linear-gradient(90deg, transparent, #00f0ff22)' }} />
                  <span className="text-[8px] font-mono" style={{ color: '#00f0ff22' }}>XMETAV://AGENT</span>
                  <div className="h-px w-12" style={{ background: 'linear-gradient(90deg, #00f0ff22, transparent)' }} />
                </div>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-lg px-4 py-3 relative ${
                  msg.role === "user" ? "" : ""
                }`}
                style={
                  msg.role === "user"
                    ? {
                        background: 'linear-gradient(135deg, #00f0ff18, #00f0ff08)',
                        border: '1px solid #00f0ff30',
                      }
                    : {
                        background: 'linear-gradient(135deg, #0a0f1a, #0d1525)',
                        border: `1px solid ${msg.status === "failed" ? '#ff2d5e20' : '#00f0ff12'}`,
                      }
                }
              >
                {/* Agent header */}
                {msg.role === "agent" && msg.agentId && (
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{ color: '#a855f7', background: '#a855f710', border: '1px solid #a855f720' }}
                    >
                      {msg.agentId}
                    </span>
                    {msg.status === "running" && (
                      <div className="flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" style={{ color: '#00f0ff66' }} />
                        <span className="text-[8px] font-mono" style={{ color: '#00f0ff44' }}>
                          STREAMING
                        </span>
                      </div>
                    )}
                    {msg.status === "pending" && (
                      <span className="text-[8px] font-mono animate-pulse" style={{ color: '#f59e0b66' }}>
                        QUEUED
                      </span>
                    )}
                  </div>
                )}

                {/* User header */}
                {msg.role === "user" && (
                  <div className="mb-1.5 flex items-center gap-2">
                    <ChevronRight className="h-3 w-3" style={{ color: '#00f0ff66' }} />
                    <span className="text-[8px] font-mono uppercase tracking-wider" style={{ color: '#00f0ff44' }}>
                      OPERATOR
                    </span>
                  </div>
                )}

                <pre
                  className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed"
                  style={{
                    color: msg.role === "user" ? '#00f0ffcc' : msg.status === "failed" ? '#ff2d5ecc' : '#c8d6e5cc',
                  }}
                >
                  {msg.content || (msg.status === "pending" ? "// waiting for bridge..." : "")}
                </pre>

                {/* Running cursor */}
                {msg.status === "running" && (
                  <span
                    className="inline-block w-2 h-4 ml-0.5 animate-pulse"
                    style={{ background: '#00f0ff', boxShadow: '0 0 4px #00f0ff' }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="border-t px-5 py-4" style={{ borderColor: '#00f0ff10', background: 'linear-gradient(0deg, #0a0f1a, transparent)' }}>
        <div className="mx-auto flex max-w-3xl gap-2 items-end">
          <div className="flex-1 relative">
            <ChevronRight
              className="absolute left-3 top-3 h-4 w-4"
              style={{ color: '#00f0ff44' }}
            />
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`command@${agentId}:~$ `}
              className="w-full min-h-[44px] max-h-32 rounded pl-9 pr-3 py-3 font-mono text-sm resize-none cyber-input"
              disabled={sending}
              rows={1}
            />
          </div>
          <button
            onClick={sendMessage}
            disabled={sending || !input.trim()}
            className="h-11 w-11 rounded flex items-center justify-center cyber-btn shrink-0 disabled:opacity-30"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#00f0ff' }} />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <div className="mx-auto max-w-3xl mt-2 flex items-center justify-between">
          <span className="text-[8px] font-mono" style={{ color: '#4a6a8a33' }}>
            ENTER to send | SHIFT+ENTER for newline
          </span>
          <span className="text-[8px] font-mono" style={{ color: '#4a6a8a33' }}>
            XMETAV::ENCRYPTED_CHANNEL
          </span>
        </div>
      </div>
    </div>
  );
}
