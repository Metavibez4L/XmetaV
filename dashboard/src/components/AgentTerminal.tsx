"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Terminal as TerminalIcon,
  X,
  ChevronRight,
  Loader2,
  Maximize2,
  Minimize2,
  Trash2,
} from "lucide-react";

// ── Types ──

interface TerminalLine {
  id: number;
  type: "input" | "output" | "error" | "system";
  content: string;
  exitCode?: number | null;
  timestamp: string;
}

interface AgentTerminalProps {
  open: boolean;
  onClose: () => void;
}

let lineCounter = 0;

// ── Component ──

export function AgentTerminal({ open, onClose }: AgentTerminalProps) {
  const [lines, setLines] = useState<TerminalLine[]>([
    {
      id: lineCounter++,
      type: "system",
      content: "XmetaV Terminal — connected to server",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [cwd, setCwd] = useState("~");
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const addLine = useCallback(
    (type: TerminalLine["type"], content: string, exitCode?: number | null) => {
      setLines((prev) => [
        ...prev,
        {
          id: lineCounter++,
          type,
          content,
          exitCode,
          timestamp: new Date().toISOString(),
        },
      ]);
    },
    []
  );

  const runCommand = useCallback(
    async (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed || running) return;

      // Add to history
      setHistory((prev) => {
        const deduped = prev.filter((h) => h !== trimmed);
        return [trimmed, ...deduped].slice(0, 100);
      });
      setHistoryIdx(-1);

      // Handle local commands
      if (trimmed === "clear") {
        setLines([]);
        return;
      }

      addLine("input", trimmed);
      setRunning(true);

      try {
        const res = await fetch("/api/terminal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command: trimmed,
            cwd: cwd === "~" ? undefined : cwd,
            timeout: 60,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          addLine("error", `[${res.status}] ${err.error || "Request failed"}`);
          return;
        }

        const data = await res.json();

        if (data.output) {
          addLine(
            data.exitCode === 0 ? "output" : "error",
            data.output,
            data.exitCode
          );
        }

        if (data.truncated) {
          addLine("system", "[output truncated at 64KB]");
        }

        // Update cwd display if it was a cd command
        if (trimmed.startsWith("cd ") || trimmed === "cd") {
          setCwd(data.cwd || "~");
        }
      } catch (err) {
        addLine(
          "error",
          `[network] ${err instanceof Error ? err.message : "Failed to connect"}`
        );
      } finally {
        setRunning(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    },
    [running, cwd, addLine]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        runCommand(input);
        setInput("");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (history.length > 0) {
          const next = Math.min(historyIdx + 1, history.length - 1);
          setHistoryIdx(next);
          setInput(history[next]);
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyIdx > 0) {
          const next = historyIdx - 1;
          setHistoryIdx(next);
          setInput(history[next]);
        } else {
          setHistoryIdx(-1);
          setInput("");
        }
      } else if (e.key === "c" && e.ctrlKey) {
        e.preventDefault();
        addLine("system", "^C");
      } else if (e.key === "l" && e.ctrlKey) {
        e.preventDefault();
        setLines([]);
      }
    },
    [input, runCommand, history, historyIdx, addLine]
  );

  if (!open) return null;

  return (
    <div
      className="border-t flex flex-col"
      style={{
        height: expanded ? "60%" : "280px",
        borderColor: "#00f0ff15",
        background: "#030810",
        transition: "height 200ms ease",
      }}
    >
      {/* Terminal header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 shrink-0 border-b"
        style={{ borderColor: "#00f0ff10", background: "#060b14" }}
      >
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-3.5 w-3.5" style={{ color: "#39ff14" }} />
          <span
            className="text-[9px] font-mono uppercase tracking-wider"
            style={{ color: "#39ff1488" }}
          >
            Terminal
          </span>
          <span
            className="text-[8px] font-mono"
            style={{ color: "#4a6a8a66" }}
          >
            {cwd}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setLines([])}
            className="p-1 rounded transition-colors"
            style={{ color: "#4a6a8a" }}
            title="Clear (Ctrl+L)"
          >
            <Trash2 className="h-3 w-3" />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded transition-colors"
            style={{ color: "#4a6a8a" }}
            title={expanded ? "Minimize" : "Maximize"}
          >
            {expanded ? (
              <Minimize2 className="h-3 w-3" />
            ) : (
              <Maximize2 className="h-3 w-3" />
            )}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors"
            style={{ color: "#4a6a8a" }}
            title="Close terminal"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Output area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed"
      >
        {lines.map((line) => (
          <div key={line.id} className="mb-0.5">
            {line.type === "input" && (
              <div className="flex items-start gap-1.5">
                <ChevronRight
                  className="h-3 w-3 mt-0.5 shrink-0"
                  style={{ color: "#39ff14" }}
                />
                <span style={{ color: "#39ff14cc" }}>{line.content}</span>
              </div>
            )}
            {line.type === "output" && (
              <pre
                className="whitespace-pre-wrap break-words pl-4"
                style={{ color: "#c8d6e5bb" }}
              >
                {line.content}
              </pre>
            )}
            {line.type === "error" && (
              <pre
                className="whitespace-pre-wrap break-words pl-4"
                style={{ color: "#ff6b6bcc" }}
              >
                {line.content}
                {line.exitCode !== undefined &&
                  line.exitCode !== null &&
                  line.exitCode !== 0 && (
                    <span style={{ color: "#ff6b6b66" }}>
                      {" "}
                      [exit {line.exitCode}]
                    </span>
                  )}
              </pre>
            )}
            {line.type === "system" && (
              <div className="pl-4" style={{ color: "#4a6a8a88" }}>
                {line.content}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 border-t shrink-0"
        style={{ borderColor: "#00f0ff08" }}
      >
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0"
          style={{ color: running ? "#f59e0b" : "#39ff14" }}
        />
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={running ? "running..." : "enter command..."}
          disabled={running}
          className="flex-1 bg-transparent font-mono text-[11px] outline-none"
          style={{ color: "#c8d6e5cc", caretColor: "#39ff14" }}
          autoComplete="off"
          spellCheck={false}
        />
        {running && (
          <Loader2
            className="h-3 w-3 animate-spin shrink-0"
            style={{ color: "#f59e0b" }}
          />
        )}
      </div>
    </div>
  );
}
