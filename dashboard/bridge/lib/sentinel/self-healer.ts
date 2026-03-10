/**
 * Sentinel Self-Healer — Automated remediation for common issues.
 *
 * Each healing action is idempotent and logs its result.
 * If healing fails, the issue is escalated for human intervention.
 */

import { execSync } from "child_process";
import type { ServiceName } from "./event-monitor.js";

export interface HealingResult {
  service: string;
  action: string;
  success: boolean;
  message: string;
  timestamp: Date;
  durationMs: number;
}

type HealingAction = (target?: string) => Promise<HealingResult>;

const LAUNCHD_PREFIX = "gui/$(id -u)";
const EXEC_OPTS = { encoding: "utf-8" as const, timeout: 15_000 };

/** Build a consistent healing result */
function result(
  service: string,
  action: string,
  success: boolean,
  message: string,
  startMs: number
): HealingResult {
  return { service, action, success, message, timestamp: new Date(), durationMs: Date.now() - startMs };
}

/** Registry of healing actions keyed by issue type */
const healingActions: Record<string, HealingAction> = {
  // ── Launchd service restarts ──────────────────────────────

  "bridge:down": async () => {
    const start = Date.now();
    try {
      execSync(`launchctl kickstart -k ${LAUNCHD_PREFIX}/com.xmetav.bridge`, EXEC_OPTS);
      return result("bridge", "restart", true, "Bridge restarted via launchctl kickstart", start);
    } catch (err) {
      return result("bridge", "restart", false, `Restart failed: ${err instanceof Error ? err.message : err}`, start);
    }
  },

  "dashboard:down": async () => {
    const start = Date.now();
    try {
      execSync(`launchctl kickstart -k ${LAUNCHD_PREFIX}/com.xmetav.dashboard`, EXEC_OPTS);
      return result("dashboard", "restart", true, "Dashboard restarted", start);
    } catch (err) {
      return result("dashboard", "restart", false, `Restart failed: ${err instanceof Error ? err.message : err}`, start);
    }
  },

  "x402:down": async () => {
    const start = Date.now();
    try {
      // Kill any process squatting on the port first
      try {
        execSync("lsof -ti:4021 | xargs kill -9 2>/dev/null", EXEC_OPTS);
      } catch {
        /* no process on port — OK */
      }
      execSync(`launchctl kickstart -k ${LAUNCHD_PREFIX}/com.xmetav.x402`, EXEC_OPTS);
      return result("x402", "restart", true, "x402 restarted (port cleared)", start);
    } catch (err) {
      return result("x402", "restart", false, `Restart failed: ${err instanceof Error ? err.message : err}`, start);
    }
  },

  // ── Ollama ─────────────────────────────────────────────────

  "ollama:down": async () => {
    const start = Date.now();
    try {
      execSync("ollama serve &>/dev/null &", { ...EXEC_OPTS, timeout: 5_000 });
      // Wait a moment for startup
      await new Promise((r) => setTimeout(r, 2_000));
      // Verify it came up
      const res = await fetch("http://localhost:11434/api/tags", {
        signal: AbortSignal.timeout(3_000),
      });
      if (res.ok) {
        return result("ollama", "start", true, "Ollama started successfully", start);
      }
      return result("ollama", "start", false, `Ollama started but health check failed: HTTP ${res.status}`, start);
    } catch (err) {
      return result("ollama", "start", false, `Failed to start Ollama: ${err instanceof Error ? err.message : err}`, start);
    }
  },

  // ── Tailscale ──────────────────────────────────────────────

  "tailscale:down": async () => {
    const start = Date.now();
    try {
      execSync("tailscale up --accept-routes 2>/dev/null", EXEC_OPTS);
      return result("tailscale", "reconnect", true, "Tailscale reconnected", start);
    } catch (err) {
      return result("tailscale", "reconnect", false, `Tailscale reconnect failed: ${err instanceof Error ? err.message : err}`, start);
    }
  },

  // ── Stale locks ────────────────────────────────────────────

  "system:stale_locks": async () => {
    const start = Date.now();
    try {
      const out = execSync(
        "find /tmp -name '*.lock' -mmin +30 -delete -print 2>/dev/null || true",
        EXEC_OPTS
      ).trim();
      const count = out ? out.split("\n").length : 0;
      return result("system", "clean_locks", true, `Removed ${count} stale lock(s)`, start);
    } catch (err) {
      return result("system", "clean_locks", false, `Lock cleanup failed: ${err instanceof Error ? err.message : err}`, start);
    }
  },

  // ── Log rotation ───────────────────────────────────────────

  "system:logs_large": async () => {
    const start = Date.now();
    try {
      const logFiles = [
        "/tmp/xmetav-dashboard.log",
        "/tmp/xmetav-dashboard.err",
        "/tmp/xmetav-bridge.log",
        "/tmp/xmetav-bridge.err",
        "/tmp/xmetav-x402.log",
        "/tmp/xmetav-x402.err",
        "/tmp/xmetav-watchdog.log",
      ];
      let trimmed = 0;
      for (const f of logFiles) {
        try {
          const lines = execSync(`wc -l < "${f}" 2>/dev/null`, EXEC_OPTS).trim();
          if (parseInt(lines, 10) > 5000) {
            execSync(`tail -1000 "${f}" > "${f}.tmp" && mv "${f}.tmp" "${f}"`, EXEC_OPTS);
            trimmed++;
          }
        } catch {
          /* file doesn't exist — fine */
        }
      }
      return result("system", "log_rotation", true, `Trimmed ${trimmed} log file(s)`, start);
    } catch (err) {
      return result("system", "log_rotation", false, `Log rotation failed: ${err instanceof Error ? err.message : err}`, start);
    }
  },
};

