"use client";

import { PieChart } from "lucide-react";

interface CategoryItem {
  category: string;
  count: number;
}

interface CategoryDistributionProps {
  data: CategoryItem[];
}

const CATEGORY_COLORS: Record<string, string> = {
  MILESTONE: "#39ff14",
  DECISION: "#00f0ff",
  INCIDENT: "#ff2d5e",
  INSIGHT: "#a29bfe",
  CAPABILITY: "#f7b731",
  RELATIONSHIP: "#fd79a8",
  PATTERN: "#74b9ff",
  OTHER: "#4a6a8a",
};

export function CategoryDistribution({ data }: CategoryDistributionProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0) || 1;

  // Build donut segments
  const segments: { category: string; pct: number; color: string; startAngle: number; endAngle: number }[] = [];
  let cumAngle = 0;
  for (const d of data) {
    const pct = d.count / total;
    const startAngle = cumAngle;
    const endAngle = cumAngle + pct * 360;
    segments.push({
      category: d.category,
      pct,
      color: CATEGORY_COLORS[d.category] || CATEGORY_COLORS.OTHER,
      startAngle,
      endAngle,
    });
    cumAngle = endAngle;
  }

  function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
    const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
    const start = { x: cx + r * Math.cos(rad(startAngle)), y: cy + r * Math.sin(rad(startAngle)) };
    const end = { x: cx + r * Math.cos(rad(endAngle)), y: cy + r * Math.sin(rad(endAngle)) };
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
  }

  return (
    <div className="cyber-card rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <PieChart className="h-4 w-4" style={{ color: "#a29bfe88" }} />
        <h3 className="text-xs font-mono font-bold" style={{ color: "#a29bfe" }}>
          CATEGORY DISTRIBUTION
        </h3>
      </div>

      <div className="flex items-center gap-6">
        {/* Donut chart */}
        <svg viewBox="0 0 100 100" className="w-28 h-28 shrink-0">
          {segments.map((seg, i) => {
            if (seg.pct < 0.01) return null;
            const adjustedEnd = seg.pct >= 0.999 ? seg.endAngle - 0.5 : seg.endAngle;
            return (
              <path
                key={i}
                d={describeArc(50, 50, 38, seg.startAngle, adjustedEnd)}
                fill="none"
                stroke={seg.color}
                strokeWidth="10"
                strokeLinecap="round"
                opacity={0.8}
              />
            );
          })}
          <text
            x="50"
            y="47"
            textAnchor="middle"
            className="font-mono"
            style={{ fill: "#00f0ff", fontSize: "12px", fontWeight: "bold" }}
          >
            {total}
          </text>
          <text
            x="50"
            y="57"
            textAnchor="middle"
            className="font-mono"
            style={{ fill: "#4a6a8a", fontSize: "6px" }}
          >
            TOTAL
          </text>
        </svg>

        {/* Legend */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          {data.slice(0, 6).map((d) => (
            <div key={d.category} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: CATEGORY_COLORS[d.category] || CATEGORY_COLORS.OTHER }}
                />
                <span className="text-[9px] font-mono truncate" style={{ color: "#8a9ab5" }}>
                  {d.category}
                </span>
              </div>
              <span className="text-[9px] font-mono tabular-nums shrink-0" style={{ color: "#4a6a8a" }}>
                {d.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
