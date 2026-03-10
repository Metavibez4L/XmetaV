"use client";

import { DollarSign } from "lucide-react";

interface RevenuePoint {
  date: string;
  daily: number;
  cumulative: number;
}

interface RevenueChartProps {
  data: RevenuePoint[];
  total: number;
}

export function RevenueChart({ data, total }: RevenueChartProps) {
  if (!data.length) {
    return (
      <div className="cyber-card rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-4 w-4" style={{ color: "#f7b73188" }} />
          <h3 className="text-xs font-mono font-bold" style={{ color: "#f7b731" }}>
            REVENUE
          </h3>
        </div>
        <div className="text-[10px] font-mono" style={{ color: "#4a6a8a" }}>
          No revenue data
        </div>
      </div>
    );
  }

  const maxDaily = Math.max(...data.map((d) => d.daily), 0.01);
  const maxCum = Math.max(...data.map((d) => d.cumulative), 0.01);
  const chartH = 100;
  const barW = Math.max(100 / data.length - 1, 2);

  // Cumulative line points
  const linePoints = data.map((d, i) => {
    const x = data.length === 1 ? 50 : (i / (data.length - 1)) * 100;
    const y = chartH - (d.cumulative / maxCum) * (chartH - 10);
    return { x, y };
  });
  const linePath = linePoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <div className="cyber-card rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <DollarSign className="h-4 w-4" style={{ color: "#f7b73188" }} />
        <h3 className="text-xs font-mono font-bold" style={{ color: "#f7b731" }}>
          REVENUE
        </h3>
        <span className="text-sm font-mono font-bold ml-auto" style={{ color: "#39ff14" }}>
          ${total.toFixed(2)}
        </span>
      </div>

      <svg
        viewBox={`0 0 100 ${chartH}`}
        className="w-full"
        style={{ height: "120px" }}
        preserveAspectRatio="none"
      >
        {/* Daily bars */}
        {data.map((d, i) => {
          const x = data.length === 1 ? 50 - barW / 2 : (i / data.length) * 100;
          const h = (d.daily / maxDaily) * (chartH - 10);
          return (
            <rect
              key={i}
              x={x}
              y={chartH - h}
              width={barW * 0.8}
              height={h}
              fill="#f7b731"
              opacity={0.3}
              rx="0.5"
            />
          );
        })}

        {/* Cumulative line */}
        <path d={linePath} fill="none" stroke="#39ff14" strokeWidth="0.8" />

        {/* End dot */}
        {linePoints.length > 0 && (
          <circle
            cx={linePoints[linePoints.length - 1].x}
            cy={linePoints[linePoints.length - 1].y}
            r="1.2"
            fill="#39ff14"
          />
        )}
      </svg>

      {/* X-axis */}
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

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm" style={{ background: "#f7b73150" }} />
          <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
            Daily
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-[1px]" style={{ background: "#39ff14" }} />
          <span className="text-[8px] font-mono" style={{ color: "#4a6a8a" }}>
            Cumulative
          </span>
        </div>
      </div>
    </div>
  );
}