export class SelfHealer {
  private history: HealingResult[] = [];
  private readonly maxHistory: number;
  private cooldowns = new Map<string, number>(); // key → timestamp of last heal
  private readonly cooldownMs: number;

  constructor(opts: { maxHistory?: number; cooldownMs?: number } = {}) {
    this.maxHistory = opts.maxHistory ?? 200;
    this.cooldownMs = opts.cooldownMs ?? 120_000; // 2-min cooldown per issue
  }

  /** Attempt to heal an issue. Returns null if on cooldown. */
  async heal(issueType: string, target?: string): Promise<HealingResult | null> {
    // Check cooldown
    const lastHeal = this.cooldowns.get(issueType);
    if (lastHeal && Date.now() - lastHeal < this.cooldownMs) {
      console.log(`[sentinel:healer] ${issueType} on cooldown, skipping`);
      return null;
    }

    const action = healingActions[issueType];
    if (!action) {
      console.warn(`[sentinel:healer] No healing action for: ${issueType}`);
      return null;
    }

    console.log(`[sentinel:healer] Attempting: ${issueType}`);
    this.cooldowns.set(issueType, Date.now());

    try {
      const res = await action(target);
      this.record(res);
      console.log(`[sentinel:healer] ${issueType} → ${res.success ? "SUCCESS" : "FAILED"}: ${res.message}`);
      return res;
    } catch (err) {
      const res: HealingResult = {
        service: issueType.split(":")[0],
        action: "heal",
        success: false,
        message: `Unhandled: ${err instanceof Error ? err.message : err}`,
        timestamp: new Date(),
        durationMs: 0,
      };
      this.record(res);
      return res;
    }
  }

  /** Check if an issue type has a registered healing action */
  canHeal(issueType: string): boolean {
    return issueType in healingActions;
  }

  /** Get healing history */
  getHistory(limit = 50): HealingResult[] {
    return this.history.slice(-limit);
  }

  /** Get stats */
  getStats(): { total: number; successful: number; failed: number; successRate: number } {
    const total = this.history.length;
    const successful = this.history.filter((r) => r.success).length;
    return {
      total,
      successful,
      failed: total - successful,
      successRate: total > 0 ? (successful / total) * 100 : 0,
    };
  }

  private record(result: HealingResult): void {
    this.history.push(result);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
  }
}
