import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

/** GET /api/ollama/models -- list locally available Ollama models */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      return NextResponse.json({ models: [] });
    }

    const data = await res.json();
    const models: string[] = (data.models || []).map(
      (m: { name: string }) => m.name
    );

    return NextResponse.json({ models });
  } catch {
    // Ollama not running or unreachable
    return NextResponse.json({ models: [] });
  }
}
