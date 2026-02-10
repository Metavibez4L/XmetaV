import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/** POST /api/swarms/[id]/cancel -- cancel a running swarm */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only cancel if currently pending or running
  const { data: run, error: fetchErr } = await supabase
    .from("swarm_runs")
    .select("status")
    .eq("id", id)
    .single();

  if (fetchErr || !run) {
    return NextResponse.json({ error: "Swarm run not found" }, { status: 404 });
  }
  if (run.status !== "pending" && run.status !== "running") {
    return NextResponse.json(
      { error: `Cannot cancel run in status: ${run.status}` },
      { status: 400 }
    );
  }

  // Update run status
  const { error: updateErr } = await supabase
    .from("swarm_runs")
    .update({ status: "cancelled" })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Cancel any pending/running tasks
  await supabase
    .from("swarm_tasks")
    .update({ status: "skipped" })
    .eq("swarm_id", id)
    .in("status", ["pending", "running"]);

  return NextResponse.json({ ok: true });
}
