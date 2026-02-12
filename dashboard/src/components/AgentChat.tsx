"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRealtimeMessages } from "@/hooks/useRealtimeMessages";
import { useBridgeStatus } from "@/hooks/useBridgeStatus";
import { useVoice } from "@/hooks/useVoice";
import { AgentSelector } from "./AgentSelector";
import { Send, Loader2, ChevronRight, Hexagon, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import type { AgentCommand } from "@/lib/types";

// ────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  commandId?: string;
  status?: string;
  agentId?: string;
  timestamp: string;
}

let msgCounter = 0;
function nextId() {
  return `msg-${++msgCounter}-${Date.now()}`;
}

// ────────────────────────────────────────────────────
// Memoized message bubble
// ────────────────────────────────────────────────────

const MessageBubble = React.memo(function MessageBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] rounded-lg px-4 py-3 relative"
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

        {msg.status === "running" && (
          <span
            className="inline-block w-2 h-4 ml-0.5 animate-pulse"
            style={{ background: '#00f0ff', boxShadow: '0 0 4px #00f0ff' }}
          />
        )}
      </div>
    </div>
  );
});

// ────────────────────────────────────────────────────
// Auto-resize textarea hook
// ────────────────────────────────────────────────────

function useAutoResize(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [ref, value]);
}

// ────────────────────────────────────────────────────
// Main chat component
// ────────────────────────────────────────────────────

