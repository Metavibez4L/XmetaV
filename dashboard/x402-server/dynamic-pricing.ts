/**
 * XmetaV Dynamic Pricing Engine
 *
 * Adjusts endpoint prices based on:
 *   1. Demand — call volume in the last hour (surge / quiet multiplier)
 *   2. Time-of-day — UTC peak hours get higher prices
 *   3. Endpoint bundles — combo pricing for frequent callers
 *   4. Token tier discounts — applied on top of dynamic base
 *
 * Runs in-memory within the x402-server process.
 * Midas can read the current pricing via the /pricing endpoint.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ---- Base Prices (static fallback) ----

export const BASE_PRICES: Record<string, number> = {
  "POST /agent-task":      0.10,
  "POST /intent":          0.05,
  "GET /fleet-status":     0.01,
  "POST /swarm":           0.50,
  "POST /memory-crystal":  0.05,
  "POST /neural-swarm":    0.10,
  "POST /fusion-chamber":  0.15,
  "POST /cosmos-explore":  0.20,
  "POST /voice/transcribe": 0.05,
  "POST /voice/synthesize": 0.08,
};

// ---- Demand Tracking ----

interface DemandWindow {
  /** Timestamps of calls in the last hour */
  calls: number[];
}

const demandWindows = new Map<string, DemandWindow>();

/** Rolling window duration: 1 hour */
const DEMAND_WINDOW_MS = 60 * 60 * 1000;

/**
 * Record a call to an endpoint for demand tracking.
 */
export function recordDemand(endpoint: string): void {
  const now = Date.now();
  let window = demandWindows.get(endpoint);
  if (!window) {
    window = { calls: [] };
    demandWindows.set(endpoint, window);
  }
  window.calls.push(now);

  // Prune old entries
  const cutoff = now - DEMAND_WINDOW_MS;
  window.calls = window.calls.filter((t) => t >= cutoff);
}

/**
 * Get calls-per-hour for an endpoint.
 */
function getCallsPerHour(endpoint: string): number {
  const window = demandWindows.get(endpoint);
  if (!window) return 0;
  const cutoff = Date.now() - DEMAND_WINDOW_MS;
  window.calls = window.calls.filter((t) => t >= cutoff);
  return window.calls.length;
}

// ---- Demand Multiplier ----

/**
 * Compute a demand-based price multiplier.
 *
 *   0–5 calls/hr   → 0.8× (quiet discount)
 *   6–20 calls/hr  → 1.0× (normal)
 *   21–50 calls/hr → 1.2× (moderate surge)
 *   51+ calls/hr   → 1.5× (high demand)
 */
function demandMultiplier(callsPerHour: number): number {
  if (callsPerHour <= 5) return 0.8;
  if (callsPerHour <= 20) return 1.0;
  if (callsPerHour <= 50) return 1.2;
  return 1.5;
}

// ---- Time-of-Day Multiplier ----

/**
 * Compute a time-of-day price multiplier (UTC-based).
 *
 *   Peak hours (14:00–22:00 UTC / US business hours) → 1.1×
 *   Off-peak → 0.9×
 */
function timeMultiplier(): number {
  const hour = new Date().getUTCHours();
  if (hour >= 14 && hour < 22) return 1.1; // US business hours
  return 0.9;
}

// ---- Dynamic Price Calculation ----

/**
 * Get the current dynamic price for an endpoint.
 * Returns the dollar amount as a number.
 */
export function getDynamicPrice(endpoint: string): number {
  const base = BASE_PRICES[endpoint];
  if (base === undefined) return 0.01; // Unknown endpoints get minimum price

  const cph = getCallsPerHour(endpoint);
  const dm = demandMultiplier(cph);
  const tm = timeMultiplier();

  // Apply multipliers, round to 4 decimal places
  const price = Math.round(base * dm * tm * 10000) / 10000;

  // Enforce floor (never below 50% of base) and ceiling (never above 3× base)
  return Math.max(base * 0.5, Math.min(base * 3.0, price));
}

/**
 * Get the current dynamic price as a formatted string like "$0.10".
 */
