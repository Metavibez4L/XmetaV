import { spawn, type ChildProcess } from "child_process";
import { resolve } from "path";
import { isX402Active } from "./x402-client.js";

/** Allowed agent IDs to prevent arbitrary execution */
const ALLOWED_AGENTS = new Set(["main", "akua", "akua_web", "basedintern", "basedintern_web"]);

export interface OpenClawOptions {
  agentId: string;
  message: string;
  onChunk: (text: string) => void;
  onExit: (code: number | null) => void;
}

/**
 * Build x402 env vars to pass to agent child processes.
 * Agents inherit the bridge's x402 config so they can reference payment status.
 */
function getX402ChildEnv(): Record<string, string> {
  const env: Record<string, string> = {};

  // Forward x402 config to child processes
  if (process.env.AGENT_WALLET_PRIVATE_KEY) {
    env.AGENT_WALLET_PRIVATE_KEY = process.env.AGENT_WALLET_PRIVATE_KEY;
  }
  if (process.env.X402_NETWORK) {
    env.X402_NETWORK = process.env.X402_NETWORK;
  }
  if (process.env.X402_MAX_PER_REQUEST) {
    env.X402_MAX_PER_REQUEST = process.env.X402_MAX_PER_REQUEST;
  }
  if (process.env.X402_MAX_DAILY) {
    env.X402_MAX_DAILY = process.env.X402_MAX_DAILY;
  }
  if (process.env.X402_MAX_PER_HOUR) {
    env.X402_MAX_PER_HOUR = process.env.X402_MAX_PER_HOUR;
  }
  if (process.env.X402_ALLOWED_DOMAINS) {
    env.X402_ALLOWED_DOMAINS = process.env.X402_ALLOWED_DOMAINS;
  }
  if (process.env.X402_BLOCKED_DOMAINS) {
    env.X402_BLOCKED_DOMAINS = process.env.X402_BLOCKED_DOMAINS;
  }

  // Signal to child that x402 is active at the bridge level
  env.X402_BRIDGE_ACTIVE = isX402Active() ? "true" : "false";

  return env;
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
    "-m", message,
  ];

  console.log(`[openclaw] Spawning: ${openclawPath} ${args.join(" ")}`);

  const child = spawn(openclawPath, args, {
    cwd: resolve(process.env.HOME || "/home/manifest"),
    env: {
      ...process.env,
      ...getX402ChildEnv(),
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
