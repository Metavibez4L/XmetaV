import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireAuth, isValidUUID, clampLimit } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/soul/consciousness
 *
 * Unified endpoint for Dream Synthesis, Predictive Loading, and Memory Reforging.
 *
 * ?action=shards         → Recent insight shards (Dream Synthesis)
 * ?action=awakenings     → "While you were away..." messages
 * ?action=synthesis_stats → Synthesis statistics
 * ?action=predictions    → Active predictive contexts
 * ?action=prediction_stats → Prediction accuracy stats
 * ?action=decay          → Memory decay scores
 * ?action=reforge_stats  → Reforging statistics
 * ?action=reforges       → Recent reforge events
 * ?action=reforge_targets → Groups eligible for reforging
 * ?action=overview       → Combined overview of all systems
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const action = request.nextUrl.searchParams.get("action") ?? "overview";
  const admin = createAdminClient();

  switch (action) {
    /* ── Insight Shards (Dream Synthesis) ─────── */
    case "shards": {
      const limit = clampLimit(request.nextUrl.searchParams.get("limit"), 20, 100);
      const { data, error } = await admin
        .from("insight_shards")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ shards: data ?? [], count: data?.length ?? 0 });
    }

    /* ── Awakening Messages ──────────────────── */
    case "awakenings": {
      const since = request.nextUrl.searchParams.get("since") ??
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await admin
        .from("insight_shards")
        .select("id, awakening_message, pattern_type, confidence, shard_class, created_at")
        .gte("created_at", since)
        .order("confidence", { ascending: false })
        .limit(10);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ awakenings: data ?? [] });
    }

    /* ── Synthesis Stats ─────────────────────── */
    case "synthesis_stats": {
      // Use SQL aggregation instead of fetching all rows
      const [totalRes, recent24hRes] = await Promise.all([
        admin.rpc("exec_sql", { query: "SELECT pattern_type, shard_class, count(*)::int as cnt FROM insight_shards GROUP BY pattern_type, shard_class" }).catch(() => null),
        admin.from("insight_shards").select("id", { count: "exact", head: true })
          .gte("created_at", new Date(Date.now() - 86400000).toISOString()),
      ]);

      // Fallback: if RPC not available, do bounded select
      if (!totalRes?.data) {
        const { data } = await admin.from("insight_shards")
          .select("pattern_type, shard_class, created_at")
          .order("created_at", { ascending: false })
          .limit(1000);

        const rows = data ?? [];
        const byPattern: Record<string, number> = {};
        const byClass: Record<string, number> = {};
        let recent24h = 0;
        const now = Date.now();

        for (const shard of rows) {
          byPattern[shard.pattern_type] = (byPattern[shard.pattern_type] || 0) + 1;
          byClass[shard.shard_class] = (byClass[shard.shard_class] || 0) + 1;
          if (now - new Date(shard.created_at).getTime() < 86400000) recent24h++;
        }

        return NextResponse.json({
          stats: { totalShards: rows.length, byPattern, byClass, recentAwakenings: recent24h },
        });
      }

      const byPattern: Record<string, number> = {};
      const byClass: Record<string, number> = {};
      let totalShards = 0;
      for (const row of (totalRes.data as Array<{pattern_type: string; shard_class: string; cnt: number}>)) {
        byPattern[row.pattern_type] = (byPattern[row.pattern_type] || 0) + row.cnt;
        byClass[row.shard_class] = (byClass[row.shard_class] || 0) + row.cnt;
        totalShards += row.cnt;
      }

      return NextResponse.json({
        stats: { totalShards, byPattern, byClass, recentAwakenings: recent24hRes?.count ?? 0 },
      });
    }

    /* ── Active Predictions ──────────────────── */
    case "predictions": {
      const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
      const { data, error } = await admin
        .from("predictive_contexts")
        .select("*")
        .gte("created_at", cutoff)
        .is("used_at", null)
        .order("confidence", { ascending: false })
        .limit(10);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ predictions: data ?? [] });
    }

    /* ── Prediction Accuracy Stats ───────────── */
    case "prediction_stats": {
      const { data, error } = await admin
        .from("predictive_contexts")
        .select("trigger_type, was_useful, used_at")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const rows = data ?? [];
      let consumed = 0, useful = 0;
      const byTrigger: Record<string, { total: number; useful: number }> = {};

      for (const row of rows) {
        const t = row.trigger_type;
        if (!byTrigger[t]) byTrigger[t] = { total: 0, useful: 0 };
        byTrigger[t].total++;
        if (row.used_at) {
          consumed++;
          if (row.was_useful) { useful++; byTrigger[t].useful++; }
        }
      }

      return NextResponse.json({
        stats: {
          totalPredictions: rows.length,
          consumed, useful,
          accuracy: consumed > 0 ? Math.round((useful / consumed) * 100) : 0,
          byTrigger,
        },
      });
    }

    /* ── Memory Decay Overview ───────────────── */
    case "decay": {
      const limit = clampLimit(request.nextUrl.searchParams.get("limit"), 50, 500);
      const filter = request.nextUrl.searchParams.get("filter") ?? "all";

      let query = admin
        .from("memory_decay")
        .select("memory_id, decay_score, access_count, last_accessed, is_archived, archive_reason, updated_at")
        .order("decay_score", { ascending: true })
        .limit(limit);

      if (filter === "archived") query = query.eq("is_archived", true);
      else if (filter === "decaying") query = query.lt("decay_score", 0.4).eq("is_archived", false);
      else if (filter === "healthy") query = query.gte("decay_score", 0.4).eq("is_archived", false);

      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ decay: data ?? [], count: data?.length ?? 0 });
    }

    /* ── Reforge Stats ───────────────────────── */
    case "reforge_stats": {
      const { data: decayData } = await admin
        .from("memory_decay")
        .select("decay_score, is_archived")
        .limit(5000);

      const { data: reforged } = await admin
        .from("reforged_crystals")
        .select("source_count")
        .limit(1000);

      const entries = decayData ?? [];
      const archived = entries.filter((d) => d.is_archived).length;
      const decaying = entries.filter((d) => !d.is_archived && d.decay_score < 0.4).length;
      const healthy = entries.filter((d) => !d.is_archived && d.decay_score >= 0.4).length;
      const avgDecay = entries.length > 0
        ? Math.round((entries.reduce((s, d) => s + d.decay_score, 0) / entries.length) * 100) / 100
        : 1.0;

      const reforgedEntries = reforged ?? [];
      const totalCompressed = reforgedEntries.reduce((s, r) => s + r.source_count, 0);

      return NextResponse.json({
        stats: {
          totalMemories: entries.length, archived, decaying, healthy,
          reforgedCrystals: reforgedEntries.length, totalCompressed, avgDecay,
        },
      });
    }

    /* ── Recent Reforges ─────────────────────── */
    case "reforges": {
      const limit = clampLimit(request.nextUrl.searchParams.get("limit"), 10, 50);
      const { data, error } = await admin
        .from("reforged_crystals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ reforges: data ?? [] });
    }

    /* ── Reforge Targets ─────────────────────── */
    case "reforge_targets": {
      // Find groups of low-decay memories eligible for reforging
      const { data: candidates } = await admin
        .from("memory_decay")
        .select("memory_id, decay_score")
        .eq("is_archived", false)
        .lt("decay_score", 0.4)
        .gte("decay_score", 0.05)
        .order("decay_score", { ascending: true })
        .limit(100);

      return NextResponse.json({
        candidates: candidates ?? [],
        count: candidates?.length ?? 0,
        message: candidates && candidates.length >= 5
          ? `${candidates.length} memories eligible for reforging`
          : "Not enough decaying memories for reforging yet",
      });
    }

    /* ── Combined Overview ───────────────────── */
    case "overview": {
      // Fetch all three systems' stats in parallel
      const [shardsRes, predictionsRes, decayRes, reforgesRes] = await Promise.all([
        admin.from("insight_shards").select("pattern_type, shard_class, confidence, created_at")
          .order("created_at", { ascending: false }).limit(50),
        admin.from("predictive_contexts").select("trigger_type, confidence, was_useful, created_at")
          .order("created_at", { ascending: false }).limit(20),
        admin.from("memory_decay").select("decay_score, is_archived").limit(2000),
        admin.from("reforged_crystals").select("legendary_name, source_count, created_at")
          .order("created_at", { ascending: false }).limit(5),
      ]);

      const shards = shardsRes.data ?? [];
      const predictions = predictionsRes.data ?? [];
      const decay = decayRes.data ?? [];
      const reforges = reforgesRes.data ?? [];
      const now = Date.now();

      return NextResponse.json({
        synthesis: {
          totalShards: shards.length,
          recent24h: shards.filter((s) => now - new Date(s.created_at).getTime() < 86400000).length,
          topPattern: shards.length > 0 ? shards[0].pattern_type : null,
        },
        predictive: {
          totalPredictions: predictions.length,
          avgConfidence: predictions.length > 0
            ? Math.round((predictions.reduce((s, p) => s + p.confidence, 0) / predictions.length) * 100)
            : 0,
        },
        reforge: {
          totalTracked: decay.length,
          archived: decay.filter((d) => d.is_archived).length,
          decaying: decay.filter((d) => !d.is_archived && d.decay_score < 0.4).length,
          healthy: decay.filter((d) => !d.is_archived && d.decay_score >= 0.4).length,
          legendaries: reforges.length,
          recentLegendary: reforges[0]?.legendary_name ?? null,
        },
      });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}

/**
 * POST /api/soul/consciousness
 * Body: { action: "reforge" | "consume_prediction" | "trigger_synthesis", ... }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const body = await request.json();
  const { action } = body;
  const admin = createAdminClient();

  switch (action) {
    /* ── Manual Reforge ──────────────────────── */
    case "reforge": {
      const { memoryIds } = body;
      if (!Array.isArray(memoryIds) || memoryIds.length < 5) {
        return NextResponse.json(
          { error: "Need at least 5 memory IDs to reforge" },
          { status: 400 }
        );
      }

      // Validate all IDs
      for (const id of memoryIds) {
        if (!isValidUUID(id)) {
          return NextResponse.json({ error: `Invalid UUID: ${id}` }, { status: 400 });
        }
      }

      // Signal the bridge to handle the actual reforging
      const { error } = await admin.from("agent_commands").insert({
        agent_id: "soul",
        command: "reforge_memories",
        payload: { memory_ids: memoryIds, trigger: "user" },
        status: "pending",
      });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({
        success: true,
        message: `Reforge initiated for ${memoryIds.length} memories. Check consciousness page for results.`,
      });
    }

    /* ── Consume Prediction Feedback ─────────── */
    case "consume_prediction": {
      const { predictionId, wasUseful } = body;
      if (!predictionId || !isValidUUID(predictionId)) {
        return NextResponse.json({ error: "Valid predictionId required" }, { status: 400 });
      }

      const { error } = await admin
        .from("predictive_contexts")
        .update({
          used_at: new Date().toISOString(),
          was_useful: wasUseful ?? false,
        })
        .eq("id", predictionId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    /* ── Manual Synthesis Trigger ─────────────── */
    case "trigger_synthesis": {
      const { error } = await admin.from("agent_commands").insert({
        agent_id: "soul",
        command: "dream_synthesis",
        payload: { trigger: "manual" },
        status: "pending",
      });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({
        success: true,
        message: "Dream synthesis triggered. Insight shards will appear shortly.",
      });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
