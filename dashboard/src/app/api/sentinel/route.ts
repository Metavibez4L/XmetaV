import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/**
 * GET /api/sentinel — Full sentinel report (health, alerts, predictions, healing).
 * Reads from Supabase tables populated by the bridge sentinel engine.
 * Also queries the bridge /health endpoint for live status.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const section = url.searchParams.get("section"); // optional filter

  try {
    const report: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
    };

    // ── Service Health (from bridge sentinel engine) ─────────
    if (!section || section === "health") {
      // Live bridge health
      let bridgeHealth = null;
      try {
        const res = await fetch("http://localhost:3001/health", {
          signal: AbortSignal.timeout(3_000),
        });
        if (res.ok) bridgeHealth = await res.json();
      } catch {
        bridgeHealth = { status: "down" };
      }

      // Agent sessions
      const { data: sessions } = await supabase
        .from("agent_sessions")
        .select("agent_id, status, hostname, last_heartbeat")
        .order("agent_id");

      report.health = {
        bridge: bridgeHealth,
        agents: sessions || [],
      };
    }

    // ── Incidents ────────────────────────────────────────────
    if (!section || section === "incidents") {
      const { data: openIncidents, count: openCount } = await supabase
        .from("sentinel_incidents")
        .select("*", { count: "exact" })
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(20);

      const yesterday = new Date(Date.now() - 86_400_000).toISOString();
      const { count: last24hCount } = await supabase
        .from("sentinel_incidents")
        .select("*", { count: "exact", head: true })
        .gte("created_at", yesterday);

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: resolvedTodayCount } = await supabase
        .from("sentinel_incidents")
        .select("*", { count: "exact", head: true })
        .eq("resolved", true)
        .gte("resolved_at", todayStart.toISOString());

      report.incidents = {
        open: openIncidents || [],
        openCount: openCount ?? 0,
        last24h: last24hCount ?? 0,
        resolvedToday: resolvedTodayCount ?? 0,
      };
    }

    // ── Healing Log ──────────────────────────────────────────
    if (!section || section === "healing") {
      const { data: recentHealing } = await supabase
        .from("sentinel_healing_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      const { data: healingStats } = await supabase.rpc("sentinel_healing_stats");

      report.healing = {
        recent: recentHealing || [],
        stats: healingStats?.[0] || { total: 0, successful: 0, failed: 0, success_rate: 0 },
      };
    }

    // ── Resource Snapshots ───────────────────────────────────
    if (!section || section === "resources") {
      const { data: snapshots } = await supabase
        .from("sentinel_resource_snapshots")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(60);

      report.resources = {
        snapshots: (snapshots || []).reverse(),
      };
    }

    // ── Traces ───────────────────────────────────────────────
    if (!section || section === "traces") {
      const { data: recentTraces } = await supabase
        .from("sentinel_traces")
        .select("trace_id, root_service, root_operation, duration_ms, has_errors, created_at")
        .order("created_at", { ascending: false })
        .limit(20);

      const { data: errorTraces } = await supabase
        .from("sentinel_traces")
        .select("trace_id, root_service, root_operation, duration_ms, created_at")
        .eq("has_errors", true)
        .order("created_at", { ascending: false })
        .limit(10);

      report.traces = {
        recent: recentTraces || [],
        errors: errorTraces || [],
      };
    }

    return NextResponse.json(report);
  } catch (err) {
    console.error("[api/sentinel] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch sentinel report" },
      { status: 500 }
    );
  }
}
