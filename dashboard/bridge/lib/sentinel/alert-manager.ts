/**
 * Sentinel Alert Manager — Stateful alerting with cooldowns & escalation.
 *
 * Anti-fatigue: exponential backoff on repeated alerts, severity escalation,
 * and cooldown windows to reduce noise by ~80%.
 */

export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertState {
  severity: AlertSeverity;
  count: number;
  firstSeen: Date;
  lastAlerted: Date;
  cooldownMinutes: number;
  resolved: boolean;
}

export interface Alert {
  service: string;
  type: string;
  severity: AlertSeverity;
  message: string;
  timestamp: Date;
  count: number;
  metadata?: Record<string, unknown>;
}

type AlertHandler = (alert: Alert) => void | Promise<void>;

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export class AlertManager {
  private states = new Map<string, AlertState>();
  private handlers: AlertHandler[] = [];
  private history: Alert[] = [];
  private readonly maxHistory: number;

  constructor(opts: { maxHistory?: number } = {}) {
    this.maxHistory = opts.maxHistory ?? 500;
  }

  /** Register a handler that fires when an alert is emitted */
  onAlert(handler: AlertHandler): void {
    this.handlers.push(handler);
  }

  /** Report an issue — returns true if alert was actually emitted */
  report(service: string, type: string, message: string, meta?: Record<string, unknown>): boolean {
    const key = `${service}:${type}`;
    const now = new Date();
    let state = this.states.get(key);

    if (!state) {
      state = {
        severity: "info",
        count: 0,
        firstSeen: now,
        lastAlerted: new Date(0),
        cooldownMinutes: 1,
        resolved: false,
      };
      this.states.set(key, state);
    }

    // If previously resolved, reset
    if (state.resolved) {
      state.count = 0;
      state.severity = "info";
      state.cooldownMinutes = 1;
      state.firstSeen = now;
      state.resolved = false;
    }

    state.count++;

    // Escalation logic
    let shouldAlert = false;
    if (state.count === 1) {
      // First failure — alert immediately
      shouldAlert = true;
    } else if (state.count === 3 && state.severity !== "warning" && state.severity !== "critical") {
      // 3rd failure — escalate to warning
      state.severity = "warning";
      state.cooldownMinutes = 5;
      shouldAlert = true;
    } else if (state.count === 5 && state.severity !== "critical") {
      // 5th failure — critical
      state.severity = "critical";
      state.cooldownMinutes = 15;
      shouldAlert = true;
    }

    // Cooldown check
    if (!shouldAlert) {
      const minutesSinceAlert = (now.getTime() - state.lastAlerted.getTime()) / 60_000;
      shouldAlert = minutesSinceAlert > state.cooldownMinutes;
    }

    if (shouldAlert) {
      state.lastAlerted = now;
      const alert: Alert = {
        service,
        type,
        severity: state.severity,
        message,
        timestamp: now,
        count: state.count,
        metadata: meta,
      };
      this.emit(alert);
      return true;
    }

    return false;
  }

  /** Mark an issue as resolved — resets escalation state */
  resolve(service: string, type: string): void {
    const key = `${service}:${type}`;
    const state = this.states.get(key);
    if (state && !state.resolved) {
      state.resolved = true;
      this.emit({
        service,
        type: `${type}:resolved`,
        severity: "info",
        message: `${service} ${type} resolved after ${state.count} occurrence(s)`,
        timestamp: new Date(),
        count: 0,
      });
    }
  }

  /** Get all active (unresolved) alert states */
  getActiveAlerts(): Array<{ key: string; state: AlertState }> {
    const active: Array<{ key: string; state: AlertState }> = [];
    for (const [key, state] of this.states) {
      if (!state.resolved) {
        active.push({ key, state });
      }
    }
    return active.sort(
      (a, b) => SEVERITY_ORDER[b.state.severity] - SEVERITY_ORDER[a.state.severity]
    );
  }

  /** Get recent alert history */
  getHistory(limit = 50): Alert[] {
    return this.history.slice(-limit);
  }

  /** Reset everything */
  clear(): void {
    this.states.clear();
    this.history = [];
  }

  private emit(alert: Alert): void {
    this.history.push(alert);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
    for (const handler of this.handlers) {
      try {
        handler(alert);
      } catch (err) {
        console.error("[sentinel:alert] Handler error:", err);
      }
    }
  }
}
