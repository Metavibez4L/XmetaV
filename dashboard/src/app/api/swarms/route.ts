import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

/** GET /api/swarms -- list swarm runs (recent, with optional status filter) */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = request.nextUrl.searchParams.get("status");
  let query = supabase
    .from("swarm_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** POST /api/swarms -- create a new swarm run */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { name, mode, manifest } = body;

  if (!mode || !["parallel", "pipeline", "collaborative"].includes(mode)) {
    return NextResponse.json({ error: "mode must be parallel|pipeline|collaborative" }, { status: 400 });
  }
  if (!manifest || typeof manifest !== "object") {
    return NextResponse.json({ error: "manifest object is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("swarm_runs")
    .insert({
      name: name || "Untitled Swarm",
      mode,
      status: "pending",
      manifest,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
