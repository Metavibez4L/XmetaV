"use client";

import React, { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  Terminal,
  AlertCircle,
  Info,
  Bug,
  Trash2,
  Pause,
  Play,
  Download,
  Search,
  Filter,
} from "lucide-react";

interface LogEntry {
  id: string;
  timestamp: string;
  agent: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  metadata?: Record<string, any>;
}

const LEVEL_COLORS = {
  info: { bg: "#00f0ff15", border: "#00f0ff30", text: "#00f0ff" },
  warn: { bg: "#f7b73115", border: "#f7b73130", text: "#f7b731" },
  error: { bg: "#ff2d5e15", border: "#ff2d5e30", text: "#ff2d5e" },
  debug: { bg: "#a29bfe15", border: "#a29bfe30", text: "#a29bfe" },
};

const LEVEL_ICONS = {
  info: Info,
  warn: AlertCircle,
  error: Bug,
  debug: Terminal,
};

const KNOWN_AGENTS = ["main", "basedintern", "akua", "bridge", "system"];

export function LiveLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string>("all");
  const [selectedLevel, setSelectedLevel] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const supabaseRef = useRef(createClient());

  // Initial load from agent_responses
  useEffect(() => {
    const loadInitialLogs = async () => {
      const { data } = await supabaseRef.current
        .from("agent_responses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (data) {
        const initialLogs: LogEntry[] = data.map((r) => ({
          id: r.id,
          timestamp: r.created_at,
          agent: r.agent || "unknown",
          level: r.error ? "error" : "info",
          message: r.output?.slice(0, 500) || "No output",
          metadata: { session_id: r.session_id },
        }));
        setLogs(initialLogs.reverse());
      }
    };
    loadInitialLogs();
  }, []);

  // Real-time subscription
  useEffect(() => {
    if (!isStreaming) return;

    const channel = supabaseRef.current
      .channel("logs")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_responses",
        },
        (payload) => {
          const newLog: LogEntry = {
            id: payload.new.id,
            timestamp: payload.new.created_at,
            agent: payload.new.agent || "unknown",
            level: payload.new.error ? "error" : "info",
            message: payload.new.output?.slice(0, 500) || "No output",
            metadata: { session_id: payload.new.session_id },
          };
          setLogs((prev) => [...prev.slice(-999), newLog]);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [isStreaming]);

  // Filter logs
  useEffect(() => {
    let filtered = logs;

    if (selectedAgent !== "all") {
      filtered = filtered.filter((l) => l.agent === selectedAgent);
    }

    if (selectedLevel !== "all") {
      filtered = filtered.filter((l) => l.level === selectedLevel);
    }

    if (searchQuery) {
      filtered = filtered.filter(
        (l) =>
          l.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l.agent.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredLogs(filtered);
  }, [logs, selectedAgent, selectedLevel, searchQuery]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current && isStreaming) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs, isStreaming]);

  const clearLogs = () => setLogs([]);

  const exportLogs = () => {
    const blob = new Blob(
      [JSON.stringify(filteredLogs, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `xmetav-logs-${new Date().toISOString()}.json`;
    a.click();
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-[#0a0f1a] border border-[#00f0ff15]">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4" style={{ color: "#00f0ff" }} />
          <span className="text-xs font-mono uppercase tracking-wider" style={{ color: "#00f0ff88" }}>
            Live Stream
          </span>
          <div
            className="h-2 w-2 rounded-full animate-pulse"
            style={{
              background: isStreaming ? "#39ff14" : "#ff2d5e",
              boxShadow: isStreaming ? "0 0 6px #39ff14" : "0 0 6px #ff2d5e",
            }}
          />
        </div>

        <div className="h-4 w-px bg-[#00f0ff15]" />

        <Button
          size="sm"
          variant="outline"
          onClick={() => setIsStreaming(!isStreaming)}
          className="text-[10px] font-mono h-7"
          style={{ borderColor: "#00f0ff30", color: "#00f0ff" }}
        >
          {isStreaming ? <Pause className="h-3 w-3 mr-1" /> : <Play className="h-3 w-3 mr-1" />}
          {isStreaming ? "Pause" : "Resume"}
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={clearLogs}
          className="text-[10px] font-mono h-7"
          style={{ borderColor: "#ff2d5e30", color: "#ff2d5e" }}
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Clear
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={exportLogs}
          className="text-[10px] font-mono h-7"
          style={{ borderColor: "#00f0ff30", color: "#00f0ff" }}
        >
          <Download className="h-3 w-3 mr-1" />
          Export
        </Button>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <Search className="h-3 w-3" style={{ color: "#4a6a8a" }} />
          <Input
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 w-40 text-[10px] font-mono bg-transparent"
            style={{ borderColor: "#00f0ff20", color: "#c8d6e5" }}
          />
        </div>

        <Select value={selectedAgent} onValueChange={setSelectedAgent}>
          <SelectTrigger className="h-7 w-32 text-[10px] font-mono bg-transparent" style={{ borderColor: "#00f0ff20" }}>
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {KNOWN_AGENTS.map((agent) => (
              <SelectItem key={agent} value={agent}>
                {agent}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedLevel} onValueChange={setSelectedLevel}>
          <SelectTrigger className="h-7 w-32 text-[10px] font-mono bg-transparent" style={{ borderColor: "#00f0ff20" }}>
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
          </SelectContent>
        </Select>

        <Badge
          variant="outline"
          className="text-[9px] font-mono"
          style={{ borderColor: "#00f0ff30", color: "#00f0ff" }}
        >
          {filteredLogs.length} entries
        </Badge>
      </div>

      {/* Log Stream */}
      <ScrollArea className="flex-1 rounded-lg border border-[#00f0ff15] bg-[#05080f]">
        <div ref={scrollRef} className="p-2 space-y-1 font-mono text-[10px]">
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-[#4a6a8a]">
              <Terminal className="h-4 w-4 mr-2" />
              No logs to display
            </div>
          ) : (
            filteredLogs.map((log) => {
              const LevelIcon = LEVEL_ICONS[log.level];
              const colors = LEVEL_COLORS[log.level];
              return (
                <div
                  key={log.id}
                  className="flex items-start gap-2 p-1.5 rounded hover:bg-[#00f0ff08] transition-colors"
                >
                  <span className="shrink-0 text-[#4a6a8a] w-14">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  <Badge
                    variant="outline"
                    className="shrink-0 text-[9px] px-1 py-0 h-4"
                    style={{
                      background: colors.bg,
                      borderColor: colors.border,
                      color: colors.text,
                    }}
                  >
                    <LevelIcon className="h-2.5 w-2.5 mr-0.5" />
                    {log.level}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="shrink-0 text-[9px] px-1 py-0 h-4"
                    style={{ borderColor: "#00f0ff20", color: "#00f0ff88" }}
                  >
                    {log.agent}
                  </Badge>
                  <span className="flex-1 break-all" style={{ color: "#c8d6e5" }}>
                    {log.message}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
