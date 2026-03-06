import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const sb = createAdminClient();

  const [
    { data: sessions },
    { data: recentCommands },
    { data: memoryStats },
    { data: payments },
  ] = await Promise.all([
    sb
      .from("agent_sessions")
      .select("agent_id, status, last_heartbeat")
      .order("agent_id"),
    sb
      .from("agent_commands")
      .select("agent_id, status, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
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
      .from("x402_payments")
      .select("amount, created_at"),
  ]);

  // Agent activity stats
  const agentStats: Record<string, { commands: number; completed: number; failed: number; lastActivity: string }> = {};
  recentCommands?.forEach((cmd: { agent_id: string; status: string; created_at: string }) => {
    if (!agentStats[cmd.agent_id]) {
      agentStats[cmd.agent_id] = { commands: 0, completed: 0, failed: 0, lastActivity: "" };
    }
    agentStats[cmd.agent_id].commands++;
    if (cmd.status === "completed") agentStats[cmd.agent_id].completed++;
    if (cmd.status === "failed") agentStats[cmd.agent_id].failed++;
    if (!agentStats[cmd.agent_id].lastActivity || cmd.created_at > agentStats[cmd.agent_id].lastActivity) {
      agentStats[cmd.agent_id].lastActivity = cmd.created_at;
    }
  });

  const agents = (sessions || []).map((s: { agent_id: string; status: string; last_heartbeat: string }) => {
    const stats = agentStats[s.agent_id] || { commands: 0, completed: 0, failed: 0, lastActivity: "" };
    return {
      id: s.agent_id,
      status: s.status,
      lastHeartbeat: s.last_heartbeat,
      memoryCount: (memoryStats as Record<string, number>)?.[s.agent_id] || 0,
      commands: stats.commands,
      successRate: stats.commands > 0 ? Math.round((stats.completed / stats.commands) * 100) : 0,
      lastActivity: stats.lastActivity || s.last_heartbeat,
    };
  });

  // Revenue by day
  const revenueByDay: Record<string, number> = {};
  let totalRevenue = 0;
  payments?.forEach((p: { amount: number | string | null; created_at: string }) => {
    const day = p.created_at.split("T")[0];
    const amt = typeof p.amount === "number" ? p.amount : parseFloat(String(p.amount || "0"));
    revenueByDay[day] = (revenueByDay[day] || 0) + amt;
    totalRevenue += amt;
  });

  const revenueDays = Object.keys(revenueByDay).sort();
  let cumulative = 0;
  const revenue = revenueDays.map((day) => {
    cumulative += revenueByDay[day];
    return { date: day, daily: Math.round(revenueByDay[day] * 100) / 100, cumulative: Math.round(cumulative * 100) / 100 };
  });

  return NextResponse.json({
    agents,
    revenue,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
  });
}
