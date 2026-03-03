/**
 * Sentinel Event Monitor — Event-driven monitoring via Supabase Realtime + polling.
 *
 * Subscribes to system events and translates them into typed events.
 * Adaptive polling: 60s when healthy, 5s when issues are detected.
 */

import { EventEmitter } from "events";
import { supabase } from "../supabase.js";
import { execSync } from "child_process";

export type ServiceName = "bridge" | "dashboard" | "x402" | "ollama" | "gateway" | "supabase" | "tailscale";
export type ServiceStatus = "up" | "down" | "degraded" | "unknown";

export interface ServiceHealth {
  service: ServiceName;
  status: ServiceStatus;
  pid?: number;
  uptime?: number;
  latencyMs?: number;
  checkedAt: Date;
  error?: string;
}

export interface SystemEvent {
  type: string;
  service: ServiceName | string;
  severity: "info" | "warning" | "critical";
  message: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

interface MonitorConfig {
  /** Healthy-state polling interval (ms, default: 60s) */
  healthyInterval?: number;
  /** Degraded-state polling interval (ms, default: 10s) */
  degradedInterval?: number;
  /** Min polling interval (ms, default: 5s) */
  minInterval?: number;
  /** Max polling interval (ms, default: 120s) */
  maxInterval?: number;
}

const LAUNCHD_SERVICES: Record<string, ServiceName> = {
  "com.xmetav.bridge": "bridge",
  "com.xmetav.dashboard": "dashboard",
  "com.xmetav.x402": "x402",
};

export class EventMonitor extends EventEmitter {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: number;
  private lastHealth = new Map<ServiceName, ServiceHealth>();
  private realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
  private readonly config: Required<MonitorConfig>;
  private running = false;

  constructor(config: MonitorConfig = {}) {
    super();
    this.config = {
      healthyInterval: config.healthyInterval ?? 60_000,
      degradedInterval: config.degradedInterval ?? 10_000,
      minInterval: config.minInterval ?? 5_000,
      maxInterval: config.maxInterval ?? 120_000,
    };
    this.interval = this.config.healthyInterval;
  }

  /** Start monitoring */
  start(): void {
    if (this.running) return;
    this.running = true;
    console.log("[sentinel:monitor] Starting event monitor");

    // Subscribe to Supabase Realtime for agent session changes
    this.realtimeChannel = supabase
      .channel("sentinel-monitor")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_sessions" },
        (payload) => {
          const row = (payload.new || payload.old) as {
            agent_id?: string;
            status?: string;
            last_heartbeat?: string;
          };
          if (row?.agent_id) {
            this.emit("event", {
              type: "agent:session_change",
              service: row.agent_id,
              severity: row.status === "offline" ? "warning" : "info",
              message: `Agent ${row.agent_id} → ${row.status}`,
              timestamp: new Date(),
              metadata: row,
            } satisfies SystemEvent);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sentinel_incidents" },
        (payload) => {
          const row = payload.new as { service?: string; severity?: string; message?: string };
          this.emit("event", {
            type: "incident:new",
            service: (row?.service || "unknown") as ServiceName,
            severity: (row?.severity as SystemEvent["severity"]) || "warning",
            message: row?.message || "New incident",
            timestamp: new Date(),
            metadata: row,
          } satisfies SystemEvent);
        }
      )
      .subscribe((status) => {
        console.log(`[sentinel:monitor] Realtime: ${status}`);
      });

    // Immediate first check then adaptive polling
    this.runChecks();
  }

  /** Stop monitoring */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    console.log("[sentinel:monitor] Stopped");
  }

  /** Get latest health state for all services */
  getHealth(): Map<ServiceName, ServiceHealth> {
    return new Map(this.lastHealth);
  }

  /** Get health snapshot as plain object */
  getHealthSnapshot(): Record<ServiceName, ServiceHealth> {
    const obj = {} as Record<ServiceName, ServiceHealth>;
    for (const [k, v] of this.lastHealth) {
      obj[k] = v;
    }
    return obj;
  }

