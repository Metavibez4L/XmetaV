import { execSync } from "child_process";

const LAUNCHD_LABEL = "com.xmetav.bridge";

type BridgeStatus = {
  supported: boolean;
  running: boolean;
  pid: number | null;
};

function isSupported(): boolean {
  return !process.env.VERCEL;
}

/** Parse `launchctl list` to find the bridge service PID and exit code. */
function getLaunchdInfo(): { pid: number | null; lastExit: number | null } {
  try {
    const out = execSync("launchctl list", { encoding: "utf-8", timeout: 5000 });
    for (const line of out.split("\n")) {
      if (line.includes(LAUNCHD_LABEL)) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[0] === "-" ? null : Number(parts[0]);
        const exit = parts[1] === "-" ? null : Number(parts[1]);
        return { pid: Number.isFinite(pid!) ? pid : null, lastExit: Number.isFinite(exit!) ? exit : null };
      }
    }
  } catch {
    // launchctl not available or failed
  }
  return { pid: null, lastExit: null };
}

/** Check if port 3001 has a listener (fallback check). */
function isPortListening(): boolean {
  try {
    const out = execSync("lsof -iTCP:3001 -sTCP:LISTEN -P -t", { encoding: "utf-8", timeout: 5000 });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

export async function getBridgeStatus(): Promise<BridgeStatus> {
  if (!isSupported()) return { supported: false, running: false, pid: null };

  const info = getLaunchdInfo();
  if (info.pid) {
    return { supported: true, running: true, pid: info.pid };
  }

  // Fallback: check port in case launchctl parsing missed it
  if (isPortListening()) {
    return { supported: true, running: true, pid: null };
  }

  return { supported: true, running: false, pid: null };
}

export async function startBridge(): Promise<BridgeStatus> {
  if (!isSupported()) return { supported: false, running: false, pid: null };

  const current = await getBridgeStatus();
  if (current.running) return current;

  try {
    // kickstart -k forces a restart even if already loaded
    execSync(`launchctl kickstart -k gui/$(id -u)/${LAUNCHD_LABEL}`, {
      encoding: "utf-8",
      timeout: 10000,
    });
  } catch {
    // If kickstart fails, try bootstrap
    try {
      execSync(
        `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/${LAUNCHD_LABEL}.plist`,
        { encoding: "utf-8", timeout: 10000 }
      );
    } catch {
      // already loaded — ignore
    }
  }

  // Wait up to 8s for the bridge to come up
  const start = Date.now();
  while (Date.now() - start < 8000) {
    await new Promise((r) => setTimeout(r, 500));
    const status = await getBridgeStatus();
    if (status.running) return status;
  }

  return getBridgeStatus();
}

export async function stopBridge(): Promise<BridgeStatus> {
  if (!isSupported()) return { supported: false, running: false, pid: null };

  try {
    execSync(`launchctl kill SIGTERM gui/$(id -u)/${LAUNCHD_LABEL}`, {
      encoding: "utf-8",
      timeout: 5000,
    });
  } catch {
    // not running — ignore
  }

  // Note: KeepAlive will restart it. To truly stop, would need bootout.
  // For the dashboard, "stop" means "restart" — which is the expected behavior.
  await new Promise((r) => setTimeout(r, 2000));
  return getBridgeStatus();
}

