"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useRealtimeMessages } from "@/hooks/useRealtimeMessages";
import { useBridgeStatus } from "@/hooks/useBridgeStatus";
import { useVoice } from "@/hooks/useVoice";
import { useWakeWord } from "@/hooks/useWakeWord";
import { AgentSelector } from "./AgentSelector";
import { VoiceWaveform } from "./VoiceWaveform";
import { VoiceSettingsPanel } from "./VoiceSettings";
import { ChatHistory } from "./ChatHistory";
import type { HistoryEntry } from "./ChatHistory";
import { AgentTerminal } from "./AgentTerminal";
import {
  Send,
  Loader2,
  ChevronRight,
  Hexagon,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Radio,
  Repeat,
  History,
  Terminal,
} from "lucide-react";
import type { AgentCommand } from "@/lib/types";
import { cleanAgentOutput } from "@/lib/utils";

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
// Memoized message bubble (completed / historical messages)
// ────────────────────────────────────────────────────

const MessageBubble = React.memo(function MessageBubble({
  msg,
}: {
  msg: ChatMessage;
}) {
  return (
    <div
      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
    >
      <div
        className="max-w-[85%] rounded-lg px-4 py-3 relative"
        style={
          msg.role === "user"
            ? {
                background: "linear-gradient(135deg, #00f0ff18, #00f0ff08)",
                border: "1px solid #00f0ff30",
              }
            : {
                background: "linear-gradient(135deg, #0a0f1a, #0d1525)",
                border: `1px solid ${msg.status === "failed" ? "#ff2d5e20" : "#00f0ff12"}`,
              }
        }
      >
        {msg.role === "agent" && msg.agentId && (
          <div className="mb-2 flex items-center gap-2">
            <span
              className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{
                color: "#a855f7",
                background: "#a855f710",
                border: "1px solid #a855f720",
              }}
            >
              {msg.agentId}
            </span>
            {msg.status === "pending" && (
              <span
                className="text-[8px] font-mono animate-pulse"
                style={{ color: "#f59e0b66" }}
              >
                QUEUED
              </span>
            )}
          </div>
        )}

        {msg.role === "user" && (
          <div className="mb-1.5 flex items-center gap-2">
            <ChevronRight className="h-3 w-3" style={{ color: "#00f0ff66" }} />
            <span
              className="text-[8px] font-mono uppercase tracking-wider"
              style={{ color: "#00f0ff44" }}
            >
              OPERATOR
            </span>
          </div>
        )}

        <pre
          className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed"
          style={{
            color:
              msg.role === "user"
                ? "#00f0ffcc"
                : msg.status === "failed"
                  ? "#ff2d5ecc"
                  : "#c8d6e5cc",
          }}
        >
          {(msg.role === "agent" ? cleanAgentOutput(msg.content) : msg.content) ||
            (msg.status === "pending" ? "// waiting for bridge..." : "")}
        </pre>
      </div>
    </div>
  );
});

// ────────────────────────────────────────────────────
// Streaming bubble — renders live text without copying messages array
// ────────────────────────────────────────────────────

