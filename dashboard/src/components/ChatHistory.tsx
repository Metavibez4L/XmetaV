"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  History,
  MessageSquare,
  Plus,
  RefreshCw,
  ChevronLeft,
  X,
} from "lucide-react";

// ── Types ──

export interface HistoryEntry {
  id: string;
  agentId: string;
  message: string;
  response: string | null;
  status: string;
  createdAt: string;
}

interface ChatHistoryProps {
  agentId: string;
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onLoadConversation: (entries: HistoryEntry[]) => void;
}

// ── Helpers ──

function relativeTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function groupByDate(entries: HistoryEntry[]): Map<string, HistoryEntry[]> {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const d = new Date(entry.createdAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let label: string;
    if (d.toDateString() === today.toDateString()) {
      label = "Today";
    } else if (d.toDateString() === yesterday.toDateString()) {
      label = "Yesterday";
    } else {
      label = d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(entry);
  }
  return groups;
}

function truncate(text: string, len: number): string {
  if (text.length <= len) return text;
  return text.slice(0, len).trimEnd() + "…";
}

// ── Component ──

export function ChatHistory({
  agentId,
  open,
  onClose,
  onNewChat,
  onLoadConversation,
}: ChatHistoryProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/commands/history?agent_id=${agentId}&limit=100`
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setEntries(json.conversations || []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  // Fetch on open or agent change
  useEffect(() => {
    if (open) fetchHistory();
  }, [open, fetchHistory]);

  const handleLoad = useCallback(
    (entry: HistoryEntry) => {
      setSelectedId(entry.id);
      // Find consecutive entries to load as a conversation
      // For now, load all entries for the same agent up to and including this one
      const idx = entries.findIndex((e) => e.id === entry.id);
      if (idx === -1) return;

      // Load this entry and all entries after it (they're newer-first, so entries before in array are newer)
      // We want the selected entry and everything after it (older) — but reversed for chronological order
      // Actually, let's just load all history for this agent as one conversation
      const allForAgent = entries
        .filter((e) => e.agentId === entry.agentId)
        .reverse(); // chronological order

      onLoadConversation(allForAgent);
      onClose();
    },
    [entries, onLoadConversation, onClose]
  );

  const grouped = groupByDate(entries);

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:bg-transparent"
          onClick={onClose}
        />
      )}

      {/* History panel — slides in from the right to avoid overlapping the nav sidebar */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex flex-col transition-transform duration-200"
        style={{
          width: "320px",
          background: "linear-gradient(180deg, #060b14, #05080f)",
          borderLeft: "1px solid #00f0ff12",
          transform: open ? "translateX(0)" : "translateX(100%)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: "#00f0ff10" }}
        >
          <div className="flex items-center gap-2">
            <History className="h-4 w-4" style={{ color: "#00f0ff66" }} />
            <span
              className="text-xs font-mono font-bold tracking-wider"
              style={{ color: "#00f0ff" }}
            >
              CHAT HISTORY
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={fetchHistory}
              className="p-1.5 rounded transition-colors"
              style={{ color: "#4a6a8a" }}
              title="Refresh"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded transition-colors"
              style={{ color: "#4a6a8a" }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* New Chat button */}
        <div className="px-3 py-2 border-b" style={{ borderColor: "#00f0ff08" }}>
          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded text-xs font-mono transition-colors"
            style={{
              color: "#00f0ff",
              background: "#00f0ff08",
              border: "1px solid #00f0ff15",
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            New Conversation
          </button>
        </div>

        {/* History list */}
        <div className="flex-1 overflow-auto">
          {loading && entries.length === 0 && (
            <div className="flex items-center justify-center h-32">
              <RefreshCw
                className="h-5 w-5 animate-spin"
                style={{ color: "#00f0ff33" }}
              />
            </div>
          )}

          {!loading && entries.length === 0 && (
            <div className="flex items-center justify-center h-32">
              <div className="text-center">
                <MessageSquare
                  className="h-8 w-8 mx-auto mb-2"
                  style={{ color: "#00f0ff15" }}
                />
                <p
                  className="text-[10px] font-mono"
                  style={{ color: "#4a6a8a" }}
                >
                  No conversations yet
                </p>
              </div>
            </div>
          )}

          {Array.from(grouped.entries()).map(([dateLabel, items]) => (
            <div key={dateLabel}>
              {/* Date header */}
              <div
                className="px-4 py-1.5 sticky top-0"
                style={{
                  background: "#060b14ee",
                  borderBottom: "1px solid #00f0ff06",
                }}
              >
                <span
                  className="text-[8px] font-mono uppercase tracking-wider"
                  style={{ color: "#4a6a8a66" }}
                >
                  {dateLabel}
                </span>
              </div>

              {/* Entries */}
              {items.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => handleLoad(entry)}
                  className="w-full text-left px-4 py-2.5 transition-colors group"
                  style={{
                    background:
                      selectedId === entry.id ? "#00f0ff08" : "transparent",
                    borderBottom: "1px solid #00f0ff06",
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-[11px] font-mono leading-tight truncate group-hover:text-[#00f0ffcc]"
                        style={{
                          color:
                            selectedId === entry.id ? "#00f0ffcc" : "#c8d6e5aa",
                        }}
                      >
                        {truncate(entry.message, 60)}
                      </p>
                      {entry.response && (
                        <p
                          className="text-[9px] font-mono mt-0.5 truncate"
                          style={{ color: "#4a6a8a88" }}
                        >
                          {truncate(entry.response, 80)}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-0.5">
                      <span
                        className="text-[8px] font-mono"
                        style={{ color: "#4a6a8a66" }}
                      >
                        {relativeTime(entry.createdAt)}
                      </span>
                      <span
                        className="text-[7px] font-mono px-1 py-0.5 rounded"
                        style={{
                          color: "#a855f788",
                          background: "#a855f708",
                        }}
                      >
                        {entry.agentId}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="px-4 py-2 border-t shrink-0"
          style={{ borderColor: "#00f0ff08" }}
        >
          <span className="text-[8px] font-mono" style={{ color: "#4a6a8a33" }}>
            {entries.length} conversation{entries.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Toggle tab (visible when closed) */}
      {!open && (
        <button
          onClick={() => {
            /* parent handles this */
          }}
          className="hidden"
        >
          <ChevronLeft />
        </button>
      )}
    </>
  );
}
