import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireAuth, isValidUUID, clampLimit } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/soul?action=proposals|stats|sessions|manifest&id=<uuid>
 *
 * Soul Lucid Dreaming API — manages dream proposals, sessions,
 * and manifestation lifecycle.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const action = request.nextUrl.searchParams.get("action") ?? "proposals";
  const admin = createAdminClient();

  switch (action) {
    /* ── Active Proposals ───────────────────────── */
    case "proposals": {
      const limit = clampLimit(request.nextUrl.searchParams.get("limit"), 20, 100);
      const status = request.nextUrl.searchParams.get("status") ?? "proposed";

      const { data, error } = await admin
        .from("soul_dream_manifestations")
        .select("*")
        .eq("status", status)
        .order("priority", { ascending: false })
        .order("confidence", { ascending: false })
        .limit(limit);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ proposals: data ?? [], count: data?.length ?? 0 });
    }

    /* ── All Manifestations (recent) ───────────── */
    case "all": {
      const limit = clampLimit(request.nextUrl.searchParams.get("limit"), 50, 200);
      const { data, error } = await admin
        .from("soul_dream_manifestations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ manifestations: data ?? [], count: data?.length ?? 0 });
    }

    /* ── Manifestation Stats ───────────────────── */
    case "stats": {
      const { data, error } = await admin
        .from("soul_dream_manifestations")
        .select("status, category")
        .order("created_at", { ascending: false })
        .limit(2000);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const rows = data ?? [];
      const stats = {
        total: rows.length,
        proposed: 0,
        executed: 0,
        auto_executed: 0,
        rejected: 0,
        expired: 0,
        by_category: {} as Record<string, number>,
      };

      for (const row of rows) {
        const s = row.status;
        if (s === "proposed") stats.proposed++;
        else if (s === "executed") stats.executed++;
        else if (s === "auto_executed") stats.auto_executed++;
        else if (s === "rejected") stats.rejected++;
        else if (s === "expired") stats.expired++;
        stats.by_category[row.category] = (stats.by_category[row.category] ?? 0) + 1;
      }

      return NextResponse.json({ stats });
    }

    /* ── Recent Dream Sessions ─────────────────── */
    case "sessions": {
      const limit = clampLimit(request.nextUrl.searchParams.get("limit"), 10, 50);
      const { data, error } = await admin
        .from("soul_dream_sessions")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(limit);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ sessions: data ?? [] });
    }

    /* ── Single Manifest Detail ────────────────── */
    case "manifest": {
      const id = request.nextUrl.searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "id required" }, { status: 400 });
      }

      const { data, error } = await admin
        .from("soul_dream_manifestations")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ manifest: data });
    }

    /* ── Modification Log ──────────────────────── */
    case "modifications": {
      const limit = clampLimit(request.nextUrl.searchParams.get("limit"), 30, 100);
      const { data, error } = await admin
        .from("soul_association_modifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ modifications: data ?? [] });
    }

    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 400 }
      );
  }
}

/**
 * POST /api/soul
 * Body: { action: "approve" | "reject" | "trigger_dream", id?, reason? }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const body = await request.json();
  const { action, id, reason } = body;

  const admin = createAdminClient();

  switch (action) {
    /* ── Approve a Proposal ────────────────────── */
    case "approve": {
      if (!id || !isValidUUID(id)) {
        return NextResponse.json({ error: "Valid UUID id required" }, { status: 400 });
      }

      // Fetch
      const { data: manifest, error: fetchErr } = await admin
        .from("soul_dream_manifestations")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchErr || !manifest) {
        return NextResponse.json({ error: "Manifest not found" }, { status: 404 });
      }

      if (manifest.status !== "proposed") {
        return NextResponse.json(
          { error: `Cannot approve: status is ${manifest.status}` },
          { status: 400 }
        );
      }

      // Mark approved + executed
      const { error: updateErr } = await admin
        .from("soul_dream_manifestations")
        .update({
          status: "approved",
          approved_by: "user",
          approved_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, status: "approved" });
    }

    /* ── Reject a Proposal ─────────────────────── */
    case "reject": {
      if (!id || !isValidUUID(id)) {
        return NextResponse.json({ error: "Valid UUID id required" }, { status: 400 });
      }

      const { error } = await admin
        .from("soul_dream_manifestations")
        .update({
          status: "rejected",
          execution_result: { rejected: true, reason: reason ?? "User rejected" },
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, status: "rejected" });
    }

    /* ── Manual Dream Trigger ──────────────────── */
    case "trigger_dream": {
      // Signal the bridge to trigger a dream via a command entry
      const { error } = await admin.from("agent_commands").insert({
        agent_id: "soul",
        command: "lucid_dream",
        payload: { trigger: "manual", reason: reason ?? "User triggered" },
        status: "pending",
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: "Dream cycle triggered. Check consciousness page for results.",
      });
    }

    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 400 }
      );
  }
}
