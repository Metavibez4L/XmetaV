"use client";

import { Grid3x3 } from "lucide-react";

interface HeatmapPoint {
  hour: number;
  day: string;
  count: number;
}

interface ScholarHeatmapProps {
  data: HeatmapPoint[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ScholarHeatmap({ data }: ScholarHeatmapProps) {
  const max = Math.max(...data.map((d) => d.count), 1);

  // Build 7x24 grid
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const pt of data) {
    const dayIdx = DAY_LABELS.indexOf(pt.day);
    if (dayIdx >= 0 && pt.hour >= 0 && pt.hour < 24) {
      grid[dayIdx][pt.hour] = pt.count;
    }
  }

  function cellColor(val: number): string {
    if (val === 0) return "#ffffff04";
    const intensity = Math.min(val / max, 1);
    const alpha = Math.round(0.15 + intensity * 0.85 * 255)
      .toString(16)
      .padStart(2, "0");
    return `#39ff14${alpha}`;
  }

  return (
    <div className="cyber-card rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <Grid3x3 className="h-4 w-4" style={{ color: "#39ff1488" }} />
        <h3 className="text-xs font-mono font-bold" style={{ color: "#39ff14" }}>
          SCHOLAR HEATMAP
        </h3>
        <span className="text-[9px] font-mono ml-auto" style={{ color: "#4a6a8a" }}>
          7d × 24h
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[400px]">
          {/* Hour labels */}
          <div className="flex mb-1 ml-8 justify-between">
            {[0, 6, 12, 18, 23].map((h) => (
              <span key={h} className="text-[7px] font-mono" style={{ color: "#4a6a8a" }}>
                {h.toString().padStart(2, "0")}
              </span>
            ))}
          </div>

          {/* Grid rows */}
          {grid.map((row, dayIdx) => (
            <div key={dayIdx} className="flex items-center gap-1 mb-[2px]">
              <span
                className="text-[8px] font-mono w-7 text-right shrink-0"
                style={{ color: "#4a6a8a" }}
              >
                {DAY_LABELS[dayIdx]}
              </span>
              <div className="flex gap-[1px] flex-1">
                {row.map((val, h) => (
                  <div
                    key={h}
                    className="flex-1 h-3 rounded-[1px] transition-colors"
                    style={{ background: cellColor(val) }}
                    title={`${DAY_LABELS[dayIdx]} ${h}:00 — ${val} findings`}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Scale */}
          <div className="flex items-center justify-end gap-1 mt-2">
            <span className="text-[7px] font-mono" style={{ color: "#4a6a8a" }}>
              Less
            </span>
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
              <div
                key={frac}
                className="w-3 h-3 rounded-[1px]"
                style={{
                  background:
                    frac === 0
                      ? "#ffffff04"
                      : `#39ff14${Math.round(frac * 200 + 40)
                          .toString(16)
                          .padStart(2, "0")}`,
                }}
              />
            ))}
            <span className="text-[7px] font-mono" style={{ color: "#4a6a8a" }}>
              More
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
