"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  Zap,
  Send,
  Loader2,
  ChevronDown,
  MessageSquare,
  StopCircle,
  GitBranch,
  RefreshCw,
} from "lucide-react";
import type { IntentSession, IntentConversationMessage } from "@/lib/types";

interface Props {
  session: IntentSession | null;
  loading: boolean;
  error: string | null;
  onSubmitGoal: (goal: string, repository?: string, model?: string) => void;
  onFollowup: (message: string) => void;
  onStop: () => void;
}

export const IntentChat = React.memo(function IntentChat({
  session,
  loading,
  error,
  onSubmitGoal,
  onFollowup,
  onStop,
}: Props) {
  const [goal, setGoal] = useState("");
  const [followup, setFollowup] = useState("");
  const [selectedModel, setSelectedModel] = useState("auto");
  const [selectedRepo, setSelectedRepo] = useState("https://github.com/Metavibez4L/XmetaV");
  const [cursorModels, setCursorModels] = useState<string[]>([]);
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [repos, setRepos] = useState<{ owner: string; name: string; repository: string }[]>([]);
  const [showConfig, setShowConfig] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationContainerRef = useRef<HTMLDivElement>(null);

  const isLocalModel = selectedModel.startsWith("local:");

  // Fetch Cursor models, local Ollama models, and repos on mount
  useEffect(() => {
    fetch("/api/cursor/models")
      .then((r) => r.json())
      .then((d) => {
        if (d.models) setCursorModels(d.models);
      })
      .catch(() => {});
    fetch("/api/ollama/models")
      .then((r) => r.json())
      .then((d) => {
        if (d.models) setLocalModels(d.models);
      })
      .catch(() => {});
    fetch("/api/cursor/repos")
      .then((r) => r.json())
      .then((d) => {
        if (d.repositories) setRepos(d.repositories);
      })
      .catch(() => {});
  }, []);

  // Auto-scroll conversation (only scroll the chat container, not the page)
  useEffect(() => {
    const container = conversationContainerRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [session?.conversation]);

  const handleSubmitGoal = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!goal.trim() || loading) return;
      onSubmitGoal(
        goal.trim(),
        isLocalModel ? undefined : selectedRepo || undefined,
        selectedModel === "auto" ? undefined : selectedModel
      );
      setShowConfig(false);
    },
    [goal, loading, onSubmitGoal, selectedRepo, selectedModel, isLocalModel]
  );

  const handleFollowup = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!followup.trim() || loading) return;
      onFollowup(followup.trim());
      setFollowup("");
    },
    [followup, loading, onFollowup]
  );

  const conversation = useMemo(
    () => session?.conversation ?? [],
    [session?.conversation]
  );

  const isThinking = session?.status === "THINKING";
  const hasSession = !!session;
  const sc = {
    neon: "#00f0ff",
    dimText: "#4a6a8a",
    bg: "#0a0e1a",
    cardBg: "#0d1117",
    border: "#00f0ff15",
  };

  return (
    <div className="flex flex-col h-full">
      {/* Config panel (visible before session starts) */}
      {showConfig && !hasSession && (
        <div className="space-y-3 mb-4">
          {/* Model selector */}
          <div>
            <label
              className="block text-[9px] font-mono uppercase tracking-wider mb-1.5"
              style={{ color: sc.dimText }}
            >
              Model
            </label>
            <div className="relative">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-2 rounded text-[11px] font-mono appearance-none cursor-pointer"
                style={{
                  background: sc.cardBg,
                  border: `1px solid ${sc.border}`,
                  color: isLocalModel ? "#f7b731" : sc.neon,
                }}
              >
                {localModels.length > 0 && (
                  <optgroup label="⚡ Local (fast, seconds)">
                    {localModels.map((m) => (
                      <option key={`local:${m}`} value={`local:${m}`}>
                        {m}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="🧠 Cursor (deep, minutes)">
                  <option value="auto">Auto (recommended)</option>
                  {cursorModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </optgroup>
              </select>
              <ChevronDown
                className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none"
                style={{ color: sc.dimText }}
              />
            </div>
            {isLocalModel && (
              <p className="text-[8px] font-mono mt-1" style={{ color: "#f7b731" }}>
                Local mode — instant response via Ollama, no repo context
              </p>
            )}
          </div>

          {/* Repo selector -- hidden for local models (no repo context) */}
          {!isLocalModel && (
            <div>
              <label
                className="block text-[9px] font-mono uppercase tracking-wider mb-1.5"
                style={{ color: sc.dimText }}
              >
                <GitBranch className="inline h-3 w-3 mr-1" />
                Repository Context
              </label>
              <div className="relative">
                <select
                  value={selectedRepo}
                  onChange={(e) => setSelectedRepo(e.target.value)}
                  className="w-full px-3 py-2 rounded text-[11px] font-mono appearance-none cursor-pointer"
                  style={{
                    background: sc.cardBg,
                    border: `1px solid ${sc.border}`,
                    color: "#fff",
                  }}
                >
                  {repos.length === 0 ? (
                    <>
                      <option value="https://github.com/Metavibez4L/XmetaV">Metavibez4L/XmetaV</option>
                      <option value="https://github.com/Metavibez4L/basedintern">Metavibez4L/basedintern</option>
                      <option value="https://github.com/Metavibez4L/akua">Metavibez4L/akua</option>
                    </>
                  ) : null}
                  {repos
                    .map((r) => (
                      <option key={r.repository} value={r.repository}>
                        {r.owner}/{r.name}
                      </option>
                    ))}
                </select>
                <ChevronDown
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none"
                  style={{ color: sc.dimText }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Conversation */}
      {hasSession && (
        <div
          ref={conversationContainerRef}
          className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1"
          style={{ maxHeight: "calc(100vh - 420px)" }}
        >
          {/* Goal message */}
          <div className="flex justify-end">
            <div
              className="max-w-[85%] px-3 py-2 rounded-lg text-[11px] font-mono"
              style={{ background: "#00f0ff12", border: `1px solid ${sc.border}`, color: "#fff" }}
            >
              {session.goal}
            </div>
          </div>

          {/* Conversation messages */}
          {conversation.map((msg: IntentConversationMessage, i: number) => (
            <ConversationBubble key={msg.id || i} msg={msg} sc={sc} />
          ))}

          {/* Timeout retry indicator */}
          {session.retry_count > 0 && (
            <div className="flex items-start gap-2 px-3 py-2">
              <RefreshCw className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "#f7b731" }} />
              <div>
                <p className="text-[10px] font-mono" style={{ color: "#f7b731" }}>
                  Previous commands timed out — Cursor is generating alternatives
                  (retry {session.retry_count}/{session.max_retries})
                </p>
              </div>
            </div>
          )}

          {/* Thinking indicator */}
          {isThinking && (
            <div className="flex items-center gap-2 px-3 py-2">
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                style={{ color: sc.neon }}
              />
              <span className="text-[10px] font-mono" style={{ color: sc.dimText }}>
                {session.retry_count > 0
                  ? "Cursor is rethinking with alternative approaches..."
                  : session.model?.startsWith("local:")
                    ? "Ollama is generating commands..."
                    : "Cursor is thinking..."}
              </span>
            </div>
          )}

          {/* Status indicators for terminal/active states */}
          {session.status === "READY" && (session.commands?.length ?? 0) > 0 && (
            <div className="flex items-center gap-2 px-3 py-2">
              <Zap className="h-3.5 w-3.5" style={{ color: "#00ff88" }} />
              <span className="text-[10px] font-mono" style={{ color: "#00ff88" }}>
                {session.commands!.length} command{session.commands!.length !== 1 ? "s" : ""} ready — review on the right panel
              </span>
            </div>
          )}

          {session.status === "EXECUTING" && (
            <div className="flex items-center gap-2 px-3 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "#00ff88" }} />
              <span className="text-[10px] font-mono" style={{ color: "#00ff88" }}>
                Executing commands via bridge...
              </span>
            </div>
          )}

          {session.status === "COMPLETED" && (
            <div className="flex items-center gap-2 px-3 py-2">
              <Zap className="h-3.5 w-3.5" style={{ color: "#00ff88" }} />
              <span className="text-[10px] font-mono font-medium" style={{ color: "#00ff88" }}>
                All commands executed successfully
              </span>
            </div>
          )}

          {session.status === "FAILED" && (
            <div className="flex items-center gap-2 px-3 py-2">
              <StopCircle className="h-3.5 w-3.5" style={{ color: "#ff6b6b" }} />
              <span className="text-[10px] font-mono" style={{ color: "#ff6b6b" }}>
                Session failed
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="px-3 py-2 rounded text-[10px] font-mono mb-3"
          style={{ background: "#ff000015", border: "1px solid #ff000030", color: "#ff6b6b" }}
        >
          {error}
        </div>
      )}

      {/* Input area */}
      {!hasSession ? (
        <form onSubmit={handleSubmitGoal} className="mt-auto">
          <div className="relative">
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitGoal(e);
                }
              }}
              placeholder="Describe your high-level goal..."
              rows={3}
              className="w-full px-4 py-3 pr-12 rounded-lg text-[12px] font-mono resize-none placeholder:opacity-30"
              style={{
                background: sc.cardBg,
                border: `1px solid ${sc.border}`,
                color: "#fff",
              }}
            />
            <button
              type="submit"
              disabled={!goal.trim() || loading}
              className="absolute right-3 bottom-3 p-1.5 rounded disabled:opacity-30 transition-all"
              style={{
                background: goal.trim() ? `${sc.neon}20` : "transparent",
                border: `1px solid ${goal.trim() ? sc.neon + "40" : "transparent"}`,
              }}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: sc.neon }} />
              ) : (
                <Zap className="h-4 w-4" style={{ color: sc.neon }} />
              )}
            </button>
          </div>
          <p className="text-[8px] font-mono mt-1.5 opacity-30 text-center">
            {isLocalModel
              ? "Ollama will generate commands instantly (no repo context)"
              : "Cursor will analyze the repo and generate OpenClaw commands"}
          </p>
        </form>
      ) : (
        <div className="mt-auto space-y-2">
          {/* Follow-up or stop */}
          {isThinking || session.status === "EXECUTING" ? (
            <button
              onClick={onStop}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded text-[10px] font-mono uppercase tracking-wider transition-all"
              style={{
                background: "#ff000012",
                border: "1px solid #ff000030",
                color: "#ff6b6b",
              }}
            >
              <StopCircle className="h-3.5 w-3.5" />
              {session.status === "EXECUTING" ? "Cancel Execution" : "Stop Thinking"}
            </button>
          ) : session.status === "READY" ? (
            <form onSubmit={handleFollowup} className="relative">
              <input
                value={followup}
                onChange={(e) => setFollowup(e.target.value)}
                placeholder="Refine: 'also add a deploy step...'"
                className="w-full px-4 py-2.5 pr-10 rounded text-[11px] font-mono placeholder:opacity-30"
                style={{
                  background: sc.cardBg,
                  border: `1px solid ${sc.border}`,
                  color: "#fff",
                }}
              />
              <button
                type="submit"
                disabled={!followup.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded disabled:opacity-20"
              >
                <Send className="h-3.5 w-3.5" style={{ color: sc.neon }} />
              </button>
            </form>
          ) : null}
        </div>
      )}
    </div>
  );
});

const ConversationBubble = React.memo(function ConversationBubble({
  msg,
  sc,
}: {
  msg: IntentConversationMessage;
  sc: Record<string, string>;
}) {
  const isUser = msg.type === "user_message";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[85%] px-3 py-2 rounded-lg text-[10px] font-mono whitespace-pre-wrap"
        style={{
          background: isUser ? "#00f0ff12" : sc.cardBg,
          border: `1px solid ${isUser ? sc.border : "#ffffff08"}`,
          color: isUser ? "#fff" : sc.dimText,
        }}
      >
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1">
            <MessageSquare className="h-2.5 w-2.5" style={{ color: sc.neon }} />
            <span style={{ color: sc.neon }} className="text-[8px] uppercase tracking-wider">
              {msg.id?.startsWith("ollama") ? "Ollama" : "Cursor"}
            </span>
          </div>
        )}
        {msg.text.length > 500 ? msg.text.slice(0, 500) + "..." : msg.text}
      </div>
    </div>
  );
});
