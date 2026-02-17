/**
 * x402 Payment → Agent Memory Pipeline
 *
 * Converts payment events into shared agent memories so Oracle, Midas,
 * Alchemist, and other agents can study payment patterns, revenue
 * milestones, and usage trends during their dispatch context injection.
 *
 * Memory flow:
 *   x402 payment settled → writePaymentMemory() → agent_memory (_shared)
 *   Periodic digest       → generatePaymentDigest() → agent_memory (midas, oracle, alchemist)
 *   Revenue milestones    → writeRevenueMilestone() → agent_memory (_shared, permanent)
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

// ── In-memory counters for session-level tracking ──
interface SessionStats {
  totalPayments: number;
  totalRevenueUsd: number;
  endpointCounts: Record<string, number>;
  endpointRevenue: Record<string, number>;
  uniquePayers: Set<string>;
  sessionStart: Date;
  lastMilestoneRevenue: number;
  firstPaymentLogged: boolean;
}

const session: SessionStats = {
  totalPayments: 0,
  totalRevenueUsd: 0,
  endpointCounts: {},
  endpointRevenue: {},
  uniquePayers: new Set(),
  sessionStart: new Date(),
  lastMilestoneRevenue: 0,
  firstPaymentLogged: false,
};

// Revenue milestone thresholds (in USD)
const MILESTONES = [0.01, 0.10, 0.50, 1.00, 5.00, 10.00, 50.00, 100.00, 500.00, 1000.00];

/**
 * Write a memory entry. Uses agent_memory table directly.
 */
async function writeMemory(
  agentId: string,
  kind: string,
  content: string,
  source: string,
  ttlHours: number | null = null
): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("agent_memory")
      .insert({
        agent_id: agentId,
        kind,
        content,
        source,
        ttl_hours: ttlHours,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[x402→memory] Write failed:", error.message);
      return null;
    }
    return data?.id ?? null;
  } catch {
    return null;
  }
}

// ── Payment Event Memory ──────────────────────────────────────

/**
 * Called after every successful x402 payment. Writes a shared memory
 * so all agents see payment activity in their context window.
 *
 * Selective — only writes memory for:
 *  - First-ever payment (milestone)
 *  - Revenue milestone crossings ($0.10, $1, $10, etc.)
 *  - New unique payer
 *  - New endpoint first use
 *  - Every Nth payment (batch summary every 10 payments)
 */
export function recordPaymentEvent(
  endpoint: string,
  amount: string,
  payerAddress?: string,
  agentId?: string
): void {
  const numAmount = parseFloat(amount.replace("$", ""));

  // Update session counters
  session.totalPayments++;
  session.totalRevenueUsd += numAmount;
  session.endpointCounts[endpoint] = (session.endpointCounts[endpoint] || 0) + 1;
  session.endpointRevenue[endpoint] = (session.endpointRevenue[endpoint] || 0) + numAmount;
  if (payerAddress) session.uniquePayers.add(payerAddress.toLowerCase());

  // ── First-ever payment ──
  if (!session.firstPaymentLogged) {
    session.firstPaymentLogged = true;
    writeMemory(
      "_shared",
      "fact",
      `[x402 MILESTONE] First x402 payment received! Endpoint: ${endpoint}, Amount: ${amount} USDC, Payer: ${payerAddress || "unknown"}. The x402 payment gateway is LIVE on Base Mainnet.`,
      "x402-server",
      null // permanent
    );
    console.log("[x402→memory] First payment milestone recorded");
  }

  // ── New endpoint first use ──
  if (session.endpointCounts[endpoint] === 1 && session.totalPayments > 1) {
    writeMemory(
      "_shared",
      "observation",
      `[x402] New endpoint activated: ${endpoint} — first paid request at ${amount} USDC.`,
      "x402-server",
      168 // 7 days
    );
  }

  // ── New unique payer ──
  if (payerAddress && session.uniquePayers.size > 1) {
    const count = session.uniquePayers.size;
    // Only log on specific count milestones to avoid spam
    if ([2, 5, 10, 25, 50, 100, 250, 500, 1000].includes(count)) {
      writeMemory(
        "_shared",
        "fact",
        `[x402] Payer milestone: ${count} unique wallets have now paid for XmetaV API access via x402.`,
        "x402-server",
        null // permanent
      );
    }
  }

  // ── Revenue milestones ──
  for (const milestone of MILESTONES) {
    if (
      session.totalRevenueUsd >= milestone &&
      session.lastMilestoneRevenue < milestone
    ) {
      session.lastMilestoneRevenue = milestone;
      writeMemory(
        "_shared",
        "fact",
        `[x402 MILESTONE] Session revenue crossed $${milestone.toFixed(2)} USDC! ` +
          `Total: $${session.totalRevenueUsd.toFixed(4)} from ${session.totalPayments} payments, ` +
          `${session.uniquePayers.size} unique payers. ` +
          `Top endpoint: ${getTopEndpoint()}.`,
        "x402-server",
        null // permanent
      );
      console.log(`[x402→memory] Revenue milestone: $${milestone.toFixed(2)}`);
    }
  }

  // ── Batch summary every 10 payments ──
  if (session.totalPayments % 10 === 0) {
    writeBatchSummary();
  }
}

