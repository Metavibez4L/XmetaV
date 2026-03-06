import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const sb = createAdminClient();

  // Parallel queries for memory data
  const [
    { count: totalMemories },
    { data: byAgent },
    { data: byCategory },
    { data: timeline },
    { data: recentAnchors },
  ] = await Promise.all([
    sb.from("agent_memory").select("*", { count: "exact", head: true }),
    sb
      .from("agent_memory")
      .select("source")
      .then(({ data }) => {
        const counts: Record<string, number> = {};
        data?.forEach((m: { source: string }) => {
          counts[m.source] = (counts[m.source] || 0) + 1;
        });
        return { data: counts };
      }),
    sb
      .from("agent_memory")
      .select("category")
      .then(({ data }) => {
        const counts: Record<string, number> = {};
        data?.forEach((m: { category: string | null }) => {
          const cat = m.category || "UNCATEGORIZED";
          counts[cat] = (counts[cat] || 0) + 1;
        });
        return { data: counts };
      }),
    sb
      .from("agent_memory")
      .select("created_at")
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        // Group by date for timeline
        const byDate: Record<string, number> = {};
        data?.forEach((m: { created_at: string }) => {
          const date = m.created_at.split("T")[0];
          byDate[date] = (byDate[date] || 0) + 1;
        });
        // Convert to cumulative
        const dates = Object.keys(byDate).sort();
        let cumulative = 0;
        return {
          data: dates.map((date) => {
            cumulative += byDate[date];
            return { date, daily: byDate[date], cumulative };
          }),
        };
      }),
    sb
      .from("agent_memory")
      .select("id, source, content, category, relevance_score, created_at")
      .not("category", "is", null)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Memory flow: agent → category → storage
  const flowLinks: { source: string; target: string; value: number }[] = [];
  if (byAgent) {
    Object.entries(byAgent).forEach(([agent, count]) => {
      flowLinks.push({ source: agent, target: "supabase", value: count as number });
    });
  }

  return NextResponse.json({
    total: totalMemories || 0,
    byAgent: byAgent || {},
    byCategory: byCategory || {},
    timeline: timeline || [],
    recentAnchors: recentAnchors || [],
    flow: flowLinks,
  });
}
