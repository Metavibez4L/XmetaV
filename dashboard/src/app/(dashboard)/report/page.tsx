"use client";

import { useMemo } from "react";
import { useReport } from "@/hooks/useReport";
import { ReportHeader } from "@/components/report/ReportHeader";
import { AnchorTimeline } from "@/components/report/AnchorTimeline";
import { CategoryDistribution } from "@/components/report/CategoryDistribution";
import { ScholarHeatmap } from "@/components/report/ScholarHeatmap";
import { DomainProgress } from "@/components/report/DomainProgress";
import { AgentActivityGrid } from "@/components/report/AgentActivityGrid";
import { RevenueChart } from "@/components/report/RevenueChart";
import { FindingsFeed } from "@/components/report/FindingsFeed";

export default function ReportPage() {
  const { memory, scholar, agents, loading, error, refresh } = useReport();

  // Transform Record<string, number> → {category, count}[]
  const categoryData = useMemo(() => {
    if (!memory?.byCategory) return [];
    return Object.entries(memory.byCategory).map(([category, count]) => ({ category, count }));
  }, [memory?.byCategory]);

  // Transform Record<string, number> → {hour, day, count}[]
  const heatmapData = useMemo(() => {
    if (!scholar?.heatmap) return [];
    return Object.entries(scholar.heatmap).map(([key, count]) => {
      const [day, hourStr] = key.split("-");
      return { day, hour: parseInt(hourStr, 10) || 0, count };
    });
  }, [scholar?.heatmap]);

  function handleExport(format: "json" | "csv" | "md") {
    const data = { memory, scholar, agents, exportedAt: new Date().toISOString() };

    if (format === "json") {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      downloadBlob(blob, `fleet-report-${dateStamp()}.json`);
      return;
    }

    if (format === "csv") {
      const rows: string[][] = [
        ["Metric", "Value"],
        ["Total Memories", String(memory?.total ?? 0)],
        ["Total Findings", String(scholar?.totalFindings ?? 0)],
        ["Total Revenue", String(agents?.totalRevenue ?? 0)],
        ["Agents", String(agents?.agents?.length ?? 0)],
        [],
        ["Agent", "Commands", "Success Rate", "Memories"],
        ...(agents?.agents ?? []).map((a) => [
          a.id,
          String(a.commands),
          `${a.successRate}%`,
          String(a.memoryCount),
        ]),
        [],
        ["Domain", "Findings", "Relevance"],
        ...(scholar?.domains ?? []).map((d) => [d.domain, String(d.findings), `${Math.round(d.relevance * 100)}%`]),
      ];
      const csv = rows.map((r) => r.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      downloadBlob(blob, `fleet-report-${dateStamp()}.csv`);
      return;
    }

    if (format === "md") {
      const lines = [
        "# Fleet Intelligence Report",
        `> Generated ${new Date().toLocaleString()}`,
        "",
        "## Summary",
        `- **Total Memories:** ${memory?.total ?? 0}`,
        `- **Scholar Findings:** ${scholar?.totalFindings ?? 0}`,
        `- **Revenue:** $${(agents?.totalRevenue ?? 0).toFixed(2)}`,
        `- **Active Agents:** ${agents?.agents?.length ?? 0}`,
        "",
        "## Agent Performance",
        "| Agent | Commands | Success | Memories |",
        "|-------|----------|---------|----------|",
        ...(agents?.agents ?? []).map(
          (a) => `| ${a.id} | ${a.commands} | ${a.successRate}% | ${a.memoryCount} |`
        ),
        "",
        "## Research Domains",
        ...(scholar?.domains ?? []).map(
          (d) => `- **${d.domain}**: ${d.findings} findings (${Math.round(d.relevance * 100)}% relevance)`
        ),
        "",
        "## Memory Categories",
        ...categoryData.map((c) => `- ${c.category}: ${c.count}`),
      ];
      const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
      downloadBlob(blob, `fleet-report-${dateStamp()}.md`);
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function dateStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="cyber-card rounded-lg p-5">
          <div className="text-[11px] font-mono" style={{ color: "#ff2d5e" }}>
            Error loading report: {error}
          </div>
          <button
            onClick={refresh}
            className="mt-3 text-[10px] font-mono px-3 py-1.5 rounded"
            style={{ color: "#00f0ff", border: "1px solid #00f0ff20" }}
          >
            RETRY
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header with stats + export */}
      <ReportHeader
        totalMemories={memory?.total ?? 0}
        totalFindings={scholar?.totalFindings ?? 0}
        totalRevenue={agents?.totalRevenue ?? 0}
        agentCount={agents?.agents?.length ?? 0}
        loading={loading}
        onRefresh={refresh}
        onExport={handleExport}
      />

      {/* Section 1: Memory Visualization */}
      <section>
        <h2 className="text-[10px] font-mono font-bold mb-3 uppercase tracking-widest" style={{ color: "#4a6a8a" }}>
          {"// memory visualization"}
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AnchorTimeline data={memory?.timeline ?? []} />
          <CategoryDistribution data={categoryData} />
        </div>
      </section>

      {/* Section 2: Research Progress */}
      <section>
        <h2 className="text-[10px] font-mono font-bold mb-3 uppercase tracking-widest" style={{ color: "#4a6a8a" }}>
          {"// research progress"}
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ScholarHeatmap data={heatmapData} />
          <DomainProgress data={scholar?.domains ?? []} total={scholar?.totalFindings ?? 0} />
        </div>
      </section>

      {/* Section 3: Agent Performance */}
      <section>
        <h2 className="text-[10px] font-mono font-bold mb-3 uppercase tracking-widest" style={{ color: "#4a6a8a" }}>
          {"// agent performance"}
        </h2>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            <AgentActivityGrid agents={agents?.agents ?? []} />
          </div>
          <div>
            <RevenueChart data={agents?.revenue ?? []} total={agents?.totalRevenue ?? 0} />
          </div>
        </div>
      </section>

      {/* Section 4: Recent Findings */}
      <section>
        <h2 className="text-[10px] font-mono font-bold mb-3 uppercase tracking-widest" style={{ color: "#4a6a8a" }}>
          {"// recent findings"}
        </h2>
        <FindingsFeed findings={scholar?.recentFindings ?? []} />
      </section>
    </div>
  );
}
