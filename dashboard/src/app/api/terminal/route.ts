import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { spawn } from "child_process";

export const runtime = "nodejs";

// Max output size to prevent memory issues
const MAX_OUTPUT = 64 * 1024; // 64KB

/**
 * POST /api/terminal
 *
 * Executes a shell command on the local machine and returns the output.
 * Requires authentication. Commands run as the server process user.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { command, cwd, timeout = 30 } = body;

  if (!command || typeof command !== "string" || command.trim().length === 0) {
    return NextResponse.json(
      { error: "command is required" },
      { status: 400 }
    );
  }

  // Clamp timeout between 5 and 120 seconds
  const timeoutMs = Math.min(Math.max(timeout, 5), 120) * 1000;

  const workingDir = cwd || process.env.HOME || "/home/manifest";

  return new Promise<NextResponse>((resolve) => {
    let output = "";
    let resolved = false;

    const child = spawn("bash", ["-c", command.trim()], {
      cwd: workingDir,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finish = (exitCode: number | null) => {
      if (resolved) return;
      resolved = true;

      resolve(
        NextResponse.json({
          output: output.slice(0, MAX_OUTPUT),
          exitCode: exitCode ?? 1,
          truncated: output.length > MAX_OUTPUT,
          command: command.trim(),
          cwd: workingDir,
        })
      );
    };

    // Timeout
    const timer = setTimeout(() => {
      if (!resolved) {
        output += `\n[timeout after ${timeout}s]\n`;
        try {
          child.kill("SIGTERM");
        } catch { /* ignore */ }
        setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch { /* ignore */ }
          finish(124);
        }, 2000);
      }
    }, timeoutMs);

    child.stdout?.on("data", (data: Buffer) => {
      output += data.toString("utf-8");
    });

    child.stderr?.on("data", (data: Buffer) => {
      output += data.toString("utf-8");
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      finish(code);
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      output += `\n[error] ${err.message}\n`;
      finish(1);
    });
  });
}
