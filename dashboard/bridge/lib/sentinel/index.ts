/**
 * Sentinel — Unified monitoring, alerting, healing, and prediction engine.
 *
 * Singleton that orchestrates all sentinel sub-systems:
 *  - EventMonitor (event-driven + adaptive polling)
 *  - AlertManager (anti-fatigue smart alerting)
 *  - SelfHealer (automated remediation)
 *  - PredictiveHealth (trend analysis + anomaly detection)
 *  - DistributedTracer (end-to-end request tracing)
 *
 * Wired into the bridge daemon heartbeat loop.
 */

import { supabase } from "../supabase.js";
import { AlertManager, type Alert } from "./alert-manager.js";
import { EventMonitor, type SystemEvent, type ServiceHealth } from "./event-monitor.js";
import { SelfHealer, type HealingResult } from "./self-healer.js";
import { PredictiveHealth, type Prediction, type ResourceSnapshot } from "./predictive-health.js";
import { DistributedTracer, type Trace } from "./distributed-tracer.js";
import { refreshSitrep } from "../../src/heartbeat.js";

export interface SentinelReport {
  timestamp: string;
  health: Record<string, ServiceHealth>;
  resources: ResourceSnapshot | null;
  predictions: Prediction[];
  anomalies: Array<{ metric: string; value: number; zScore: number; isAnomaly: boolean }>;
  activeAlerts: Array<{ key: string; severity: string; count: number; firstSeen: string }>;
  recentAlerts: Alert[];
  healingStats: { total: number; successful: number; failed: number; successRate: number };
  recentHealing: HealingResult[];
  tracing: { p95LatencyMs: number; throughput: number; errorRate: number };
  incidents: {
    open: number;
    last24h: number;
    resolvedToday: number;
  };
}

let instance: Sentinel | null = null;

export class Sentinel {
  readonly alerts: AlertManager;
  readonly monitor: EventMonitor;
  readonly healer: SelfHealer;
  readonly health: PredictiveHealth;
  readonly tracer: DistributedTracer;

  private resourceTimer: ReturnType<typeof setInterval> | null = null;
  private incidentCheckTimer: ReturnType<typeof setInterval> | null = null;
  private lastSitrepTrigger = 0;
  private running = false;

  constructor() {
    this.alerts = new AlertManager();
    this.monitor = new EventMonitor();
    this.healer = new SelfHealer();
    this.health = new PredictiveHealth();
    this.tracer = new DistributedTracer();

    this.wireEventHandlers();
  }

  /** Get or create singleton */
  static getInstance(): Sentinel {
    if (!instance) {
      instance = new Sentinel();
    }
    return instance;
  }

  /** Start all sentinel systems */
  start(): void {
    if (this.running) return;
    this.running = true;

    console.log("╔══════════════════════════════════════╗");
    console.log("║    Sentinel Engine v1.0.0            ║");
    console.log("║    Monitoring · Alerting · Healing   ║");
    console.log("╚══════════════════════════════════════╝");

    // Start event monitor (adaptive polling + realtime)
    this.monitor.start();

    // Collect resource snapshots every 60s
    this.health.collectSnapshot();
    this.resourceTimer = setInterval(() => {
      this.health.collectSnapshot();

      // Check for anomalies and report
      const anomalies = this.health.detectAnomalies();
      for (const a of anomalies) {
        if (a.isAnomaly) {
          this.alerts.report("system", `anomaly:${a.metric}`, `${a.metric} anomaly detected (z=${a.zScore}, value=${a.value})`);
        }
      }

      // Check predictions
      const predictions = this.health.predict();
      for (const p of predictions) {
        if (p.type !== "healthy") {
          this.alerts.report("system", `prediction:${p.type}`, `${p.recommendation} (confidence: ${(p.confidence * 100).toFixed(0)}%)`);
        }
      }
    }, 60_000);

    // Persist incidents to DB every 5 minutes
    this.incidentCheckTimer = setInterval(() => {
      this.persistIncidents().catch(() => {});
    }, 300_000);

    console.log("[sentinel] All systems started");
  }

  /** Stop all sentinel systems */
  stop(): void {
    this.running = false;
    this.monitor.stop();
    if (this.resourceTimer) {
      clearInterval(this.resourceTimer);
      this.resourceTimer = null;
    }
    if (this.incidentCheckTimer) {
      clearInterval(this.incidentCheckTimer);
      this.incidentCheckTimer = null;
    }
    console.log("[sentinel] All systems stopped");
  }

