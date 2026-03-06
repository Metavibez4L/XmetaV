import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const sb = createAdminClient();

  // Scholar findings are stored in agent_memory with agent_id='scholar'
  // Schema: id, agent_id, kind, content, source, ttl_hours, created_at
  const [
    { data: allScholar, count: totalFindings },
    { data: recentFindings },
  ] = await Promise.all([
    sb
      .from("agent_memory")
      .select("content, source, created_at", { count: "exact" })
      .eq("agent_id", "scholar"),
    sb
      .from("agent_memory")
      .select("id, content, kind, source, created_at")
      .eq("agent_id", "scholar")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  // Domain breakdown — extract domain from content keywords or source path
  const domainKeywords: Record<string, string[]> = {
    "ERC-8004 Identity": ["erc-8004", "erc8004", "identity registry", "agent identity"],
    "x402 Payments": ["x402", "402 payment", "micropayment"],
    "Layer 2 Solutions": ["layer 2", "l2", "rollup", "blob", "optimism", "base chain"],
    "Stablecoin Intelligence": ["stablecoin", "usdc", "usdt", "dai"],
    "SMB Adoption": ["small business", "smb", "merchant", "adoption", "enterprise"],
  };

  // source paths like "scholar/smb-adoption" can also hint at domain
  const sourceMap: Record<string, string> = {
    "scholar/erc8004": "ERC-8004 Identity",
    "scholar/x402": "x402 Payments",
    "scholar/layer2": "Layer 2 Solutions",
    "scholar/stablecoins": "Stablecoin Intelligence",
    "scholar/smb-adoption": "SMB Adoption",
  };

  const domains: Record<string, { findings: number; lastUpdate: string }> = {};
  for (const domain of Object.keys(domainKeywords)) {
    domains[domain] = { findings: 0, lastUpdate: "" };
  }

  allScholar?.forEach((m: { content: string; source: string; created_at: string }) => {
    const lower = (m.content || "").toLowerCase();
    let matched = false;

    // Try source path first
    const domainFromSource = sourceMap[m.source];
    if (domainFromSource && domains[domainFromSource]) {
      domains[domainFromSource].findings++;
      if (!domains[domainFromSource].lastUpdate || m.created_at > domains[domainFromSource].lastUpdate) {
        domains[domainFromSource].lastUpdate = m.created_at;
      }
      matched = true;
    }

    // Fallback to content keyword matching
    if (!matched) {
      for (const [domain, keywords] of Object.entries(domainKeywords)) {
        if (keywords.some((kw) => lower.includes(kw))) {
          domains[domain].findings++;
          if (!domains[domain].lastUpdate || m.created_at > domains[domain].lastUpdate) {
            domains[domain].lastUpdate = m.created_at;
          }
          break;
        }
      }
    }
  });

  const totalFindingsNum = totalFindings || 0;
  const domainList = Object.entries(domains).map(([name, data]) => ({
    domain: name,
    findings: data.findings,
    relevance: totalFindingsNum > 0 ? Math.round((data.findings / totalFindingsNum) * 100) / 100 : 0,
    lastUpdate: data.lastUpdate || null,
  }));

  // Hourly activity heatmap — keys like "Mon-14"
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const heatmap: Record<string, number> = {};
  allScholar?.forEach((m: { created_at: string }) => {
    const dt = new Date(m.created_at);
    const hour = dt.getUTCHours();
    const day = dayNames[dt.getUTCDay()];
    const key = `${day}-${hour}`;
    heatmap[key] = (heatmap[key] || 0) + 1;
  });

  return NextResponse.json({
    totalFindings: totalFindingsNum,
    domains: domainList,
    recentFindings: (recentFindings || []).map((f: { id: string; content: string; kind: string | null; source: string; created_at: string }) => ({
      id: f.id,
      preview: (f.content || "").slice(0, 200),
      category: f.kind,
      relevance: null,
      timestamp: f.created_at,
    })),
    heatmap,
  });
}
