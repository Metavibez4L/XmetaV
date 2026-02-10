import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getCursorClient } from "@/lib/cursor-client";

export const runtime = "nodejs";

/** GET /api/cursor/models -- list available Cursor models */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const cursor = getCursorClient();
    const result = await cursor.listModels();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to list models";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
