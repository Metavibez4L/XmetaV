import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

/**
 * GET /api/agents/memory?agent_id=<id>&limit=<n>
 * Fetch recent memory entries for an agent (or all agents if no agent_id).
 */
export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agent_id");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") || "30", 10);

  const admin = createAdminClient();

  let query = admin
    .from("agent_memory")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (agentId) {
    query = query.in("agent_id", [agentId, "_shared"]);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data, count: data?.length ?? 0 });
}

/**
 * POST /api/agents/memory
 * Write a memory entry. Body: { agent_id, kind, content, source?, ttl_hours? }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { agent_id, kind, content, source, ttl_hours } = body;

  if (!agent_id || !content) {
    return NextResponse.json(
      { error: "agent_id and content are required" },
      { status: 400 }
    );
  }

  const validKinds = ["observation", "outcome", "fact", "error", "goal", "note"];
  if (kind && !validKinds.includes(kind)) {
    return NextResponse.json(
      { error: `kind must be one of: ${validKinds.join(", ")}` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data, error } = await admin.from("agent_memory").insert({
    agent_id,
    kind: kind || "note",
    content,
    source: source || "dashboard",
    ttl_hours: ttl_hours ?? null,
  }).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entry: data }, { status: 201 });
}

/**
 * DELETE /api/agents/memory?id=<uuid>
 * Delete a specific memory entry.
 */
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error } = await admin.from("agent_memory").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: id });
}