function StreamingBubble({
  agentId: streamAgentId,
  fullText: streamText,
  isComplete: streamDone,
}: {
  agentId: string;
  fullText: string;
  isComplete: boolean;
}) {
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[85%] rounded-lg px-4 py-3 relative"
        style={{
          background: "linear-gradient(135deg, #0a0f1a, #0d1525)",
          border: `1px solid #00f0ff12`,
        }}
      >
        <div className="mb-2 flex items-center gap-2">
          <span
            className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              color: "#a855f7",
              background: "#a855f710",
              border: "1px solid #a855f720",
            }}
          >
            {streamAgentId}
          </span>
          {!streamDone && (
            <div className="flex items-center gap-1.5">
              <Loader2
                className="h-3 w-3 animate-spin"
                style={{ color: "#00f0ff66" }}
              />
              <span
                className="text-[8px] font-mono"
                style={{ color: "#00f0ff44" }}
              >
                STREAMING
              </span>
            </div>
          )}
        </div>
        <pre
          className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed"
          style={{ color: "#c8d6e5cc" }}
        >
          {cleanAgentOutput(streamText) || "// waiting for bridge..."}
        </pre>
        {!streamDone && (
          <span
            className="inline-block w-2 h-4 ml-0.5 animate-pulse"
            style={{ background: "#00f0ff", boxShadow: "0 0 4px #00f0ff" }}
          />
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────
// Auto-resize textarea hook
// ────────────────────────────────────────────────────

function useAutoResize(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string
) {
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);

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
    settings,
    updateSettings,
    analyserNode,
    isPTTActive,
  } = useVoice();

  // Wake word detection
  const { isSupported: wakeWordSupported, isActive: wakeWordActive } =
    useWakeWord({
      enabled: voiceEnabled && settings.wakeWord,
      onWake: () => {
        // Wake word detected — start recording
        if (!isListening && !isTranscribing && !sending) {
          startListening();
        }
      },
    });

  useAutoResize(inputRef, input);

  // ── Load conversation from history ──
  const handleLoadConversation = useCallback(
    (entries: HistoryEntry[]) => {
      const loaded: ChatMessage[] = [];
      for (const entry of entries) {
        // User message
        loaded.push({
          id: `hist-user-${entry.id}`,
          role: "user",
          content: entry.message,
          commandId: entry.id,
          agentId: entry.agentId,
          timestamp: entry.createdAt,
        });
        // Agent response (if any)
        if (entry.response) {
          loaded.push({
            id: `hist-agent-${entry.id}`,
            role: "agent",
            content: cleanAgentOutput(entry.response),
            commandId: entry.id,
            status: entry.status === "failed" ? "failed" : "completed",
            agentId: entry.agentId,
            timestamp: entry.createdAt,
          });
        }
      }
      setMessages(loaded);
      setActiveCommandId(null);
      setSending(false);
      // Set agent to match the loaded conversation
      if (entries.length > 0) {
        setAgentId(entries[entries.length - 1].agentId);
      }
      shouldScrollRef.current = true;
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        inputRef.current?.focus();
      }, 100);
    },
    []
  );

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setActiveCommandId(null);
    setSending(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

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

  // ── Scroll while streaming (fullText changes via throttled hook) ──
  useEffect(() => {
    if (activeCommandId && fullText) {
      scrollToBottom();
    }
  }, [fullText, activeCommandId, scrollToBottom]);

  // ── Command complete — merge final text into messages array once ──
  const [lastCompletedCmdId, setLastCompletedCmdId] = useState<string | null>(null);
  const completedRef = useRef<string | null>(null); // guard against double-merge
  const lastCompletedTextRef = useRef<string>(""); // final text for auto-speak

  useEffect(() => {
    if (isComplete && activeCommandId && activeCommandId !== completedRef.current) {
      // Guard: only merge once per command ID
      completedRef.current = activeCommandId;
      const finalText = fullText;
      const completedId = activeCommandId;

      // Save final text BEFORE clearing activeCommandId (which resets fullText)
      lastCompletedTextRef.current = finalText;

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "agent" && last.commandId === completedId) {
          return [
            ...prev.slice(0, -1),
            { ...last, content: finalText, status: "completed" },
          ];
        }
        return prev;
      });
      setLastCompletedCmdId(completedId);
      setActiveCommandId(null);
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isComplete, activeCommandId, fullText]);

  // ── Send message (accepts optional text for voice input) ──
  const sendMessage = useCallback(
    async (overrideText?: string) => {
      const trimmed = (overrideText ?? input).trim();
      if (!trimmed || sending) return;

      setSending(true);
      if (!overrideText) setInput("");
      shouldScrollRef.current = true;
      completedRef.current = null; // allow completion merge for the new command

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
    },
    [input, agentId, sending, scrollToBottom]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  // ── Auto-speak response when voice mode + autoSpeak is on ──
  // Track by command ID (unique per command) to prevent re-speaking stale responses.
  // Read final text from lastCompletedTextRef (captured before activeCommandId is cleared).
  const lastSpokenCmdRef = useRef<string | null>(null);
  const speakRef = useRef(speak);
  speakRef.current = speak;

  useEffect(() => {
    if (
      voiceEnabled &&
      settings.autoSpeak &&
      lastCompletedCmdId &&
      lastCompletedCmdId !== lastSpokenCmdRef.current &&
      !isSpeaking
    ) {
      const textToSpeak = cleanAgentOutput(lastCompletedTextRef.current);
      if (textToSpeak) {
        lastSpokenCmdRef.current = lastCompletedCmdId;
        speakRef.current(textToSpeak);
      }
    }
  }, [voiceEnabled, settings.autoSpeak, lastCompletedCmdId, isSpeaking]);

  // ── Continuous conversation: auto-listen after TTS finishes ──
  const wasSpeakingRef = useRef(false);
  useEffect(() => {
    if (isSpeaking) {
      wasSpeakingRef.current = true;
    } else if (wasSpeakingRef.current) {
      wasSpeakingRef.current = false;
      if (voiceEnabled && settings.continuous && !isListening && !sending) {
        // Short delay before re-listening
        const timer = setTimeout(() => {
          startListening();
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [
    isSpeaking,
    voiceEnabled,
    settings.continuous,
    isListening,
    sending,
    startListening,
  ]);

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

  // ── Push-to-talk release handler ──
  useEffect(() => {
    if (!voiceEnabled || !settings.pushToTalk) return;

    const handler = async () => {
      if (isListening) {
        const text = await stopListening();
        if (text) {
          sendMessage(text);
        }
      }
    };

    window.addEventListener("xmetav-ptt-release", handler);
    return () => window.removeEventListener("xmetav-ptt-release", handler);
  }, [voiceEnabled, settings.pushToTalk, isListening, stopListening, sendMessage]);

  // ── Continuous mode: auto-stop + send after silence ──
  // (Silence detection is handled inside useVoice via startSilenceDetection)
  // When recording stops via silence detection in continuous mode, we handle it here
  const wasListeningRef = useRef(false);
  useEffect(() => {
    if (isListening) {
      wasListeningRef.current = true;
    } else if (wasListeningRef.current && settings.continuous) {
      wasListeningRef.current = false;
      // The recorder stopped (possibly from silence detection) —
      // stopListening will be called by the onstop handler in useVoice
      // We rely on the existing flow in handleMicToggle / PTT
    }
  }, [isListening, settings.continuous]);

  // ── Global keyboard shortcut: / to focus input ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        const active = document.activeElement;
        const isInput =
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement;
        if (!isInput) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Build status text for the voice state ──
  const voiceStatusText = isListening
    ? settings.continuous
      ? "LISTENING..."
      : isPTTActive
        ? "HOLD TO SPEAK..."
        : "RECORDING..."
    : isTranscribing
      ? "TRANSCRIBING..."
      : isSpeaking
        ? "SPEAKING..."
        : null;

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-4 sm:px-5 py-3 border-b shrink-0"
        style={{
          borderColor: "#00f0ff10",
          background: "linear-gradient(90deg, #0a0f1a, #05080f)",
        }}
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <Hexagon className="h-4 w-4" style={{ color: "#00f0ff66" }} />
            <h1
              className="text-sm font-bold font-mono tracking-wider hidden sm:block"
              style={{ color: "#00f0ff" }}
            >
              AGENT INTERFACE
            </h1>
          </div>
          <div
            className="h-4 w-px hidden sm:block"
            style={{ background: "#00f0ff15" }}
          />
          <AgentSelector value={agentId} onChange={setAgentId} />
          <div
            className="h-4 w-px hidden sm:block"
            style={{ background: "#00f0ff15" }}
          />
          <button
            onClick={() => setHistoryOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors"
            style={{
              color: "#4a6a8a",
              border: "1px solid #00f0ff10",
            }}
            title="Chat history"
          >
            <History className="h-3.5 w-3.5" />
            <span className="text-[8px] font-mono uppercase tracking-wider hidden sm:inline">
              History
            </span>
          </button>
          <button
            onClick={() => setTerminalOpen(!terminalOpen)}
            className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors"
            style={{
              color: terminalOpen ? "#39ff14" : "#4a6a8a",
              background: terminalOpen ? "#39ff1408" : "transparent",
              border: `1px solid ${terminalOpen ? "#39ff1420" : "#00f0ff10"}`,
            }}
            title="Toggle terminal"
          >
            <Terminal className="h-3.5 w-3.5" />
            <span className="text-[8px] font-mono uppercase tracking-wider hidden sm:inline">
              Terminal
            </span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* Voice toggle */}
          <button
            onClick={toggleVoice}
            className="flex items-center gap-1.5 px-2 py-1 rounded transition-colors"
            style={{
              color: voiceEnabled ? "#39ff14" : "#4a6a8a",
              background: voiceEnabled ? "#39ff1408" : "transparent",
              border: `1px solid ${voiceEnabled ? "#39ff1420" : "#00f0ff10"}`,
            }}
            title={
              voiceEnabled
                ? "Voice mode ON -- click to disable"
                : "Voice mode OFF -- click to enable"
            }
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

          {/* Voice settings gear (only when voice is on) */}
          {voiceEnabled && (
            <VoiceSettingsPanel
              settings={settings}
              onUpdate={updateSettings}
              wakeWordSupported={wakeWordSupported}
            />
          )}

          {/* Mode badges */}
          {voiceEnabled && settings.continuous && (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded"
              style={{
                background: "#a855f708",
                border: "1px solid #a855f720",
              }}
            >
              <Repeat className="h-2.5 w-2.5" style={{ color: "#a855f7" }} />
              <span
                className="text-[7px] font-mono uppercase tracking-wider hidden sm:inline"
                style={{ color: "#a855f788" }}
              >
                CONTINUOUS
              </span>
            </div>
          )}

          {voiceEnabled && settings.wakeWord && wakeWordActive && (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded"
              style={{
                background: "#f59e0b08",
                border: "1px solid #f59e0b20",
              }}
            >
              <Radio className="h-2.5 w-2.5" style={{ color: "#f59e0b" }} />
              <span
                className="text-[7px] font-mono uppercase tracking-wider hidden sm:inline"
                style={{ color: "#f59e0b88" }}
              >
                WAKE
              </span>
            </div>
          )}

          <div className="h-4 w-px" style={{ background: "#00f0ff10" }} />

          {/* Bridge status */}
          <div className="flex items-center gap-2">
            <div
              className="h-2 w-2 rounded-full"
              style={{
                background: isOnline ? "#39ff14" : "#ff2d5e",
                boxShadow: isOnline
                  ? "0 0 6px #39ff14"
                  : "0 0 6px #ff2d5e",
              }}
            />
            <span
              className="text-[9px] font-mono uppercase tracking-wider"
              style={{
                color: isOnline ? "#39ff1488" : "#ff2d5e88",
              }}
            >
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
                  <Hexagon
                    className="h-12 w-12"
                    style={{ color: "#00f0ff15" }}
                  />
                </div>
                <p
                  className="text-sm font-mono neon-glow"
                  style={{ color: "#00f0ff88" }}
                >
                  [ AWAITING INPUT ]
                </p>
                <p
                  className="mt-2 text-[11px] font-mono"
                  style={{ color: "#4a6a8a" }}
                >
                  Send commands, delegate to akua, or orchestrate your fleet.
                </p>
                <p
                  className="mt-3 text-[9px] font-mono"
                  style={{ color: "#4a6a8a44" }}
                >
                  Press / to focus input
                  {voiceEnabled && settings.pushToTalk
                    ? " | HOLD SPACE to speak"
                    : ""}
                  {voiceEnabled && settings.wakeWord
                    ? ' | Say "Hey XmetaV"'
                    : ""}
                </p>
              </div>
            </div>
          )}

          {messages.map((msg) => {
            // Skip the placeholder agent msg while streaming — StreamingBubble handles it
            if (
              activeCommandId &&
              msg.role === "agent" &&
              msg.commandId === activeCommandId
            ) {
              return null;
            }
            return <MessageBubble key={msg.id} msg={msg} />;
          })}

          {/* Live streaming bubble — rendered separately to avoid messages array copies */}
          {activeCommandId && (
            <StreamingBubble
              agentId={agentId}
              fullText={fullText}
              isComplete={isComplete}
            />
          )}
        </div>
      </div>

      {/* Input */}
      <div
        className="border-t px-4 sm:px-5 py-3 sm:py-4 shrink-0"
        style={{
          borderColor: "#00f0ff10",
          background: "linear-gradient(0deg, #0a0f1a, transparent)",
        }}
      >
        <div className="mx-auto flex max-w-3xl gap-2 items-end">
          <div className="flex-1 relative">
            <ChevronRight
              className="absolute left-3 top-3 h-4 w-4 pointer-events-none"
              style={{ color: "#00f0ff44" }}
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

          {/* Waveform visualizer (shown during recording or speaking) */}
          {voiceEnabled && (isListening || isSpeaking) && (
            <div
              className="shrink-0 flex items-center justify-center h-11 px-1 rounded"
              style={{
                background: isListening ? "#ff2d5e08" : "#39ff1408",
                border: `1px solid ${isListening ? "#ff2d5e15" : "#39ff1415"}`,
              }}
            >
              <VoiceWaveform
                analyser={analyserNode}
                isRecording={isListening}
                isSpeaking={isSpeaking}
                width={80}
                height={28}
                barCount={10}
              />
            </div>
          )}

          {/* Mic button (shown when voice enabled) */}
          {voiceEnabled && (
            <button
              onClick={handleMicToggle}
              disabled={sending || isTranscribing}
              className="h-11 w-11 rounded flex items-center justify-center shrink-0 transition-all"
              style={{
                background: isListening
                  ? "#ff2d5e18"
                  : isTranscribing
                    ? "#f59e0b10"
                    : isPTTActive
                      ? "#a855f710"
                      : "#00f0ff08",
                border: `1px solid ${
                  isListening
                    ? "#ff2d5e40"
                    : isTranscribing
                      ? "#f59e0b30"
                      : isPTTActive
                        ? "#a855f730"
                        : "#00f0ff20"
                }`,
                boxShadow: isListening
                  ? "0 0 12px #ff2d5e30"
                  : isPTTActive
                    ? "0 0 8px #a855f720"
                    : "none",
              }}
              title={
                isListening
                  ? "Stop recording"
                  : settings.pushToTalk
                    ? "Hold SPACE or click to record"
                    : "Start voice command"
              }
            >
              {isTranscribing ? (
                <Loader2
                  className="h-4 w-4 animate-spin"
                  style={{ color: "#f59e0b" }}
                />
              ) : isListening ? (
                <MicOff
                  className="h-4 w-4 animate-pulse"
                  style={{ color: "#ff2d5e" }}
                />
              ) : (
                <Mic
                  className="h-4 w-4"
                  style={{ color: isPTTActive ? "#a855f7" : "#00f0ff88" }}
                />
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
              <Loader2
                className="h-4 w-4 animate-spin"
                style={{ color: "#00f0ff" }}
              />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <div className="mx-auto max-w-3xl mt-1.5 flex items-center justify-between">
          <span
            className="text-[8px] font-mono"
            style={{ color: "#4a6a8a33" }}
          >
            ENTER send | SHIFT+ENTER newline | / focus
            {voiceEnabled && settings.pushToTalk
              ? " | SPACE hold-to-talk"
              : voiceEnabled
                ? " | MIC voice"
                : ""}
          </span>
          <div className="flex items-center gap-2">
            {voiceError && (
              <span
                className="text-[8px] font-mono"
                style={{ color: "#ff2d5e66" }}
              >
                {voiceError}
              </span>
            )}
            {voiceStatusText && (
              <span
                className="text-[8px] font-mono animate-pulse"
                style={{
                  color: isListening
                    ? "#ff2d5e88"
                    : isTranscribing
                      ? "#f59e0b88"
                      : "#39ff1488",
                }}
              >
                {voiceStatusText}
              </span>
            )}
            {!voiceStatusText && (
              <span
                className="text-[8px] font-mono hidden sm:block"
                style={{ color: "#4a6a8a33" }}
              >
                XMETAV::ENCRYPTED_CHANNEL
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Embedded Terminal */}
      <AgentTerminal
        open={terminalOpen}
        onClose={() => setTerminalOpen(false)}
      />

      {/* Chat History Sidebar */}
      <ChatHistory
        agentId={agentId}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onNewChat={handleNewChat}
        onLoadConversation={handleLoadConversation}
      />
    </div>
  );
}
