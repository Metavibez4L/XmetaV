"use client";

import { Anchor } from "lucide-react";

interface TimelinePoint {
  date: string;
  cumulative: number;
}

interface AnchorTimelineProps {
  data: TimelinePoint[];
}

export function AnchorTimeline({ data }: AnchorTimelineProps) {
  if (!data.length) {
    return (
      <div className="cyber-card rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <Anchor className="h-4 w-4" style={{ color: "#00f0ff88" }} />
          <h3 className="text-xs font-mono font-bold" style={{ color: "#00f0ff" }}>
            ANCHOR TIMELINE
          </h3>
        </div>
        <div className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
          No timeline data
        </div>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.cumulative), 1);
  const chartH = 120;
  const chartW = 100; // percentage
  const points = data.map((d, i) => {
    const x = data.length === 1 ? 50 : (i / (data.length - 1)) * chartW;
    const y = chartH - (d.cumulative / max) * (chartH - 10);
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${chartH} L ${points[0].x} ${chartH} Z`;

  return (
    <div className="cyber-card rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <Anchor className="h-4 w-4" style={{ color: "#00f0ff88" }} />
        <h3 className="text-xs font-mono font-bold" style={{ color: "#00f0ff" }}>
          ANCHOR TIMELINE
        </h3>
        <span className="text-[9px] font-mono ml-auto" style={{ color: "#4a6a8a" }}>
          {data.length} days
        </span>
      </div>

      <svg
        viewBox={`0 0 ${chartW} ${chartH}`}
        className="w-full"
        style={{ height: "140px" }}
        preserveAspectRatio="none"
      >
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((frac) => (
          <line
            key={frac}
            x1={0}
            y1={chartH - frac * (chartH - 10)}
            x2={chartW}
            y2={chartH - frac * (chartH - 10)}
            stroke="#ffffff06"
            strokeWidth="0.3"
          />
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#areaGrad)" opacity={0.3} />

        {/* Line */}
        <path d={linePath} fill="none" stroke="#00f0ff" strokeWidth="0.8" />

        {/* Dots on last 5 points */}
        {points.slice(-5).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="1" fill="#00f0ff" />
        ))}

        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      {/* X-axis labels */}
      <div className="flex justify-between mt-1">
        {data.length > 0 && (
          <>
            <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
              {data[0].date?.slice(5)}
            </span>
            <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
              {data[data.length - 1].date?.slice(5)}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
