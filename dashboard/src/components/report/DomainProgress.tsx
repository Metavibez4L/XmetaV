"use client";

import { Target } from "lucide-react";

interface DomainInfo {
  domain: string;
  findings: number;
  relevance: number;
}

interface DomainProgressProps {
  data: DomainInfo[];
  total: number;
}

const DOMAIN_COLORS: Record<string, string> = {
  "ERC-8004": "#00f0ff",
  "x402 Payments": "#39ff14",
  "Layer 2": "#a29bfe",
  Stablecoins: "#f7b731",
  SMB: "#fd79a8",
};

export function DomainProgress({ data, total }: DomainProgressProps) {
  const maxCount = Math.max(...data.map((d) => d.findings), 1);

  return (
    <div className="cyber-card rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-4 w-4" style={{ color: "#f7b73188" }} />
        <h3 className="text-xs font-mono font-bold" style={{ color: "#f7b731" }}>
          DOMAIN PROGRESS
        </h3>
        <span className="text-[9px] font-mono ml-auto" style={{ color: "#4a6a8a" }}>
          {total} total
        </span>
      </div>

      <div className="space-y-3">
        {data.map((d) => {
          const pct = Math.round((d.findings / maxCount) * 100);
          const color = DOMAIN_COLORS[d.domain] || "#4a6a8a";
          return (
            <div key={d.domain}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono" style={{ color: "#8a9ab5" }}>
                  {d.domain}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono tabular-nums" style={{ color }}>
                    {d.findings}
                  </span>
                  <span
                    className="text-[8px] font-mono px-1 rounded"
                    style={{
                      color: d.relevance >= 0.7 ? "#39ff14" : d.relevance >= 0.4 ? "#f7b731" : "#4a6a8a",
                      background:
                        d.relevance >= 0.7 ? "#39ff1410" : d.relevance >= 0.4 ? "#f7b73110" : "#ffffff06",
                    }}
                  >
                    {Math.round(d.relevance * 100)}%
                  </span>
                </div>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: "#ffffff06" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${color}44, ${color})`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
