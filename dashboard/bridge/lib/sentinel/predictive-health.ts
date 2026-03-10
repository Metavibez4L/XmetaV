/**
 * Sentinel Predictive Health — Trend analysis & anomaly detection.
 *
 * Collects time-series resource metrics and uses linear regression
 * to predict failures before they happen. Includes z-score anomaly detection.
 */

import { execSync } from "child_process";

export interface ResourceSnapshot {
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  loadAvg1m: number;
  timestamp: Date;
}

export interface Prediction {
  type: "healthy" | "oom_warning" | "high_cpu" | "disk_full_warning" | "high_load";
  confidence: number;
  timeframe: string;
  recommendation: string;
  currentValue: number;
  predictedValue?: number;
}

interface MetricHistory {
  values: number[];
  timestamps: number[];
}

export class PredictiveHealth {
  private history: ResourceSnapshot[] = [];
  private readonly maxSamples: number;
  private readonly zScoreThreshold: number;

  constructor(opts: { maxSamples?: number; zScoreThreshold?: number } = {}) {
    this.maxSamples = opts.maxSamples ?? 360; // 6 hours at 1-min intervals
    this.zScoreThreshold = opts.zScoreThreshold ?? 3;
  }

  /** Collect current resource metrics (macOS) */
  collectSnapshot(): ResourceSnapshot {
    let cpuPercent = 0;
    let memoryPercent = 0;
    let diskPercent = 0;
    let loadAvg1m = 0;

    try {
      // CPU usage via top (1 sample)
      const topOut = execSync(
        "top -l 1 -n 0 2>/dev/null | grep 'CPU usage'",
        { encoding: "utf-8", timeout: 5_000 }
      ).trim();
      const userMatch = topOut.match(/([\d.]+)%\s*user/);
      const sysMatch = topOut.match(/([\d.]+)%\s*sys/);
      cpuPercent = (parseFloat(userMatch?.[1] || "0") + parseFloat(sysMatch?.[1] || "0"));
    } catch { /* default 0 */ }

    try {
      // Memory via vm_stat
      const vmOut = execSync("vm_stat 2>/dev/null", { encoding: "utf-8", timeout: 3_000 });
      const pageSize = 16384; // Apple Silicon page size
      const free = parseInt(vmOut.match(/Pages free:\s+(\d+)/)?.[1] || "0", 10);
      const active = parseInt(vmOut.match(/Pages active:\s+(\d+)/)?.[1] || "0", 10);
      const inactive = parseInt(vmOut.match(/Pages inactive:\s+(\d+)/)?.[1] || "0", 10);
      const wired = parseInt(vmOut.match(/Pages wired down:\s+(\d+)/)?.[1] || "0", 10);
      const speculative = parseInt(vmOut.match(/Pages speculative:\s+(\d+)/)?.[1] || "0", 10);
      const total = free + active + inactive + wired + speculative;
      if (total > 0) {
        memoryPercent = ((active + wired) / total) * 100;
      }
    } catch {
      try {
        // Fallback: sysctl
        const memPressure = execSync(
          "memory_pressure 2>/dev/null | head -1",
          { encoding: "utf-8", timeout: 3_000 }
        );
        const pctMatch = memPressure.match(/([\d.]+)%/);
        if (pctMatch) memoryPercent = parseFloat(pctMatch[1]);
      } catch { /* default 0 */ }
    }

    try {
      // Disk usage
      const dfOut = execSync("df -h / 2>/dev/null | tail -1", { encoding: "utf-8", timeout: 3_000 });
      const pctMatch = dfOut.match(/(\d+)%/);
      if (pctMatch) diskPercent = parseInt(pctMatch[1], 10);
    } catch { /* default 0 */ }

    try {
      // Load average
      const loadOut = execSync("sysctl -n vm.loadavg 2>/dev/null", { encoding: "utf-8", timeout: 3_000 });
      const nums = loadOut.match(/[\d.]+/g);
      if (nums?.[0]) loadAvg1m = parseFloat(nums[0]);
    } catch { /* default 0 */ }

    const snapshot: ResourceSnapshot = {
      cpuPercent: Math.round(cpuPercent * 100) / 100,
      memoryPercent: Math.round(memoryPercent * 100) / 100,
      diskPercent,
      loadAvg1m: Math.round(loadAvg1m * 100) / 100,
      timestamp: new Date(),
    };

    this.history.push(snapshot);
    if (this.history.length > this.maxSamples) {
      this.history = this.history.slice(-this.maxSamples);
    }

    return snapshot;
  }

