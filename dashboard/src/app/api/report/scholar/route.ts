import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const sb = createAdminClient();

  // Scholar findings are stored in agent_memory with source='scholar'
  const [
    { data: allScholar, count: totalFindings },
    { data: recentFindings },
  ] = await Promise.all([
    sb
      .from("agent_memory")
      .select("content, category, relevance_score, created_at", { count: "exact" })
      .eq("source", "scholar"),
    sb
      .from("agent_memory")
      .select("id, content, category, relevance_score, created_at")
      .eq("source", "scholar")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  // Domain breakdown — extract domain from content keywords
  const domainKeywords: Record<string, string[]> = {
    "ERC-8004 Identity": ["erc-8004", "erc8004", "identity registry", "agent identity"],
    "x402 Payments": ["x402", "402 payment", "micropayment"],
    "Layer 2 Solutions": ["layer 2", "l2", "rollup", "blob", "optimism", "base chain"],
    "Stablecoin Intelligence": ["stablecoin", "usdc", "usdt", "dai", "stablecoin"],
    "SMB Adoption": ["small business", "smb", "merchant", "adoption", "enterprise"],
  };

  const domains: Record<string, { findings: number; totalRelevance: number; lastUpdate: string }> = {};
  for (const domain of Object.keys(domainKeywords)) {
    domains[domain] = { findings: 0, totalRelevance: 0, lastUpdate: "" };
  }

  allScholar?.forEach((m: { content: string; relevance_score: number | null; created_at: string }) => {
    const lower = (m.content || "").toLowerCase();
    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      if (keywords.some((kw) => lower.includes(kw))) {
        domains[domain].findings++;
        domains[domain].totalRelevance += m.relevance_score || 0;
        if (!domains[domain].lastUpdate || m.created_at > domains[domain].lastUpdate) {
          domains[domain].lastUpdate = m.created_at;
        }
        break; // assign to first matching domain
      }
    }
  });

  // Compute averages
  const domainList = Object.entries(domains).map(([name, data]) => ({
    domain: name,
    findings: data.findings,
    relevance: data.findings > 0 ? Math.round((data.totalRelevance / data.findings) * 100) / 100 : 0,
    lastUpdate: data.lastUpdate || null,
  }));

  // Hourly activity heatmap (last 7 days)
  const heatmap: Record<string, number> = {};
  allScholar?.forEach((m: { created_at: string }) => {
    const dt = new Date(m.created_at);
    const hour = dt.getUTCHours();
    const day = dt.toISOString().split("T")[0];
    const key = `${day}-${hour}`;
    heatmap[key] = (heatmap[key] || 0) + 1;
  });

  return NextResponse.json({
    totalFindings: totalFindings || 0,
    domains: domainList,
    recentFindings: (recentFindings || []).map((f: { id: string; content: string; category: string | null; relevance_score: number | null; created_at: string }) => ({
      id: f.id,
      preview: (f.content || "").slice(0, 200),
      category: f.category,
      relevance: f.relevance_score,
      timestamp: f.created_at,
    })),
    heatmap,
  });
}
