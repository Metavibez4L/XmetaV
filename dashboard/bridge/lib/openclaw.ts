import { spawn, type ChildProcess } from "child_process";
import { resolve } from "path";
import { randomUUID } from "crypto";
import { existsSync, realpathSync } from "fs";

/** Allowed agent IDs to prevent arbitrary execution */
const ALLOWED_AGENTS = new Set([
  "main",
  "soul",
  "sentinel",
  "briefing",
  "oracle",
  "alchemist",
  "midas",
  "web3dev",
  "akua",
  "akua_web",
  "basedintern",
  "basedintern_web",
  "vox",
  "scholar",
]);

/** Default timeout for agent calls (seconds) — 180s gives tool-heavy runs room */
const DEFAULT_TIMEOUT_S = parseInt(process.env.AGENT_TIMEOUT || "180", 10);

/** Idle timeout (seconds) — kill if no output for this long (tool hangs, etc.) */
const IDLE_TIMEOUT_S = parseInt(process.env.AGENT_IDLE_TIMEOUT || "30", 10);

/** Retry timeout (seconds) — shorter than first attempt since we already waited */
const RETRY_TIMEOUT_S = parseInt(process.env.AGENT_RETRY_TIMEOUT || "90", 10);

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

  // Session strategy:
  // - "main" gets a daily persistent session so it retains conversation context
  //   BUT: falls back to a unique ID if the session lock is held (concurrent commands)
  // - All other agents get unique session IDs to avoid lock contention
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  let sessionId: string;
  if (agentId === "main") {
    const persistentId = `dash_main_${today}`;
    const homeDir = process.env.HOME || "/home/manifest";
    const lockPath = resolve(homeDir, `.openclaw/agents/main/sessions/${persistentId}.jsonl.lock`);
    if (existsSync(lockPath)) {
      // Persistent session is busy — fall back to unique ID so the command isn't blocked
      sessionId = `dash_${randomUUID().slice(0, 8)}_${Date.now()}`;
      console.log(`[openclaw] Main session locked, using fallback: ${sessionId}`);
    } else {
      sessionId = persistentId;
    }
  } else {
    sessionId = `dash_${randomUUID().slice(0, 8)}_${Date.now()}`;
  }

  const args = [
    "agent",
    "--agent", agentId,
    "--local",
    "--thinking", "off",
    "--session-id", sessionId,
    "-m", message,
  ];

  console.log(`[openclaw] Spawning: ${openclawPath} ${args.join(" ")}${timeout > 0 ? ` (timeout: ${timeout}s)` : ""}`);

  // Run from the XmetaV project root so the agent has direct repo context
  const projectRoot = process.env.XMETAV_ROOT || resolve(process.env.HOME || "/home/manifest", "XmetaV");

  // Resolve the actual openclaw script for direct node invocation.
  // On macOS, spawn() can fail with ENOENT on symlinked #!/usr/bin/env scripts,
  // so we spawn node directly with the resolved script path instead.
  const resolvedOpenclaw = existsSync(openclawPath)
    ? realpathSync(openclawPath)
    : openclawPath;

  const child = spawn(nodePath, [resolvedOpenclaw, ...args], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PATH: `${resolve(nodePath, "..")}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let resolved = false;
  let timedOut = false;
  let idleTimedOut = false;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let lastOutputAt = Date.now();

  /** Kill the process with a reason label */
  function killWithReason(reason: string, label: string) {
    if (resolved) return;
    timedOut = true;
    console.log(`[openclaw] ${reason}, sending SIGTERM`);
    onChunk(`\n[Bridge] ${label}\n`);
    try { child.kill("SIGTERM"); } catch { /* ignore */ }

    // Force-kill after 5s grace period
    setTimeout(() => {
      if (!resolved) {
        console.log(`[openclaw] Force-killing process after grace period`);
        try { child.kill("SIGKILL"); } catch { /* ignore */ }
      }
    }, 5000);
  }

  // Hard timeout: absolute wall-clock limit
  if (timeout > 0) {
    timeoutTimer = setTimeout(() => {
      killWithReason(
        `Process timed out after ${timeout}s`,
        `Agent timed out after ${timeout}s`
      );
    }, timeout * 1000);
  }

  // Idle-output timeout: kill if no stdout/stderr for IDLE_TIMEOUT_S
  // This catches hung tool calls (e.g. browser tools with no Chrome attached)
  const idleTimeout = IDLE_TIMEOUT_S;
  function resetIdleTimer() {
    lastOutputAt = Date.now();
    if (idleTimer) clearTimeout(idleTimer);
    if (idleTimeout > 0 && !resolved) {
      idleTimer = setTimeout(() => {
        if (resolved) return;
        idleTimedOut = true;
        const silentSecs = Math.round((Date.now() - lastOutputAt) / 1000);
        killWithReason(
          `No output for ${silentSecs}s (idle timeout)`,
          `Agent idle — no output for ${silentSecs}s (likely a hung tool call). Killing.`
        );
      }, idleTimeout * 1000);
    }
  }
  resetIdleTimer();

  // Stream stdout
  child.stdout?.on("data", (data: Buffer) => {
    resetIdleTimer();
    onChunk(data.toString("utf-8"));
  });

  // Stream stderr
  child.stderr?.on("data", (data: Buffer) => {
    resetIdleTimer();
    onChunk(data.toString("utf-8"));
  });

  child.on("exit", (code) => {
    resolved = true;
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (idleTimer) clearTimeout(idleTimer);
    const exitCode = timedOut ? 124 : code;
    const suffix = idleTimedOut ? " (idle timeout)" : timedOut ? " (timeout)" : "";
    console.log(`[openclaw] Process exited with code ${exitCode}${suffix}`);
    onExit(exitCode);
  });

  child.on("error", (err) => {
    resolved = true;
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (idleTimer) clearTimeout(idleTimer);
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
          timeoutSeconds: RETRY_TIMEOUT_S,
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
