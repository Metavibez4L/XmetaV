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

/** Idle timeout (seconds) — kill if no output AND process appears dead/stuck.
 *  OpenClaw buffers all output during tool calls (URL fetch, code execution),
 *  so we can't rely on stdout alone. Instead we check process liveness via
 *  kill(0) and only kill after the hard timeout. The idle timeout now only
 *  applies as a secondary signal — we send a heartbeat to the UI instead of
 *  killing the agent. */
const IDLE_TIMEOUT_S = parseInt(process.env.AGENT_IDLE_TIMEOUT || "90", 10);

/** Retry timeout (seconds) — shorter than first attempt since we already waited */
const RETRY_TIMEOUT_S = parseInt(process.env.AGENT_RETRY_TIMEOUT || "120", 10);

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
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
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

  // Idle-output timeout: instead of killing on silence, we check if the process
  // is still alive. OpenClaw buffers output during tool calls (URL fetches,
  // code execution), so 90s+ of silence is normal. We only kill if:
  //   1) The hard timeout expires (DEFAULT_TIMEOUT_S), OR
  //   2) The process is no longer running (kill(0) throws)
  // Meanwhile, we send heartbeat pings to the streamer so the UI knows
  // the agent is working.
  const idleTimeout = IDLE_TIMEOUT_S;
  let heartbeatCount = 0;
  function resetIdleTimer() {
    lastOutputAt = Date.now();
    heartbeatCount = 0;
  }

  // Periodic liveness check: runs every IDLE_TIMEOUT_S seconds.
  // If there's been no output, check if the process is still alive.
  // If alive → send a heartbeat to UI. If dead → let exit handler deal with it.
  const livenessInterval = idleTimeout > 0 ? setInterval(() => {
    if (resolved) return;
    const silentSecs = Math.round((Date.now() - lastOutputAt) / 1000);
    if (silentSecs < idleTimeout) return; // output was recent, nothing to do

    // Check if the process is still alive
    try {
      child.kill(0); // signal 0 = test if process exists, doesn't actually kill
    } catch {
      // Process is gone — exit handler will fire, nothing to do
      console.log(`[openclaw] Process appears dead after ${silentSecs}s of silence`);
      return;
    }

    // Process is alive but silent — send heartbeat to UI
    heartbeatCount++;
    const msg = heartbeatCount === 1
      ? `\n[Bridge] Agent working (tool call in progress, no output for ${silentSecs}s)...\n`
      : ""; // only send the first heartbeat message to avoid spam
    if (msg) onChunk(msg);
    console.log(`[openclaw] Heartbeat #${heartbeatCount}: process alive, silent for ${silentSecs}s`);
  }, idleTimeout * 1000) : null;

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
    if (livenessInterval) clearInterval(livenessInterval);
    const exitCode = timedOut ? 124 : code;
    const suffix = timedOut ? " (timeout)" : "";
    console.log(`[openclaw] Process exited with code ${exitCode}${suffix}`);
    onExit(exitCode);
  });

  child.on("error", (err) => {
    resolved = true;
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (livenessInterval) clearInterval(livenessInterval);
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
