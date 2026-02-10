import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { promises as fs } from "fs";
import path from "path";
import type { SwarmTemplate, SwarmManifest, SwarmMode } from "@/lib/types";

export const runtime = "nodejs";

const TEMPLATES_DIR = path.resolve(process.cwd(), "..", "templates", "swarms");

/** GET /api/swarms/templates -- list available swarm templates from disk */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const files = await fs.readdir(TEMPLATES_DIR).catch(() => [] as string[]);
    const templates: SwarmTemplate[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(TEMPLATES_DIR, file), "utf-8");
        const manifest: SwarmManifest = JSON.parse(raw);
        const name = file
          .replace(".json", "")
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());

        templates.push({
          filename: file,
          name,
          mode: manifest.mode as SwarmMode,
          description: describeManifest(manifest),
          manifest,
        });
      } catch {
        // skip malformed templates
      }
    }

    return NextResponse.json(templates);
  } catch {
    return NextResponse.json([]);
  }
}

function describeManifest(m: SwarmManifest): string {
  if (m.mode === "collaborative") {
    const agentCount = m.agents?.length ?? 0;
    return `${agentCount} agents collaborate on the same task${m.synthesize_agent ? `, synthesized by ${m.synthesize_agent}` : ""}`;
  }
  const taskCount = m.tasks?.length ?? 0;
  const synth = m.synthesize ? " with synthesis" : "";
  return `${taskCount} tasks in ${m.mode} mode${synth}`;
}
