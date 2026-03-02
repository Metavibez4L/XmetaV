/**
 * XmetaV Trade Fee Calculator
 *
 * Dynamic fee engine for trade execution endpoints.
 * Fees scale with trade size (% of capital) rather than flat rates,
 * with XMETAV token holder discounts on top.
 *
 * Revenue capture model:
 *   - % of trade/portfolio size (variable, min floor)
 *   - Performance-based for arb (% of profit)
 *   - Flat fee + % hybrid for deploy/rebalance
 *   - Whale discounts: lower % but higher absolute
 */

/* ── Fee Schedule ────────────────────────────────────────────── */

export interface FeeSchedule {
  baseFeeUsd: number;       // Flat minimum fee
  percentOfValue: number;   // % of trade/portfolio value
  minFeeUsd: number;        // Absolute floor
  maxFeeUsd: number;        // Absolute cap (0 = uncapped)
  whaleTiers: WhaleTier[];  // Volume-based % reductions
}

export interface WhaleTier {
  minValueUsd: number;
  percentOfValue: number;   // Overrides base % for this bracket
  label: string;
}

export interface FeeResult {
  feeUsd: number;
  effectivePercent: number;
  tier: string;
  breakdown: {
    baseFee: number;
    percentFee: number;
    totalBeforeDiscount: number;
    tokenDiscount: number;
    finalFee: number;
  };
}

/* ── Endpoint Fee Schedules ──────────────────────────────────── */

export const TRADE_FEE_SCHEDULES: Record<string, FeeSchedule> = {
  "/execute-trade": {
    baseFeeUsd: 0,
    percentOfValue: 0.005,     // 0.5% default
    minFeeUsd: 0.50,
    maxFeeUsd: 0,              // uncapped
    whaleTiers: [
      { minValueUsd: 10_000,  percentOfValue: 0.004,  label: "Whale ($10K+)" },
      { minValueUsd: 50_000,  percentOfValue: 0.003,  label: "Mega-Whale ($50K+)" },
      { minValueUsd: 100_000, percentOfValue: 0.002,  label: "Institution ($100K+)" },
    ],
  },

  "/rebalance-portfolio": {
    baseFeeUsd: 2.00,
    percentOfValue: 0.003,     // 0.3% of portfolio
    minFeeUsd: 2.00,
    maxFeeUsd: 500,
    whaleTiers: [
      { minValueUsd: 50_000,  percentOfValue: 0.002,  label: "Large Portfolio ($50K+)" },
      { minValueUsd: 200_000, percentOfValue: 0.001,  label: "Institutional ($200K+)" },
    ],
  },

  "/arb-opportunity": {
    baseFeeUsd: 0.25,
    percentOfValue: 0,         // flat fee only for scans
    minFeeUsd: 0.25,
    maxFeeUsd: 0.25,
    whaleTiers: [],
  },

  "/execute-arb": {
    baseFeeUsd: 0,
    percentOfValue: 0.01,      // 1% of profit captured
    minFeeUsd: 0.10,
    maxFeeUsd: 0,              // uncapped — performance-based
    whaleTiers: [
      { minValueUsd: 1_000,  percentOfValue: 0.008,  label: "Whale Arb ($1K+ profit)" },
      { minValueUsd: 10_000, percentOfValue: 0.005,  label: "Mega Arb ($10K+ profit)" },
    ],
  },

  "/yield-optimize": {
    baseFeeUsd: 0.50,
    percentOfValue: 0,         // flat fee for queries
    minFeeUsd: 0.50,
    maxFeeUsd: 0.50,
    whaleTiers: [],
  },

  "/deploy-yield-strategy": {
    baseFeeUsd: 3.00,
    percentOfValue: 0.005,     // 0.5% of deployed capital
    minFeeUsd: 3.00,
    maxFeeUsd: 1000,
    whaleTiers: [
      { minValueUsd: 50_000,  percentOfValue: 0.004,  label: "Large Deploy ($50K+)" },
      { minValueUsd: 200_000, percentOfValue: 0.003,  label: "Institutional ($200K+)" },
      { minValueUsd: 500_000, percentOfValue: 0.002,  label: "Fund-Scale ($500K+)" },
    ],
  },
};

