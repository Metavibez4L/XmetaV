"use client";

import { Database, Anchor, DollarSign, Bot, RefreshCw, FileDown } from "lucide-react";

interface ReportHeaderProps {
  totalMemories: number;
  totalFindings: number;
  totalRevenue: number;
  agentCount: number;
  loading: boolean;
  onRefresh: () => void;
  onExport: (format: "json" | "csv" | "md") => void;
}

export function ReportHeader({
  totalMemories,
  totalFindings,
  totalRevenue,
  agentCount,
  loading,
  onRefresh,
  onExport,
}: ReportHeaderProps) {
  const stats = [
    { label: "Memories", value: totalMemories.toLocaleString(), icon: Database, color: "#00f0ff" },
    { label: "Findings", value: totalFindings.toLocaleString(), icon: Anchor, color: "#39ff14" },
    { label: "Revenue", value: `$${totalRevenue.toFixed(2)}`, icon: DollarSign, color: "#f7b731" },
    { label: "Agents", value: agentCount.toString(), icon: Bot, color: "#a29bfe" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1
              className="text-xl font-bold font-mono tracking-wider neon-glow"
              style={{ color: "#00f0ff" }}
            >
              FLEET INTELLIGENCE REPORT
            </h1>
            <span
              className="text-[9px] font-mono px-2 py-0.5 rounded"
              style={{
                color: "#39ff14",
                background: "#39ff1408",
                border: "1px solid #39ff1420",
              }}
            >
              LIVE
            </span>
          </div>
          <p className="text-[11px] font-mono mt-1" style={{ color: "#4a6a8a" }}>
            {"// research & memory analytics — auto-refresh 60s"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono transition-all hover:brightness-125 disabled:opacity-50"
            style={{
              color: "#00f0ff",
              background: "#00f0ff08",
              border: "1px solid #00f0ff20",
            }}
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            REFRESH
          </button>

          {/* Export dropdown */}
          <div className="relative group">
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-mono transition-all hover:brightness-125"
              style={{
                color: "#a29bfe",
                background: "#a29bfe08",
                border: "1px solid #a29bfe20",
              }}
            >
              <FileDown className="h-3 w-3" />
              EXPORT
            </button>
            <div
              className="absolute right-0 mt-1 hidden group-hover:flex flex-col rounded overflow-hidden shadow-xl z-50"
              style={{ background: "#0a1525", border: "1px solid #00f0ff20" }}
            >
              {(["json", "csv", "md"] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => onExport(fmt)}
                  className="px-4 py-2 text-[10px] font-mono text-left hover:brightness-150 transition-all"
                  style={{ color: "#8a9ab5", borderBottom: "1px solid #ffffff08" }}
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="cyber-card rounded-lg p-3 flex items-center gap-3"
          >
            <stat.icon className="h-5 w-5 shrink-0" style={{ color: stat.color + "88" }} />
            <div>
              <div className="text-lg font-bold font-mono" style={{ color: stat.color }}>
                {stat.value}
              </div>
              <div className="text-[9px] font-mono uppercase" style={{ color: "#4a6a8a" }}>
                {stat.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