export function AgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [agentId, setAgentId] = useState("main");
  const [activeCommandId, setActiveCommandId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const shouldScrollRef = useRef(true);
  const activeIdRef = useRef<string | null>(null);

  // Keep ref in sync for use in callbacks
  activeIdRef.current = activeCommandId;

  const { fullText, isComplete } = useRealtimeMessages(activeCommandId);
  const { isOnline } = useBridgeStatus();
  const {
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    isListening,
    isSpeaking,
    isTranscribing,
    error: voiceError,
    voiceEnabled,
    toggleVoice,
  } = useVoice();

  useAutoResize(inputRef, input);

  // ── Smart auto-scroll: only if user is near bottom ──
  const checkShouldScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 100;
    shouldScrollRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  const scrollToBottom = useCallback(() => {
    if (!shouldScrollRef.current) return;
    const el = scrollRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, []);

  // ── Update streaming message ──
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
    scrollToBottom();
  }, [fullText, isComplete, activeCommandId, scrollToBottom]);

  // ── Command complete ──
  useEffect(() => {
    if (isComplete && activeCommandId) {
      setActiveCommandId(null);
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isComplete, activeCommandId]);

  // ── Send message (accepts optional text for voice input) ──
  const sendMessage = useCallback(async (overrideText?: string) => {
    const trimmed = (overrideText ?? input).trim();
    if (!trimmed || sending) return;

    setSending(true);
    if (!overrideText) setInput("");
    shouldScrollRef.current = true;

    const userMsg: ChatMessage = {
      id: nextId(),
      role: "user",
      content: trimmed,
      agentId,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    scrollToBottom();

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
        id: nextId(),
        role: "agent",
        content: "",
        commandId: command.id,
        status: "pending",
        agentId,
        timestamp: command.created_at,
      };
      setMessages((prev) => [...prev, agentMsg]);
      setActiveCommandId(command.id);
      scrollToBottom();
    } catch (err) {
      setSending(false);
      const errorMsg: ChatMessage = {
        id: nextId(),
        role: "agent",
        content: `[ERROR] ${err instanceof Error ? err.message : "Unknown error"}`,
        status: "failed",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  }, [input, agentId, sending, scrollToBottom]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  // ── Auto-speak response when voice mode is on ──
  const lastSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      voiceEnabled &&
      isComplete &&
      fullText &&
      fullText !== lastSpokenRef.current &&
      !isSpeaking
    ) {
      lastSpokenRef.current = fullText;
      speak(fullText);
    }
  }, [voiceEnabled, isComplete, fullText, isSpeaking, speak]);

  // ── Voice mic toggle ──
  const handleMicToggle = useCallback(async () => {
    if (isListening) {
      const text = await stopListening();
      if (text) {
        sendMessage(text);
      }
    } else {
      await startListening();
    }
  }, [isListening, stopListening, startListening, sendMessage]);

  // ── Global keyboard shortcut: / to focus input ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        const active = document.activeElement;
        const isInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
        if (!isInput) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-4 sm:px-5 py-3 border-b shrink-0"
        style={{ borderColor: '#00f0ff10', background: 'linear-gradient(90deg, #0a0f1a, #05080f)' }}
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <Hexagon className="h-4 w-4" style={{ color: '#00f0ff66' }} />
            <h1 className="text-sm font-bold font-mono tracking-wider hidden sm:block" style={{ color: '#00f0ff' }}>
              AGENT INTERFACE
            </h1>
          </div>
          <div className="h-4 w-px hidden sm:block" style={{ background: '#00f0ff15' }} />
          <AgentSelector value={agentId} onChange={setAgentId} />
        </div>
        <div className="flex items-center gap-3">
          {/* Voice toggle */}
          <button
            onClick={toggleVoice}
            className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors"
            style={{
              color: voiceEnabled ? '#39ff14' : '#4a6a8a',
              background: voiceEnabled ? '#39ff1408' : 'transparent',
              border: `1px solid ${voiceEnabled ? '#39ff1420' : '#00f0ff10'}`,
            }}
            title={voiceEnabled ? "Voice mode ON — click to disable" : "Voice mode OFF — click to enable"}
          >
            {voiceEnabled ? (
              <Volume2 className="h-3.5 w-3.5" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" />
            )}
            <span className="text-[8px] font-mono uppercase tracking-wider hidden sm:inline">
              Voice {voiceEnabled ? "ON" : "OFF"}
            </span>
          </button>

          <div className="h-4 w-px" style={{ background: '#00f0ff10' }} />

          {/* Bridge status */}
          <div className="flex items-center gap-2">
            <div
              className="h-2 w-2 rounded-full"
              style={{
                background: isOnline ? '#39ff14' : '#ff2d5e',
                boxShadow: isOnline ? '0 0 6px #39ff14' : '0 0 6px #ff2d5e',
              }}
            />
            <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: isOnline ? '#39ff1488' : '#ff2d5e88' }}>
              {isOnline ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div
        className="flex-1 overflow-auto p-4 sm:p-5"
        ref={scrollRef}
        onScroll={checkShouldScroll}
      >
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
                <p className="mt-3 text-[9px] font-mono" style={{ color: '#4a6a8a44' }}>
                  Press / to focus input
                </p>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="border-t px-4 sm:px-5 py-3 sm:py-4 shrink-0" style={{ borderColor: '#00f0ff10', background: 'linear-gradient(0deg, #0a0f1a, transparent)' }}>
        <div className="mx-auto flex max-w-3xl gap-2 items-end">
          <div className="flex-1 relative">
            <ChevronRight
              className="absolute left-3 top-3 h-4 w-4 pointer-events-none"
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
          {/* Mic button (shown when voice enabled) */}
          {voiceEnabled && (
            <button
              onClick={handleMicToggle}
              disabled={sending || isTranscribing}
              className="h-11 w-11 rounded flex items-center justify-center shrink-0 transition-all"
              style={{
                background: isListening
                  ? '#ff2d5e18'
                  : isTranscribing
                  ? '#f59e0b10'
                  : '#00f0ff08',
                border: `1px solid ${
                  isListening
                    ? '#ff2d5e40'
                    : isTranscribing
                    ? '#f59e0b30'
                    : '#00f0ff20'
                }`,
                boxShadow: isListening ? '0 0 12px #ff2d5e30' : 'none',
              }}
              title={isListening ? "Stop recording" : "Start voice command"}
            >
              {isTranscribing ? (
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#f59e0b' }} />
              ) : isListening ? (
                <MicOff className="h-4 w-4 animate-pulse" style={{ color: '#ff2d5e' }} />
              ) : (
                <Mic className="h-4 w-4" style={{ color: '#00f0ff88' }} />
              )}
            </button>
          )}

          {/* Send button */}
          <button
            onClick={() => sendMessage()}
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
        <div className="mx-auto max-w-3xl mt-1.5 flex items-center justify-between">
          <span className="text-[8px] font-mono" style={{ color: '#4a6a8a33' }}>
            ENTER send | SHIFT+ENTER newline | / focus{voiceEnabled ? " | MIC voice" : ""}
          </span>
          <div className="flex items-center gap-2">
            {voiceError && (
              <span className="text-[8px] font-mono" style={{ color: '#ff2d5e66' }}>
                {voiceError}
              </span>
            )}
            {isListening && (
              <span className="text-[8px] font-mono animate-pulse" style={{ color: '#ff2d5e88' }}>
                RECORDING...
              </span>
            )}
            {isTranscribing && (
              <span className="text-[8px] font-mono animate-pulse" style={{ color: '#f59e0b88' }}>
                TRANSCRIBING...
              </span>
            )}
            {isSpeaking && (
              <span className="text-[8px] font-mono animate-pulse" style={{ color: '#39ff1488' }}>
                SPEAKING...
              </span>
            )}
            {!isListening && !isTranscribing && !isSpeaking && (
              <span className="text-[8px] font-mono hidden sm:block" style={{ color: '#4a6a8a33' }}>
                XMETAV::ENCRYPTED_CHANNEL
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