/* ── Fee Calculator ──────────────────────────────────────────── */

/**
 * Calculate the fee for a given endpoint and trade value.
 *
 * @param endpoint    - Route path (e.g. "/execute-trade")
 * @param valueUsd    - Trade size / portfolio value / profit amount
 * @param tokenDiscount - XMETAV token tier discount (0.0 – 0.75)
 */
export function calculateTradeFee(
  endpoint: string,
  valueUsd: number,
  tokenDiscount: number = 0
): FeeResult {
  const schedule = TRADE_FEE_SCHEDULES[endpoint];
  if (!schedule) {
    return {
      feeUsd: 0,
      effectivePercent: 0,
      tier: "unknown",
      breakdown: { baseFee: 0, percentFee: 0, totalBeforeDiscount: 0, tokenDiscount: 0, finalFee: 0 },
    };
  }

  // Determine which whale tier applies
  let effectivePercent = schedule.percentOfValue;
  let tier = "Standard";

  for (const wt of schedule.whaleTiers) {
    if (valueUsd >= wt.minValueUsd) {
      effectivePercent = wt.percentOfValue;
      tier = wt.label;
    }
  }

  // Calculate components
  const baseFee = schedule.baseFeeUsd;
  const percentFee = valueUsd * effectivePercent;
  let totalBeforeDiscount = baseFee + percentFee;

  // Apply min/max
  if (totalBeforeDiscount < schedule.minFeeUsd) {
    totalBeforeDiscount = schedule.minFeeUsd;
  }
  if (schedule.maxFeeUsd > 0 && totalBeforeDiscount > schedule.maxFeeUsd) {
    totalBeforeDiscount = schedule.maxFeeUsd;
  }

  // Apply XMETAV token discount
  const discountAmount = totalBeforeDiscount * tokenDiscount;
  const finalFee = Math.max(schedule.minFeeUsd * (1 - tokenDiscount), totalBeforeDiscount - discountAmount);

  return {
    feeUsd: Math.round(finalFee * 1e6) / 1e6,
    effectivePercent: effectivePercent * 100,
    tier,
    breakdown: {
      baseFee: Math.round(baseFee * 1e6) / 1e6,
      percentFee: Math.round(percentFee * 1e6) / 1e6,
      totalBeforeDiscount: Math.round(totalBeforeDiscount * 1e6) / 1e6,
      tokenDiscount: Math.round(discountAmount * 1e6) / 1e6,
      finalFee: Math.round(finalFee * 1e6) / 1e6,
    },
  };
}

/* ── Revenue Projection ──────────────────────────────────────── */

export interface RevenueProjection {
  endpoint: string;
  callsPerMonth: number;
  avgValueUsd: number;
  avgFeeUsd: number;
  monthlyRevenue: number;
  yearlyRevenue: number;
}

/**
 * Project revenue for all trade endpoints given estimated monthly volumes.
 */
export function projectTradeRevenue(
  assumptions: Array<{ endpoint: string; callsPerMonth: number; avgValueUsd: number }>
): { projections: RevenueProjection[]; totalMonthly: number; totalYearly: number } {
  const projections: RevenueProjection[] = assumptions.map(({ endpoint, callsPerMonth, avgValueUsd }) => {
    const fee = calculateTradeFee(endpoint, avgValueUsd);
    const monthlyRevenue = fee.feeUsd * callsPerMonth;
    return {
      endpoint,
      callsPerMonth,
      avgValueUsd,
      avgFeeUsd: fee.feeUsd,
      monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
      yearlyRevenue: Math.round(monthlyRevenue * 12 * 100) / 100,
    };
  });

  const totalMonthly = projections.reduce((s, p) => s + p.monthlyRevenue, 0);
  return {
    projections,
    totalMonthly: Math.round(totalMonthly * 100) / 100,
    totalYearly: Math.round(totalMonthly * 12 * 100) / 100,
  };
}
