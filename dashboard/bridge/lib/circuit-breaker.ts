/**
 * Circuit Breaker — protects external service calls from cascade failures.
 *
 * States:
 *   CLOSED  → requests flow through normally
 *   OPEN    → requests fail fast (no external call)
 *   HALF    → a single probe request is allowed to test recovery
 *
 * Usage:
 *   const cb = new CircuitBreaker("pinata", { failThreshold: 3 });
 *   const result = await cb.call(() => pinJSON(data));
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening (default: 3) */
  failThreshold?: number;
  /** How long to stay open before probing (ms, default: 30s) */
  resetTimeout?: number;
  /** Optional fallback value when circuit is open */
  fallback?: () => unknown;
  /** Optional label for logging */
  label?: string;
}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures = 0;
  private lastFailure = 0;
  private readonly threshold: number;
  private readonly resetMs: number;
  private readonly label: string;
  private readonly fallbackFn?: () => unknown;

  constructor(label: string, opts: CircuitBreakerOptions = {}) {
    this.label = label;
    this.threshold = opts.failThreshold ?? 3;
    this.resetMs = opts.resetTimeout ?? 30_000;
    this.fallbackFn = opts.fallback;
  }

  get currentState(): CircuitState {
    if (this.state === "OPEN" && Date.now() - this.lastFailure >= this.resetMs) {
      this.state = "HALF_OPEN";
    }
    return this.state;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.currentState;

    if (state === "OPEN") {
      console.warn(`[circuit:${this.label}] OPEN — failing fast`);
      if (this.fallbackFn) return this.fallbackFn() as T;
      throw new Error(`Circuit breaker [${this.label}] is OPEN`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      if (this.fallbackFn) {
        console.warn(`[circuit:${this.label}] Failed, using fallback`);
        return this.fallbackFn() as T;
      }
      throw err;
    }
  }

  private onSuccess() {
    if (this.state === "HALF_OPEN") {
      console.log(`[circuit:${this.label}] Probe succeeded → CLOSED`);
    }
    this.failures = 0;
    this.state = "CLOSED";
  }

  private onFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = "OPEN";
      console.error(
        `[circuit:${this.label}] ${this.failures} consecutive failures → OPEN (reset in ${this.resetMs / 1000}s)`
      );
    }
  }

  /** Force reset (e.g. after manual fix) */
  reset() {
    this.state = "CLOSED";
    this.failures = 0;
    console.log(`[circuit:${this.label}] Manually reset → CLOSED`);
  }
}
