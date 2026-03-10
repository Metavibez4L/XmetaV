"use client";

import { Rss, Clock, Tag } from "lucide-react";

interface Finding {
  id: string;
  preview: string;
  category: string | null;
  relevance: number | null;
  timestamp: string;
}

interface FindingsFeedProps {
  findings: Finding[];
}

const CATEGORY_COLORS: Record<string, string> = {
  MILESTONE: "#39ff14",
  DECISION: "#00f0ff",
  INCIDENT: "#ff2d5e",
  INSIGHT: "#a29bfe",
  CAPABILITY: "#f7b731",
  RELATIONSHIP: "#fd79a8",
  PATTERN: "#74b9ff",
};

export function FindingsFeed({ findings }: FindingsFeedProps) {
  function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  return (
    <div className="cyber-card rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <Rss className="h-4 w-4" style={{ color: "#00f0ff88" }} />
        <h3 className="text-xs font-mono font-bold" style={{ color: "#00f0ff" }}>
          FINDINGS FEED
        </h3>
        <span className="text-[9px] font-mono ml-auto" style={{ color: "#4a6a8a" }}>
          {findings.length} recent
        </span>
      </div>

      {findings.length === 0 ? (
        <div className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
          No findings yet
        </div>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {findings.map((f) => {
            const catColor = (f.category && CATEGORY_COLORS[f.category]) || "#4a6a8a";
            return (
              <div
                key={f.id}
                className="rounded-md p-2.5 transition-all hover:brightness-110"
                style={{ background: "#ffffff03", borderLeft: `2px solid ${catColor}40` }}
              >
                {/* Header: agent + time */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-mono font-bold" style={{ color: "#8a9ab5" }}>
                    scholar
                  </span>
                  <div className="flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" style={{ color: "#4a6a8a" }} />
                    <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
                      {timeAgo(f.timestamp)}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <p
                  className="text-[10px] font-mono leading-relaxed line-clamp-3"
                  style={{ color: "#8a9ab5" }}
                >
                  {f.preview}
                </p>

                {/* Tags */}
                <div className="flex items-center gap-2 mt-1.5">
                  {f.category && (
                    <div className="flex items-center gap-0.5">
                      <Tag className="h-2 w-2" style={{ color: CATEGORY_COLORS[f.category] || "#4a6a8a" }} />
                      <span className="text-[7px] font-mono" style={{ color: CATEGORY_COLORS[f.category] || "#4a6a8a" }}>
                        {f.category}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