function getTopEndpoint(): string {
  const entries = Object.entries(session.endpointRevenue);
  if (entries.length === 0) return "none";
  entries.sort((a, b) => b[1] - a[1]);
  return `${entries[0][0]} ($${entries[0][1].toFixed(4)})`;
}

/**
 * Write a batch summary every N payments — gives agents a periodic pulse
 * of payment activity without flooding memory.
 */
function writeBatchSummary(): void {
  const uptime = Math.round(
    (Date.now() - session.sessionStart.getTime()) / 60000
  );
  const endpointBreakdown = Object.entries(session.endpointCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([ep, count]) => `${ep}:${count}`)
    .join(", ");

  writeMemory(
    "_shared",
    "observation",
    `[x402 PULSE] ${session.totalPayments} total payments ($${session.totalRevenueUsd.toFixed(4)} USDC) ` +
      `over ${uptime}min. ` +
      `${session.uniquePayers.size} unique payers. ` +
      `Breakdown: ${endpointBreakdown}.`,
    "x402-server",
    48 // 2 days — recent enough for context, auto-expires
  );
}

// ── Revenue Digest for Specific Agents ────────────────────────

/**
 * Generate and write a comprehensive payment digest to targeted agent memories.
 * Called on a schedule (e.g., hourly) or on-demand.
 *
 * Writes tailored insights to:
 *  - midas: revenue metrics, endpoint economics, pricing signals
 *  - oracle: on-chain payment flow analysis, wallet behavior
 *  - alchemist: token velocity, holder payment correlation
 */
