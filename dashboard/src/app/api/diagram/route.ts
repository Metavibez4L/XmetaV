import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const DIAGRAMS_DIR = path.join(
  process.env.HOME || "/tmp",
  "XmetaV",
  "diagrams"
);

/** GET /api/diagram?id=<id>&format=svg|excalidraw — serve a generated diagram */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const format = searchParams.get("format") || "svg";

  if (!id) {
    return NextResponse.json(
      { error: "id parameter required" },
      { status: 400 }
    );
  }

  // Sanitize id to prevent directory traversal
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "");
  if (safeId !== id) {
    return NextResponse.json({ error: "Invalid diagram id" }, { status: 400 });
  }

  const ext = format === "excalidraw" ? "excalidraw" : "svg";
  const filePath = path.join(DIAGRAMS_DIR, `${safeId}.${ext}`);

  if (!existsSync(filePath)) {
    return NextResponse.json(
      { error: "Diagram not found" },
      { status: 404 }
    );
  }

  const content = await readFile(filePath, "utf-8");
  const contentType =
    format === "excalidraw" ? "application/json" : "image/svg+xml";

  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}

/** POST /api/diagram — generate a new diagram from a spec */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { preset, spec, autoOpen } = body;

  // Dynamic import to avoid bundling Node-only code in edge
  const { generateDiagram, fleetArchitectureSpec, commandFlowSpec } =
    await import("@/../bridge/lib/diagram-generator");

  let diagramSpec;

  if (preset === "fleet") {
    diagramSpec = fleetArchitectureSpec();
  } else if (preset === "command-flow") {
    diagramSpec = commandFlowSpec();
  } else if (spec) {
    diagramSpec = spec;
  } else {
    return NextResponse.json(
      {
        error:
          'Provide "preset" (fleet|command-flow) or "spec" (DiagramSpec JSON)',
      },
      { status: 400 }
    );
  }

  try {
    const result = await generateDiagram(diagramSpec);

    // Optionally auto-open via mac-automate
    let opened = false;
    if (autoOpen && result.svgPath) {
      try {
        const { execSync } = await import("child_process");
        const macAutomate = path.resolve(
          process.cwd(),
          "../scripts/mac-automate.sh"
        );
        execSync(`bash "${macAutomate}" open-svg "${result.svgPath}"`, {
          timeout: 5000,
          stdio: "pipe",
        });
        opened = true;
      } catch {
        // Non-fatal
      }
    }

    return NextResponse.json({
      success: true,
      id: result.id,
      title: diagramSpec.title,
      type: diagramSpec.type,
      excalidrawPath: result.excalidrawPath,
      svgPath: result.svgPath,
      svgUrl: `/api/diagram?id=${result.id}&format=svg`,
      excalidrawUrl: `/api/diagram?id=${result.id}&format=excalidraw`,
      opened,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
