import { spawn, type ChildProcess } from "child_process";
import { resolve } from "path";
import { randomUUID } from "crypto";

/** Allowed agent IDs to prevent arbitrary execution */
const ALLOWED_AGENTS = new Set(["main", "akua", "akua_web", "basedintern", "basedintern_web"]);

/** Default timeout for agent calls (seconds) — 180s gives tool-heavy runs room */
const DEFAULT_TIMEOUT_S = parseInt(process.env.AGENT_TIMEOUT || "180", 10);

export interface OpenClawOptions {
  agentId: string;
  message: string;
  onChunk: (text: string) => void;
  onExit: (code: number | null) => void;
  /** Whether this is a retry attempt (prevents infinite retry loops) */
  isRetry?: boolean;
  /** Timeout in seconds (default 120). Set 0 to disable. */
  timeoutSeconds?: number;
}

/**
 * Spawn an OpenClaw agent process with timeout.
 * Returns a handle to kill the process if needed.
 */
export function runAgent(options: OpenClawOptions): ChildProcess {
  const { agentId, message, onChunk, onExit, timeoutSeconds } = options;

  if (!ALLOWED_AGENTS.has(agentId)) {
    throw new Error(`Agent "${agentId}" is not in the allowed list`);
  }

  const openclawPath = process.env.OPENCLAW_PATH || "openclaw";
  const nodePath = process.env.NODE_PATH || "node";
  const timeout = timeoutSeconds ?? DEFAULT_TIMEOUT_S;

  // Use a unique session ID per command to avoid lock contention
  const sessionId = `dash_${randomUUID().slice(0, 8)}_${Date.now()}`;

  const args = [
    "agent",
    "--agent", agentId,
    "--local",
    "--thinking", "off",
    "--session-id", sessionId,
    "-m", message,
  ];

  console.log(`[openclaw] Spawning: ${openclawPath} ${args.join(" ")}${timeout > 0 ? ` (timeout: ${timeout}s)` : ""}`);

  const child = spawn(openclawPath, args, {
    cwd: resolve(process.env.HOME || "/home/manifest"),
    env: {
      ...process.env,
      PATH: `${resolve(nodePath, "..")}:${process.env.PATH}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let resolved = false;
  let timedOut = false;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

  // Hard timeout: SIGTERM then SIGKILL
  if (timeout > 0) {
    timeoutTimer = setTimeout(() => {
      if (resolved) return;
      timedOut = true;
      console.log(`[openclaw] Process timed out after ${timeout}s, sending SIGTERM`);
      onChunk(`\n[Bridge] Agent timed out after ${timeout}s\n`);
      try { child.kill("SIGTERM"); } catch { /* ignore */ }

      // Force-kill after 5s grace period
      setTimeout(() => {
        if (!resolved) {
          console.log(`[openclaw] Force-killing process after grace period`);
          try { child.kill("SIGKILL"); } catch { /* ignore */ }
        }
      }, 5000);
    }, timeout * 1000);
  }

  // Stream stdout
  child.stdout?.on("data", (data: Buffer) => {
    onChunk(data.toString("utf-8"));
  });

  // Stream stderr
  child.stderr?.on("data", (data: Buffer) => {
    onChunk(data.toString("utf-8"));
  });

  child.on("exit", (code) => {
    resolved = true;
    if (timeoutTimer) clearTimeout(timeoutTimer);
    const exitCode = timedOut ? 124 : code;
    console.log(`[openclaw] Process exited with code ${exitCode}${timedOut ? " (timeout)" : ""}`);
    onExit(exitCode);
  });

  child.on("error", (err) => {
    resolved = true;
    if (timeoutTimer) clearTimeout(timeoutTimer);
    console.error(`[openclaw] Spawn error:`, err.message);
    onChunk(`\n[Bridge Error] ${err.message}\n`);
    onExit(1);
  });

  return child;
}

/**
 * Run an agent with automatic retry on timeout or failure.
 * On timeout (exit 124) or non-zero exit: retries once.
 */
export function runAgentWithFallback(options: OpenClawOptions): ChildProcess {
  const { agentId, message, onChunk, onExit } = options;

  const originalOnExit = onExit;

  const child = runAgent({
    ...options,
    onExit: (code) => {
      // If timed out or failed, retry once (OpenClaw model is configured
      // via ~/.openclaw-dev/agents/<id>/agent/models.json, not CLI flags)
      if ((code === 124 || (code !== null && code !== 0)) && !options.isRetry) {
        console.log(`[openclaw] Primary attempt failed (exit ${code}), retrying once...`);
        onChunk(`\n[Bridge] First attempt failed — retrying...\n`);

        runAgent({
          agentId,
          message,
          isRetry: true,
          timeoutSeconds: options.timeoutSeconds ?? DEFAULT_TIMEOUT_S,
          onChunk,
          onExit: originalOnExit,
        });
      } else {
        originalOnExit(code);
      }
    },
  });

  return child;
}