export async function generatePaymentDigest(): Promise<void> {
  if (!supabase) return;

  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 3600000).toISOString();
  const last7d = new Date(now.getTime() - 7 * 86400000).toISOString();

  // Fetch recent payments
  const { data: payments } = await supabase
    .from("x402_payments")
    .select("endpoint, amount, payer_address, agent_id, status, created_at, network")
    .in("status", ["settled", "completed"])
    .gte("created_at", last7d)
    .order("created_at", { ascending: false });

  const allPayments = payments || [];
  if (allPayments.length === 0) return;

  // Helper: parse amount strings like "$0.10" or "0.10"
  const parseAmount = (amt: string | null | undefined): number => {
    if (!amt) return 0;
    return parseFloat(amt.replace(/[$,]/g, "")) || 0;
  };

  const last24hPayments = allPayments.filter((p) => p.created_at >= last24h);

  // ── Aggregate metrics ──
  const totalRevenue7d = allPayments.reduce(
    (s, p) => s + parseAmount(p.amount),
    0
  );
  const totalRevenue24h = last24hPayments.reduce(
    (s, p) => s + parseAmount(p.amount),
    0
  );
  const uniquePayers7d = new Set(
    allPayments.map((p) => p.payer_address).filter(Boolean)
  ).size;
  const uniquePayers24h = new Set(
    last24hPayments.map((p) => p.payer_address).filter(Boolean)
  ).size;

  // Endpoint breakdown
  const epRevenue: Record<string, { count: number; revenue: number }> = {};
  for (const p of allPayments) {
    const ep = p.endpoint || "unknown";
    if (!epRevenue[ep]) epRevenue[ep] = { count: 0, revenue: 0 };
    epRevenue[ep].count++;
    epRevenue[ep].revenue += parseAmount(p.amount);
  }
  const epSorted = Object.entries(epRevenue).sort(
    (a, b) => b[1].revenue - a[1].revenue
  );

  // Daily revenue trend (last 7 days)
  const dailyRevenue: Record<string, number> = {};
  for (const p of allPayments) {
    const day = p.created_at.slice(0, 10);
    dailyRevenue[day] = (dailyRevenue[day] || 0) + parseAmount(p.amount);
  }
  const dailyTrend = Object.entries(dailyRevenue)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, rev]) => `${day}: $${rev.toFixed(4)}`)
    .join(" | ");

  const avgDailyRevenue =
    totalRevenue7d / Math.max(Object.keys(dailyRevenue).length, 1);
  const projectedMonthly = avgDailyRevenue * 30;
  const projectedYearly = avgDailyRevenue * 365;

  // ── MIDAS digest: revenue, endpoints, pricing signals ──
  const midasDigest =
    `[x402 DIGEST] 7d Revenue: $${totalRevenue7d.toFixed(4)} USDC (${allPayments.length} payments, ${uniquePayers7d} payers). ` +
    `24h: $${totalRevenue24h.toFixed(4)} (${last24hPayments.length} payments, ${uniquePayers24h} payers). ` +
    `Daily trend: ${dailyTrend}. ` +
    `Projections: $${projectedMonthly.toFixed(2)}/mo, $${projectedYearly.toFixed(2)}/yr. ` +
    `Top endpoints: ${epSorted
      .slice(0, 5)
      .map(([ep, d]) => `${ep} (${d.count} calls, $${d.revenue.toFixed(4)})`)
      .join("; ")}. ` +
    `Avg daily: $${avgDailyRevenue.toFixed(4)}.`;

  await writeMemory("midas", "observation", midasDigest, "x402-digest", 48);

  // ── ORACLE digest: on-chain flow, wallet activity ──
  const payerFrequency: Record<string, number> = {};
  for (const p of allPayments) {
    if (p.payer_address) {
      payerFrequency[p.payer_address] =
        (payerFrequency[p.payer_address] || 0) + 1;
    }
  }
  const topPayers = Object.entries(payerFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const repeatPayers = Object.values(payerFrequency).filter((c) => c > 1).length;

  const oracleDigest =
    `[x402 CHAIN INTEL] ${allPayments.length} x402 payments on Base (eip155:8453) in 7d. ` +
    `${uniquePayers7d} unique payer wallets. ${repeatPayers} repeat payers. ` +
    `USDC flow: $${totalRevenue7d.toFixed(4)} total via EIP-3009 transferWithAuthorization. ` +
    `Top payers: ${topPayers
      .map(([addr, count]) => `${addr.slice(0, 8)}...${addr.slice(-4)} (${count}x)`)
      .join(", ")}. ` +
    `Network: Base Mainnet. Asset: USDC (0x8335...2913).`;

  await writeMemory("oracle", "observation", oracleDigest, "x402-digest", 48);

  // ── ALCHEMIST digest: token velocity correlation ──
  // Check if any payers hold $XMETAV (would show token utility correlation)
  const payerAddresses = [...new Set(allPayments.map((p) => p.payer_address).filter(Boolean))];
  const alchemistDigest =
    `[x402 TOKENOMICS] x402 API generated $${totalRevenue7d.toFixed(4)} USDC (7d), $${projectedMonthly.toFixed(2)} projected monthly. ` +
    `${payerAddresses.length} unique API consumers. ` +
    `Endpoint demand distribution: ${epSorted
      .map(([ep, d]) => `${ep}=${((d.revenue / totalRevenue7d) * 100).toFixed(1)}%`)
      .join(", ")}. ` +
    `This revenue stream adds token utility — $XMETAV holders get tier discounts (10%-75% off). ` +
    `Revenue can fund buybacks, LP incentives, or staking rewards. ` +
    `Daily avg: $${avgDailyRevenue.toFixed(4)}. Projected APR contribution to stakers: ${
      projectedYearly > 0 ? `~$${projectedYearly.toFixed(2)}/yr` : "pending data"
    }.`;

  await writeMemory("alchemist", "observation", alchemistDigest, "x402-digest", 48);

  // ── Shared summary for all agents ──
  const sharedSummary =
    `[x402 WEEKLY] XmetaV x402 API: $${totalRevenue7d.toFixed(4)} revenue (7d), ` +
    `${allPayments.length} total payments from ${uniquePayers7d} wallets. ` +
    `Busiest endpoint: ${epSorted[0]?.[0] || "none"}. ` +
    `Projection: $${projectedMonthly.toFixed(2)}/mo.`;

  await writeMemory("_shared", "fact", sharedSummary, "x402-digest", 168); // 7 days

  console.log(
    `[x402→memory] Digest written — midas/oracle/alchemist/shared. ` +
      `7d: $${totalRevenue7d.toFixed(4)}, ${allPayments.length} payments`
  );
}