  /** Generate a full report */
  async generateReport(): Promise<SentinelReport> {
    const healthSnapshot = this.monitor.getHealthSnapshot();
    const resourceSummary = this.health.getSummary();
    const activeAlerts = this.alerts.getActiveAlerts();
    const healingStats = this.healer.getStats();

    // Fetch incident counts from DB
    let openIncidents = 0;
    let last24h = 0;
    let resolvedToday = 0;

    try {
      const { count: openCount } = await supabase
        .from("sentinel_incidents")
        .select("*", { count: "exact", head: true })
        .eq("resolved", false);
      openIncidents = openCount ?? 0;

      const yesterday = new Date(Date.now() - 86_400_000).toISOString();
      const { count: dayCount } = await supabase
        .from("sentinel_incidents")
        .select("*", { count: "exact", head: true })
        .gte("created_at", yesterday);
      last24h = dayCount ?? 0;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: resolvedCount } = await supabase
        .from("sentinel_incidents")
        .select("*", { count: "exact", head: true })
        .eq("resolved", true)
        .gte("resolved_at", todayStart.toISOString());
      resolvedToday = resolvedCount ?? 0;
    } catch {
      /* DB not available — use defaults */
    }

    return {
      timestamp: new Date().toISOString(),
      health: healthSnapshot,
      resources: resourceSummary.latest,
      predictions: resourceSummary.predictions,
      anomalies: resourceSummary.anomalies,
      activeAlerts: activeAlerts.map((a) => ({
        key: a.key,
        severity: a.state.severity,
        count: a.state.count,
        firstSeen: a.state.firstSeen.toISOString(),
      })),
      recentAlerts: this.alerts.getHistory(20),
      healingStats,
      recentHealing: this.healer.getHistory(20),
      tracing: {
        p95LatencyMs: this.tracer.getP95("bridge"),
        throughput: this.tracer.getThroughput(),
        errorRate: this.tracer.getErrorRate(),
      },
      incidents: {
        open: openIncidents,
        last24h,
        resolvedToday,
      },
    };
  }

  // ── Private ───────────────────────────────────────────────

  /** Wire cross-module event handlers */
  private wireEventHandlers(): void {
    // Monitor events → Alert manager
    this.monitor.on("event", (event: SystemEvent) => {
      if (event.severity === "warning" || event.severity === "critical") {
        this.alerts.report(event.service, event.type, event.message, event.metadata);
      }
    });

    // Service down → Try self-healing
    this.monitor.on("service:down", async (event: SystemEvent) => {
      const issueType = `${event.service}:down`;
      if (this.healer.canHeal(issueType)) {
        console.log(`[sentinel] Auto-healing: ${issueType}`);
        const result = await this.healer.heal(issueType);
        if (result?.success) {
          this.alerts.resolve(event.service, event.type);
        }
      }
    });

    // Service recovered → Resolve alerts
    this.monitor.on("service:recovered", (event: SystemEvent) => {
      this.alerts.resolve(event.service, `${event.service}:down`);
    });

    // Alert handler → Persist to DB + trigger SITREP for criticals
    this.alerts.onAlert(async (alert: Alert) => {
      console.log(`[sentinel:alert] [${alert.severity.toUpperCase()}] ${alert.service}: ${alert.message}`);

      // Persist critical/warning alerts as incidents
      if (alert.severity === "critical" || alert.severity === "warning") {
        try {
          await supabase.from("sentinel_incidents").insert({
            service: alert.service,
            type: alert.type,
            severity: alert.severity,
            message: alert.message,
            count: alert.count,
            metadata: alert.metadata || {},
            resolved: !!alert.type.endsWith(":resolved"),
            resolved_at: alert.type.endsWith(":resolved") ? new Date().toISOString() : null,
          });
        } catch {
          /* DB not available — log only */
        }
      }

      // Trigger SITREP for critical incidents (max once per 30 min)
      if (alert.severity === "critical" && Date.now() - this.lastSitrepTrigger > 30 * 60_000) {
        this.lastSitrepTrigger = Date.now();
        refreshSitrep("sentinel-critical");
      }
    });
  }

  /** Persist current alerts as incidents to DB */
  private async persistIncidents(): Promise<void> {
    const active = this.alerts.getActiveAlerts();
    if (active.length === 0) return;

    // Clean up stale locks while we're at it
    if (this.healer.canHeal("system:stale_locks")) {
      await this.healer.heal("system:stale_locks");
    }

    // Log rotation check
    if (this.healer.canHeal("system:logs_large")) {
      await this.healer.heal("system:logs_large");
    }
  }
}

// Re-export sub-module types
export type { Alert, AlertSeverity, AlertState } from "./alert-manager.js";
export type { SystemEvent, ServiceHealth, ServiceName, ServiceStatus } from "./event-monitor.js";
export type { HealingResult } from "./self-healer.js";
export type { Prediction, ResourceSnapshot } from "./predictive-health.js";
export type { Trace, Span } from "./distributed-tracer.js";
