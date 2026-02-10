import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { stopBridge } from "@/lib/bridge-manager";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await stopBridge();
  return NextResponse.json(status);
}

