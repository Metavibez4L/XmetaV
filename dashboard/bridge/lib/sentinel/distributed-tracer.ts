/**
 * Sentinel Distributed Tracing — Track requests end-to-end through the fleet.
 *
 * Lightweight tracing inspired by OpenTelemetry but minimal for XmetaV.
 * Traces are stored in memory with optional Supabase persistence for analysis.
 */

import { supabase } from "../supabase.js";

export interface Span {
  spanId: string;
  parentId?: string;
  service: string;
  operation: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: "ok" | "error";
  metadata: Record<string, unknown>;
}

export interface Trace {
  traceId: string;
  rootService: string;
  rootOperation: string;
  spans: Span[];
  startTime: number;
  endTime?: number;
  totalDurationMs?: number;
}

export class DistributedTracer {
  private activeTraces = new Map<string, Trace>();
  private completedTraces: Trace[] = [];
  private readonly maxCompleted: number;
  private readonly persistToDb: boolean;

  constructor(opts: { maxCompleted?: number; persistToDb?: boolean } = {}) {
    this.maxCompleted = opts.maxCompleted ?? 200;
    this.persistToDb = opts.persistToDb ?? true;
  }

  /** Start a new trace */
  startTrace(service: string, operation: string): Trace {
    const traceId = crypto.randomUUID();
    const trace: Trace = {
      traceId,
      rootService: service,
      rootOperation: operation,
      spans: [],
      startTime: Date.now(),
    };
    this.activeTraces.set(traceId, trace);
    return trace;
  }

  /** Start a span within a trace */
  startSpan(
    traceId: string,
    service: string,
    operation: string,
    parentId?: string,
    meta: Record<string, unknown> = {}
  ): Span | null {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return null;

    const span: Span = {
      spanId: crypto.randomUUID(),
      parentId,
      service,
      operation,
      startTime: Date.now(),
      status: "ok",
      metadata: meta,
    };
    trace.spans.push(span);
    return span;
  }

  /** End a span */
  endSpan(span: Span, meta?: Record<string, unknown>): void {
    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;
    if (meta) Object.assign(span.metadata, meta);
  }

  /** Mark a span as errored */
  failSpan(span: Span, error: string, meta?: Record<string, unknown>): void {
    span.status = "error";
    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;
    span.metadata.error = error;
    if (meta) Object.assign(span.metadata, meta);
  }

  /** Complete a trace */
  async endTrace(traceId: string): Promise<Trace | null> {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return null;

    trace.endTime = Date.now();
    trace.totalDurationMs = trace.endTime - trace.startTime;

    this.activeTraces.delete(traceId);
    this.completedTraces.push(trace);
    if (this.completedTraces.length > this.maxCompleted) {
      this.completedTraces = this.completedTraces.slice(-this.maxCompleted);
    }

    // Persist to Supabase (non-blocking)
    if (this.persistToDb) {
      this.persistTrace(trace).catch(() => {});
    }

    return trace;
  }

  /** Get active traces */
  getActive(): Trace[] {
    return Array.from(this.activeTraces.values());
  }

  /** Get completed traces */
  getCompleted(limit = 50): Trace[] {
    return this.completedTraces.slice(-limit);
  }

  /** Find traces by service */
  findByService(service: string, limit = 20): Trace[] {
    return this.completedTraces
      .filter((t) => t.spans.some((s) => s.service === service))
      .slice(-limit);
  }

  /** P95 latency for a service/operation pair */
  getP95(service: string, operation?: string): number {
    const durations = this.completedTraces
      .flatMap((t) =>
        t.spans
          .filter((s) => s.service === service && (!operation || s.operation === operation) && s.durationMs != null)
          .map((s) => s.durationMs!)
      )
      .sort((a, b) => a - b);

    if (durations.length === 0) return 0;
    const idx = Math.ceil(durations.length * 0.95) - 1;
    return durations[idx];
  }

  /** Get throughput (traces/min) over the last N minutes */
  getThroughput(minutesBack = 5): number {
    const cutoff = Date.now() - minutesBack * 60_000;
    const recent = this.completedTraces.filter((t) => t.startTime > cutoff);
    return recent.length / minutesBack;
  }

  /** Get error rate (0-1) over the last N minutes */
  getErrorRate(minutesBack = 5): number {
    const cutoff = Date.now() - minutesBack * 60_000;
    const recent = this.completedTraces.filter((t) => t.startTime > cutoff);
    if (recent.length === 0) return 0;
    const errors = recent.filter((t) => t.spans.some((s) => s.status === "error"));
    return errors.length / recent.length;
  }

  /** Persist a trace to Supabase */
  private async persistTrace(trace: Trace): Promise<void> {
    try {
      await supabase.from("sentinel_traces").insert({
        trace_id: trace.traceId,
        root_service: trace.rootService,
        root_operation: trace.rootOperation,
        spans: trace.spans,
        duration_ms: trace.totalDurationMs,
        has_errors: trace.spans.some((s) => s.status === "error"),
        created_at: new Date(trace.startTime).toISOString(),
      });
    } catch (err) {
      console.error("[sentinel:tracer] Persist failed:", err);
    }
  }
}