  /** Predict potential failures based on trends */
  predict(): Prediction[] {
    if (this.history.length < 5) {
      return [{ type: "healthy", confidence: 0.5, timeframe: "n/a", recommendation: "Collecting baseline data...", currentValue: 0 }];
    }

    const predictions: Prediction[] = [];
    const latest = this.history[this.history.length - 1];

    // Memory trend
    const memHistory = this.extractMetric("memoryPercent");
    const memTrend = this.linearRegression(memHistory);
    const memPredicted10m = memTrend.predict(10);

    if (memTrend.slope > 0.5 && memPredicted10m > 90) {
      predictions.push({
        type: "oom_warning",
        confidence: Math.min(0.95, 0.6 + memTrend.r2 * 0.35),
        timeframe: "10m",
        recommendation: "Memory trending up rapidly — consider restarting heavy agents or increasing limits",
        currentValue: latest.memoryPercent,
        predictedValue: Math.round(memPredicted10m * 10) / 10,
      });
    }

    // CPU trend
    if (latest.cpuPercent > 80) {
      predictions.push({
        type: "high_cpu",
        confidence: 0.9,
        timeframe: "now",
        recommendation: "CPU usage above 80% — check for runaway processes",
        currentValue: latest.cpuPercent,
      });
    }

    // Disk prediction
    const diskHistory = this.extractMetric("diskPercent");
    const diskTrend = this.linearRegression(diskHistory);
    const diskPredicted60m = diskTrend.predict(60);

    if (latest.diskPercent > 85 || (diskTrend.slope > 0.01 && diskPredicted60m > 95)) {
      predictions.push({
        type: "disk_full_warning",
        confidence: latest.diskPercent > 90 ? 0.95 : 0.75,
        timeframe: latest.diskPercent > 90 ? "now" : "60m",
        recommendation: "Disk running low — clear logs, caches, or expand storage",
        currentValue: latest.diskPercent,
        predictedValue: Math.round(diskPredicted60m),
      });
    }

    // Load average
    if (latest.loadAvg1m > 20) {
      predictions.push({
        type: "high_load",
        confidence: 0.85,
        timeframe: "now",
        recommendation: "System load is very high — reduce parallel agent tasks",
        currentValue: latest.loadAvg1m,
      });
    }

    if (predictions.length === 0) {
      predictions.push({
        type: "healthy",
        confidence: 0.99,
        timeframe: "n/a",
        recommendation: "All resource metrics within normal range",
        currentValue: 0,
      });
    }

    return predictions;
  }

  /** Detect anomalies in current metrics using z-score */
  detectAnomalies(): Array<{ metric: string; value: number; zScore: number; isAnomaly: boolean }> {
    if (this.history.length < 10) return [];

    const latest = this.history[this.history.length - 1];
    const metrics: Array<{ name: string; value: number }> = [
      { name: "cpu", value: latest.cpuPercent },
      { name: "memory", value: latest.memoryPercent },
      { name: "disk", value: latest.diskPercent },
      { name: "load", value: latest.loadAvg1m },
    ];

    return metrics.map(({ name, value }) => {
      const h = this.extractMetric(name === "cpu" ? "cpuPercent" : name === "memory" ? "memoryPercent" : name === "disk" ? "diskPercent" : "loadAvg1m");
      const mean = h.values.reduce((a, b) => a + b, 0) / h.values.length;
      const variance = h.values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / h.values.length;
      const stdDev = Math.sqrt(variance);
      const zScore = stdDev > 0 ? Math.abs((value - mean) / stdDev) : 0;

      return { metric: name, value, zScore: Math.round(zScore * 100) / 100, isAnomaly: zScore > this.zScoreThreshold };
    });
  }

  /** Get collected history */
  getHistory(limit?: number): ResourceSnapshot[] {
    return limit ? this.history.slice(-limit) : [...this.history];
  }

  /** Get summary stats */
  getSummary(): {
    samples: number;
    latest: ResourceSnapshot | null;
    predictions: Prediction[];
    anomalies: Array<{ metric: string; value: number; zScore: number; isAnomaly: boolean }>;
  } {
    return {
      samples: this.history.length,
      latest: this.history[this.history.length - 1] || null,
      predictions: this.predict(),
      anomalies: this.detectAnomalies(),
    };
  }

  // ── Internals ──────────────────────────────────────────────

  private extractMetric(key: keyof ResourceSnapshot): MetricHistory {
    return {
      values: this.history.map((s) => s[key] as number),
      timestamps: this.history.map((s) => s.timestamp.getTime()),
    };
  }

  private linearRegression(h: MetricHistory): { slope: number; intercept: number; r2: number; predict: (minutesAhead: number) => number } {
    const n = h.values.length;
    if (n < 2) return { slope: 0, intercept: 0, r2: 0, predict: () => h.values[0] || 0 };

    // Use indices as x (1 unit per sample)
    const xs = Array.from({ length: n }, (_, i) => i);
    const ys = h.values;

    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
    const sumX2 = xs.reduce((s, x) => s + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // R² (coefficient of determination)
    const meanY = sumY / n;
    const ssRes = ys.reduce((s, y, i) => s + (y - (slope * xs[i] + intercept)) ** 2, 0);
    const ssTot = ys.reduce((s, y) => s + (y - meanY) ** 2, 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    return {
      slope,
      intercept,
      r2,
      predict: (minutesAhead: number) => slope * (n - 1 + minutesAhead) + intercept,
    };
  }
}