  /** Run all health checks */
  private async runChecks(): Promise<void> {
    if (!this.running) return;

    const results: ServiceHealth[] = [];
    let hasIssues = false;

    try {
      // 1. Check launchd services (bridge, dashboard, x402)
      for (const [label, name] of Object.entries(LAUNCHD_SERVICES)) {
        const h = this.checkLaunchd(label, name);
        results.push(h);
        if (h.status !== "up") hasIssues = true;
      }

      // 2. Check Ollama
      const ollamaH = await this.checkHttp("ollama", "http://localhost:11434/api/tags", 5_000);
      results.push(ollamaH);
      if (ollamaH.status !== "up") hasIssues = true;

      // 3. Check Supabase
      const supaH = await this.checkSupabase();
      results.push(supaH);
      if (supaH.status !== "up") hasIssues = true;

      // 4. Check Tailscale
      const tsH = this.checkTailscale();
      results.push(tsH);
      if (tsH.status !== "up") hasIssues = true;

    } catch (err) {
      console.error("[sentinel:monitor] Check cycle error:", err);
    }

    // Update state & emit changes
    for (const h of results) {
      const prev = this.lastHealth.get(h.service);
      this.lastHealth.set(h.service, h);

      if (prev && prev.status !== h.status) {
        const event: SystemEvent = {
          type: h.status === "up" ? "service:recovered" : "service:down",
          service: h.service,
          severity: h.status === "up" ? "info" : h.status === "degraded" ? "warning" : "critical",
          message: `${h.service} ${prev.status} → ${h.status}${h.error ? `: ${h.error}` : ""}`,
          timestamp: h.checkedAt,
          metadata: { pid: h.pid, latencyMs: h.latencyMs },
        };
        this.emit("event", event);
        this.emit(h.status === "up" ? "service:recovered" : "service:down", event);
      }
    }

    // Adaptive interval
    if (hasIssues) {
      this.interval = Math.max(this.interval * 0.5, this.config.minInterval);
    } else {
      this.interval = Math.min(this.interval * 1.5, this.config.maxInterval);
    }

    // Schedule next check
    this.timer = setTimeout(() => this.runChecks(), this.interval);
  }

  /** Check a launchd service */
  private checkLaunchd(label: string, name: ServiceName): ServiceHealth {
    try {
      const out = execSync(`launchctl list | grep ${label}`, {
        encoding: "utf-8",
        timeout: 3_000,
      }).trim();
      const parts = out.split(/\s+/);
      const pid = parts[0] === "-" ? undefined : parseInt(parts[0], 10);
      const exitCode = parseInt(parts[1], 10);

      return {
        service: name,
        status: pid ? "up" : exitCode === 0 ? "degraded" : "down",
        pid: pid || undefined,
        checkedAt: new Date(),
        error: !pid ? `exitCode=${exitCode}` : undefined,
      };
    } catch {
      return { service: name, status: "down", checkedAt: new Date(), error: "not loaded" };
    }
  }

  /** Check an HTTP endpoint */
  private async checkHttp(name: ServiceName, url: string, timeoutMs: number): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      const latencyMs = Date.now() - start;

      return {
        service: name,
        status: res.ok ? "up" : "degraded",
        latencyMs,
        checkedAt: new Date(),
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (err) {
      return {
        service: name,
        status: "down",
        latencyMs: Date.now() - start,
        checkedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Check Supabase connectivity */
  private async checkSupabase(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      const { error } = await supabase
        .from("agent_sessions")
        .select("agent_id")
        .limit(1)
        .single();
      const latencyMs = Date.now() - start;

      return {
        service: "supabase",
        status: error ? "degraded" : "up",
        latencyMs,
        checkedAt: new Date(),
        error: error?.message,
      };
    } catch (err) {
      return {
        service: "supabase",
        status: "down",
        latencyMs: Date.now() - start,
        checkedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Check Tailscale */
  private checkTailscale(): ServiceHealth {
    try {
      const out = execSync("tailscale status --self --json 2>/dev/null", {
        encoding: "utf-8",
        timeout: 3_000,
      });
      const data = JSON.parse(out);
      return {
        service: "tailscale",
        status: data.BackendState === "Running" ? "up" : "degraded",
        checkedAt: new Date(),
        error: data.BackendState !== "Running" ? `state: ${data.BackendState}` : undefined,
      };
    } catch {
      return { service: "tailscale", status: "down", checkedAt: new Date(), error: "not running" };
    }
  }
}
