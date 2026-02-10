import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/** GET /api/swarms/[id] -- get swarm run details + tasks */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [runRes, tasksRes] = await Promise.all([
    supabase.from("swarm_runs").select("*").eq("id", id).single(),
    supabase
      .from("swarm_tasks")
      .select("*")
      .eq("swarm_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (runRes.error) {
    return NextResponse.json({ error: runRes.error.message }, { status: 404 });
  }

  return NextResponse.json({
    run: runRes.data,
    tasks: tasksRes.data ?? [],
  });
}
