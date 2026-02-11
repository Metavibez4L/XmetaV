import { spawn, type ChildProcess } from "child_process";
import { resolve } from "path";

/** Allowed agent IDs to prevent arbitrary execution */
const ALLOWED_AGENTS = new Set(["main", "akua", "akua_web", "basedintern", "basedintern_web"]);

/** Default timeout for agent calls (seconds) */
const DEFAULT_TIMEOUT_S = parseInt(process.env.AGENT_TIMEOUT || "120", 10);

/** Fallback model when primary (kimi) times out or fails */
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || "ollama/qwen2.5:7b-instruct";

export interface OpenClawOptions {
  agentId: string;
  message: string;
  onChunk: (text: string) => void;
  onExit: (code: number | null) => void;
  /** Override model (e.g. for fallback retry) */
  model?: string;
  /** Timeout in seconds (default 120). Set 0 to disable. */
  timeoutSeconds?: number;
}

/**
 * Spawn an OpenClaw agent process with timeout.
 * Returns a handle to kill the process if needed.
 */
export function runAgent(options: OpenClawOptions): ChildProcess {
  const { agentId, message, onChunk, onExit, model, timeoutSeconds } = options;

  if (!ALLOWED_AGENTS.has(agentId)) {
    throw new Error(`Agent "${agentId}" is not in the allowed list`);
  }

  const openclawPath = process.env.OPENCLAW_PATH || "openclaw";
  const nodePath = process.env.NODE_PATH || "node";
  const timeout = timeoutSeconds ?? DEFAULT_TIMEOUT_S;

  const args = [
    "agent",
    "--agent", agentId,
    "--local",
    "--thinking", "off",
    "-m", message,
  ];

  // Override model if specified (used for fallback retries)
  if (model) {
    args.push("--model", model);
  }

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
 * Run an agent with automatic fallback to a faster local model on timeout or failure.
 * On timeout (exit 124) or non-zero exit: retries once with FALLBACK_MODEL.
 */
export function runAgentWithFallback(options: OpenClawOptions): ChildProcess {
  const { agentId, message, onChunk, onExit } = options;

  const originalOnExit = onExit;

  const child = runAgent({
    ...options,
    onExit: (code) => {
      // If timed out or failed, retry with fallback model
      if ((code === 124 || (code !== null && code !== 0)) && !options.model) {
        console.log(`[openclaw] Primary model failed (exit ${code}), retrying with fallback: ${FALLBACK_MODEL}`);
        onChunk(`\n[Bridge] Retrying with local model (${FALLBACK_MODEL})...\n`);

        runAgent({
          agentId,
          message,
          model: FALLBACK_MODEL,
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
