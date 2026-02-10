import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";

type BridgeProcState = {
  child: ChildProcess | null;
};

type BridgeStatus = {
  supported: boolean;
  running: boolean;
  pid: number | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __xmetavBridgeState: BridgeProcState | undefined;
}

function getState(): BridgeProcState {
  if (!global.__xmetavBridgeState) {
    global.__xmetavBridgeState = { child: null };
  }
  return global.__xmetavBridgeState;
}

function isSupported(): boolean {
  // Long-lived child processes are not supported on Vercel/Serverless runtimes.
  return !process.env.VERCEL;
}

function bridgeDir(): string {
  // Next.js server runs with cwd at the dashboard root.
  return path.join(process.cwd(), "bridge");
}

function pidFile(): string {
  return path.join(bridgeDir(), ".bridge.pid");
}

function readPidFile(): number | null {
  try {
    const raw = fs.readFileSync(pidFile(), "utf-8").trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function writePidFile(pid: number) {
  try {
    fs.writeFileSync(pidFile(), String(pid), "utf-8");
  } catch {
    // best-effort
  }
}

function removePidFile() {
  try {
    fs.unlinkSync(pidFile());
  } catch {
    // ignore
  }
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function npmCmd(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export async function getBridgeStatus(): Promise<BridgeStatus> {
  if (!isSupported()) return { supported: false, running: false, pid: null };

  const state = getState();
  const child = state.child;
  if (child && child.exitCode === null && !child.killed && child.pid) {
    return { supported: true, running: true, pid: child.pid };
  }

  const pid = readPidFile();
  if (pid && isPidRunning(pid)) {
    return { supported: true, running: true, pid };
  }

  if (pid) removePidFile();
  return { supported: true, running: false, pid: null };
}

export async function startBridge(): Promise<BridgeStatus> {
  if (!isSupported()) return { supported: false, running: false, pid: null };

  const current = await getBridgeStatus();
  if (current.running) return current;

  const state = getState();

  const child = spawn(npmCmd(), ["start"], {
    cwd: bridgeDir(),
    env: process.env,
    stdio: "ignore",
    detached: true,
  });

  // Allow parent to exit without killing bridge.
  child.unref();

  state.child = child;
  if (child.pid) writePidFile(child.pid);

  // If it dies quickly, clear state.
  child.on("exit", () => {
    state.child = null;
    removePidFile();
  });

  return { supported: true, running: true, pid: child.pid ?? null };
}

export async function stopBridge(): Promise<BridgeStatus> {
  if (!isSupported()) return { supported: false, running: false, pid: null };

  const state = getState();

  const pid = state.child?.pid ?? readPidFile();
  if (!pid) return { supported: true, running: false, pid: null };

  // Try graceful stop first.
  try {
    process.kill(pid, "SIGINT");
  } catch {
    // ignore
  }

  // Wait up to 5s for exit, then SIGKILL.
  const start = Date.now();
  while (Date.now() - start < 5000) {
    if (!isPidRunning(pid)) break;
    await new Promise((r) => setTimeout(r, 150));
  }

  if (isPidRunning(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // ignore
    }
  }

  state.child = null;
  removePidFile();
  return { supported: true, running: false, pid: null };
}