export function getDynamicPriceString(endpoint: string): string {
  return `$${getDynamicPrice(endpoint).toFixed(2)}`;
}

// ---- Endpoint Bundles ----

export interface BundleConfig {
  name: string;
  endpoints: string[];
  /** Discount off sum of individual prices (0–1) */
  discount: number;
  description: string;
}

export const BUNDLES: BundleConfig[] = [
  {
    name: "Research Pack",
    endpoints: ["POST /agent-task", "GET /fleet-status", "POST /intent"],
    discount: 0.20,
    description: "Agent task + fleet status + intent resolution at 20% off",
  },
  {
    name: "Swarm Suite",
    endpoints: ["POST /swarm", "POST /neural-swarm", "POST /fusion-chamber"],
    discount: 0.25,
    description: "Full swarm orchestration bundle at 25% off",
  },
  {
    name: "Memory Explorer",
    endpoints: ["POST /memory-crystal", "POST /cosmos-explore", "POST /fusion-chamber"],
    discount: 0.15,
    description: "Memory cosmos exploration bundle at 15% off",
  },
];

/**
 * Get the bundle price (sum of dynamic prices minus bundle discount).
 */
export function getBundlePrice(bundle: BundleConfig): number {
  const sum = bundle.endpoints.reduce(
    (total, ep) => total + getDynamicPrice(ep),
    0
  );
  return Math.round(sum * (1 - bundle.discount) * 10000) / 10000;
}

// ---- Full Pricing Snapshot ----

export interface PricingSnapshot {
  endpoints: Record<string, {
    base: number;
    current: number;
    callsPerHour: number;
    demandMultiplier: number;
    timeMultiplier: number;
  }>;
  bundles: Array<{
    name: string;
    description: string;
    endpoints: string[];
    individualTotal: number;
    bundlePrice: number;
    savings: string;
  }>;
  timestamp: string;
}

/**
 * Get a full pricing snapshot for the /pricing API.
 */
export function getPricingSnapshot(): PricingSnapshot {
  const tm = timeMultiplier();

  const endpoints: PricingSnapshot["endpoints"] = {};
  for (const [ep, base] of Object.entries(BASE_PRICES)) {
    const cph = getCallsPerHour(ep);
    const dm = demandMultiplier(cph);
    endpoints[ep] = {
      base,
      current: getDynamicPrice(ep),
      callsPerHour: cph,
      demandMultiplier: dm,
      timeMultiplier: tm,
    };
  }

  const bundles = BUNDLES.map((b) => {
    const individualTotal = b.endpoints.reduce(
      (sum, ep) => sum + getDynamicPrice(ep),
      0
    );
    const bundlePrice = getBundlePrice(b);
    return {
      name: b.name,
      description: b.description,
      endpoints: b.endpoints,
      individualTotal: Math.round(individualTotal * 10000) / 10000,
      bundlePrice,
      savings: `${(b.discount * 100).toFixed(0)}%`,
    };
  });

  return {
    endpoints,
    bundles,
    timestamp: new Date().toISOString(),
  };
}

// ---- Persistence (optional — sync to Supabase for Midas) ----

/**
 * Persist the current pricing snapshot to Supabase (called periodically).
 * Midas reads this table for pricing recommendations.
 */
export async function syncPricingToSupabase(supabase: SupabaseClient): Promise<void> {
  try {
    const snapshot = getPricingSnapshot();
    for (const [endpoint, pricing] of Object.entries(snapshot.endpoints)) {
      if (pricing.current !== pricing.base) {
        await supabase.from("pricing_recommendations").upsert(
          {
            endpoint_path: endpoint,
            current_price_usd: pricing.base,
            recommended_price_usd: pricing.current,
            reasoning: `Dynamic: demand=${pricing.demandMultiplier}×, time=${pricing.timeMultiplier}×, calls/hr=${pricing.callsPerHour}`,
            status: "auto-applied",
            created_at: new Date().toISOString(),
          },
          { onConflict: "endpoint_path" }
        );
      }
    }
  } catch (err) {
    console.error("[pricing] Sync failed:", (err as Error).message);
  }
}