// ── Session Summary (written on graceful shutdown) ────────────

/**
 * Write final session summary to memory. Call on SIGTERM/SIGINT.
 */
export async function writeSessionSummary(): Promise<void> {
  if (session.totalPayments === 0) return;

  const uptimeMin = Math.round(
    (Date.now() - session.sessionStart.getTime()) / 60000
  );

  const endpointBreakdown = Object.entries(session.endpointCounts)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([ep, count]) =>
        `${ep}: ${count} calls ($${(session.endpointRevenue[ep] || 0).toFixed(4)})`
    )
    .join("; ");

  const summary =
    `[x402 SESSION END] Server ran for ${uptimeMin}min. ` +
    `${session.totalPayments} payments totaling $${session.totalRevenueUsd.toFixed(4)} USDC. ` +
    `${session.uniquePayers.size} unique payers. ` +
    `Endpoints: ${endpointBreakdown}.`;

  await writeMemory("_shared", "fact", summary, "x402-server", 168); // 7 days

  // Write targeted session insight for Midas
  if (session.totalPayments >= 3) {
    const ratePerHour =
      session.totalRevenueUsd / Math.max(uptimeMin / 60, 0.1);
    await writeMemory(
      "midas",
      "observation",
      `[x402 SESSION METRICS] Revenue rate: $${ratePerHour.toFixed(4)}/hr. ` +
        `Avg payment: $${(session.totalRevenueUsd / session.totalPayments).toFixed(4)}. ` +
        `Payer retention: ${session.uniquePayers.size} unique / ${session.totalPayments} total = ` +
        `${((session.uniquePayers.size / session.totalPayments) * 100).toFixed(1)}% unique rate. ` +
        `${session.totalPayments >= 10 ? "Scaling well." : "Early traction."}`,
      "x402-server",
      72
    );
  }

  console.log(
    `[x402→memory] Session summary written: ${session.totalPayments} payments, $${session.totalRevenueUsd.toFixed(4)}`
  );
}

// ── Digest Scheduler ──────────────────────────────────────────

let digestInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic digest writer. Default: every 60 minutes.
 */
export function startDigestScheduler(intervalMs = 60 * 60 * 1000): void {
  if (digestInterval) return;
  // Run first digest after 5 minutes (let some data accumulate)
  setTimeout(() => {
    generatePaymentDigest().catch(() => {});
  }, 5 * 60 * 1000);
  // Then every intervalMs
  digestInterval = setInterval(() => {
    generatePaymentDigest().catch(() => {});
  }, intervalMs);
  console.log(
    `[x402→memory] Digest scheduler started (every ${intervalMs / 60000}min)`
  );
}

/**
 * Stop the digest scheduler.
 */
export function stopDigestScheduler(): void {
  if (digestInterval) {
    clearInterval(digestInterval);
    digestInterval = null;
  }
}
