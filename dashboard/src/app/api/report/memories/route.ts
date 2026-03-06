import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const sb = createAdminClient();

  // Parallel queries for memory data
  // Schema: id, agent_id, kind, content, source, ttl_hours, created_at
  const [
    { count: totalMemories },
    { data: byAgentRaw },
    { data: byKindRaw },
    { data: timelineRaw },
    { data: recentAnchors },
  ] = await Promise.all([
    sb.from("agent_memory").select("*", { count: "exact", head: true }),
    sb
      .from("agent_memory")
      .select("agent_id"),
    sb
      .from("agent_memory")
      .select("kind"),
    sb
      .from("agent_memory")
      .select("created_at")
      .order("created_at", { ascending: true }),
    sb
      .from("agent_memory")
      .select("id, agent_id, kind, content, source, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Group by agent
  const byAgent: Record<string, number> = {};
  byAgentRaw?.forEach((m: { agent_id: string }) => {
    byAgent[m.agent_id] = (byAgent[m.agent_id] || 0) + 1;
  });

  // Group by kind (used as "category")
  const byCategory: Record<string, number> = {};
  byKindRaw?.forEach((m: { kind: string | null }) => {
    const cat = m.kind || "UNCATEGORIZED";
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  });

  // Build cumulative timeline
  const byDate: Record<string, number> = {};
  timelineRaw?.forEach((m: { created_at: string }) => {
    const date = m.created_at.split("T")[0];
    byDate[date] = (byDate[date] || 0) + 1;
  });
  const dates = Object.keys(byDate).sort();
  let cumulative = 0;
  const timeline = dates.map((date) => {
    cumulative += byDate[date];
    return { date, daily: byDate[date], cumulative };
  });

  // Memory flow: agent → supabase
  const flowLinks: { source: string; target: string; value: number }[] = [];
  Object.entries(byAgent).forEach(([agent, count]) => {
    flowLinks.push({ source: agent, target: "supabase", value: count });
  });

  return NextResponse.json({
    total: totalMemories || 0,
    byAgent,
    byCategory,
    timeline,
    recentAnchors: (recentAnchors || []).map((a: { id: string; agent_id: string; kind: string | null; content: string; source: string; created_at: string }) => ({
      id: a.id,
      source: a.agent_id,
      content: a.content,
      category: a.kind,
      relevance_score: null,
      created_at: a.created_at,
    })),
    flow: flowLinks,
  });
}
