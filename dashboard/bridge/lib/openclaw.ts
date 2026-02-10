import { spawn, type ChildProcess } from "child_process";
import { resolve } from "path";

/** Allowed agent IDs to prevent arbitrary execution */
const ALLOWED_AGENTS = new Set(["main", "akua", "akua_web", "basedintern", "basedintern_web"]);

export interface OpenClawOptions {
  agentId: string;
  message: string;
  onChunk: (text: string) => void;
  onExit: (code: number | null) => void;
}

/**
 * Spawn an OpenClaw agent process and stream output.
 * Returns a handle to kill the process if needed.
 */
export function runAgent(options: OpenClawOptions): ChildProcess {
  const { agentId, message, onChunk, onExit } = options;

  if (!ALLOWED_AGENTS.has(agentId)) {
    throw new Error(`Agent "${agentId}" is not in the allowed list`);
  }

  // Resolve openclaw binary path
  const openclawPath = process.env.OPENCLAW_PATH || "openclaw";
  const nodePath = process.env.NODE_PATH || "node";

  const args = [
    "agent",
    "--agent", agentId,
    "--local",
    "--thinking", "off",
    message,
  ];

  console.log(`[openclaw] Spawning: ${openclawPath} ${args.join(" ")}`);

  const child = spawn(openclawPath, args, {
    cwd: resolve(process.env.HOME || "/home/manifest"),
    env: {
      ...process.env,
      PATH: `${resolve(nodePath, "..")}:${process.env.PATH}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Stream stdout
  child.stdout?.on("data", (data: Buffer) => {
    onChunk(data.toString("utf-8"));
  });

  // Stream stderr (also useful output from agents)
  child.stderr?.on("data", (data: Buffer) => {
    onChunk(data.toString("utf-8"));
  });

  child.on("exit", (code) => {
    console.log(`[openclaw] Process exited with code ${code}`);
    onExit(code);
  });

  child.on("error", (err) => {
    console.error(`[openclaw] Spawn error:`, err.message);
    onChunk(`\n[Bridge Error] ${err.message}\n`);
    onExit(1);
  });

  return child;
}
