import "dotenv/config";
import express from "express";
import compression from "compression";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { facilitator as cdpFacilitator } from "@coinbase/x402";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import {
  recordPaymentEvent,
  generatePaymentDigest,
  writeSessionSummary,
  startDigestScheduler,
  stopDigestScheduler,
} from "./payment-memory.js";
import { createTradeRouter, TRADE_FEE_SCHEDULES } from "./trade-routes.js";
import { createAlphaFeedsRouter, ALPHA_FEE_SCHEDULES } from "./alpha-feeds.js";

// ── TTL Cache for expensive lookups ──────────────────────────
interface CacheEntry<T> { value: T; expiresAt: number; }
class SimpleCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  constructor(private ttlMs: number) {}
  async getOrFetch(key: string, fn: () => Promise<T>, ttl?: number): Promise<T> {
    const e = this.store.get(key);
    if (e && Date.now() < e.expiresAt) return e.value;
    const v = await fn();
    this.store.set(key, { value: v, expiresAt: Date.now() + (ttl ?? this.ttlMs) });
    return v;
  }
  invalidate(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
}

// Cache: token tier lookups (60s TTL — balance rarely changes)
const tierCache = new SimpleCache<{ name: string; minBalance: number; discount: number; dailyLimit: number; color: string }>(60_000);
// Cache: ERC-8004 identity resolution (5min TTL — on-chain identity is stable)
const identityCache = new SimpleCache<{ agentId: string; owner: string; wallet: string; tokenURI: string; x402Enabled?: boolean } | null>(300_000);
// Cache: fleet-status (30s TTL — acceptable staleness)
const fleetCache = new SimpleCache<unknown>(30_000);

// ============================================================
// XmetaV x402 Payment-Gated API
// Pay-per-use access to the XmetaV agent orchestration platform
// ============================================================

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
const port = parseInt(process.env.PORT || "4021", 10);
const network = (process.env.NETWORK || "eip155:8453") as `${string}:${string}`; // Base Mainnet default

if (!evmAddress) {
  console.error("EVM_ADDRESS environment variable is required");
  process.exit(1);
}

// Supabase for real data (optional — falls back to static responses)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

// Facilitator: use @coinbase/x402 CDP facilitator (mainnet) or custom URL
const facilitatorUrl = process.env.FACILITATOR_URL;
const facilitatorClient = facilitatorUrl
  ? new HTTPFacilitatorClient({ url: facilitatorUrl })
  : new HTTPFacilitatorClient(cdpFacilitator);

// OpenAI for voice endpoints (optional — voice endpoints disabled if no key)
const openaiKey = process.env.OPENAI_API_KEY;
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

// ---- $XMETAV Token Tier System ----
// Holding XMETAV tokens grants tiered discounts on gated endpoints

const XMETAV_TOKEN_ADDRESS = process.env.XMETAV_TOKEN_ADDRESS as `0x${string}` | undefined;

const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

interface TokenTier {
  name: string;
  minBalance: number;
  discount: number;
  dailyLimit: number;
  color: string;
}

const TIERS: TokenTier[] = [
  { name: "None",      minBalance: 0,           discount: 0,    dailyLimit: 5,    color: "#4a6a8a" },
  { name: "Starter",   minBalance: 100,         discount: 0.10, dailyLimit: 25,   color: "#a3e635" },
  { name: "Bronze",    minBalance: 1_000,       discount: 0.15, dailyLimit: 50,   color: "#cd7f32" },
  { name: "Silver",    minBalance: 10_000,      discount: 0.25, dailyLimit: 200,  color: "#c0c0c0" },
  { name: "Gold",      minBalance: 100_000,     discount: 0.50, dailyLimit: 1000, color: "#ffd700" },
  { name: "Diamond",   minBalance: 1_000_000,   discount: 0.75, dailyLimit: 5000, color: "#b9f2ff" },
];

function getTier(balance: number): TokenTier {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (balance >= TIERS[i].minBalance) return TIERS[i];
  }
  return TIERS[0];
}

const viemClient = XMETAV_TOKEN_ADDRESS
  ? createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/bHdHyC4tCZcSjdNYDPRQs") })
  : null;

async function getCallerTier(callerAddress?: string): Promise<TokenTier> {
  if (!viemClient || !XMETAV_TOKEN_ADDRESS || !callerAddress) return TIERS[0];
  return tierCache.getOrFetch(`tier:${callerAddress}`, async () => {
    try {
      const raw = await viemClient.readContract({
        address: XMETAV_TOKEN_ADDRESS,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [callerAddress as `0x${string}`],
      });
      const balance = Number(raw / BigInt(10 ** 18));
      return getTier(balance);
    } catch {
      return TIERS[0];
    }
  });
}

const app = express();
app.use(compression());  // gzip — ~60% bandwidth reduction
app.use(express.json());

// ---- Payment logging helper ----
async function logPayment(endpoint: string, amount: string, req: express.Request) {
  if (!supabase) return;
  try {
    const callerAddress = req.headers["x-caller-address"] as string | undefined;
    const callerAgent = (req as any).callerAgent as {
      agentId: string; owner: string; wallet: string; x402Enabled?: boolean;
    } | undefined;
    const row: Record<string, unknown> = {
      endpoint,
      amount,
      agent_id: callerAgent?.agentId || "external",
      payer_address: callerAddress || callerAgent?.wallet || null,
      payee_address: evmAddress,
      network,
      status: "settled",
    };
    const metaPayload = callerAgent
      ? { callerAgentId: callerAgent.agentId, callerOwner: callerAgent.owner, x402Enabled: callerAgent.x402Enabled }
      : null;
    await supabase.from("x402_payments").insert({ ...row, metadata: metaPayload });
    // ---- Midas endpoint_analytics tracking ----
    trackEndpointAnalytics(endpoint, amount, callerAddress);

    // ---- A/B pricing experiment tracking ----
    const numAmt = parseFloat(amount.replace("$", ""));
    // Randomly assign variant (50/50 split); "control" uses current price
    const variant = Math.random() < 0.5 ? "control" : "premium";
    trackABExperiment(endpoint, variant, true, numAmt);

    // ---- Payment → Agent Memory pipeline ----
    recordPaymentEvent(endpoint, amount, callerAddress || callerAgent?.wallet, callerAgent?.agentId);
  } catch { /* best effort */ }
}

// ---- Midas per-endpoint revenue tracking ----
async function trackEndpointAnalytics(endpoint: string, amount: string, _callerAddress?: string) {
  if (!supabase) return;
  try {
    const numericAmount = parseFloat(amount.replace("$", ""));
    // Upsert: increment total_calls and revenue for this endpoint
    const { data: existing } = await supabase
      .from("endpoint_analytics")
      .select("id, total_calls, paid_calls, avg_payment_usd, revenue_7d, revenue_30d")
      .eq("endpoint_path", endpoint)
      .maybeSingle();
    if (existing) {
      const newTotal = (existing.total_calls || 0) + 1;
      const newPaid = (existing.paid_calls || 0) + 1;
      const newRevenue7d = parseFloat(existing.revenue_7d || "0") + numericAmount;
      const newRevenue30d = parseFloat(existing.revenue_30d || "0") + numericAmount;
      await supabase.from("endpoint_analytics").update({
        total_calls: newTotal,
        paid_calls: newPaid,
        avg_payment_usd: newRevenue30d / newPaid,
        revenue_7d: newRevenue7d,
        revenue_30d: newRevenue30d,
        last_called_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await supabase.from("endpoint_analytics").insert({
        endpoint_path: endpoint,
        total_calls: 1,
        paid_calls: 1,
        free_calls: 0,
        conversion_rate: 100,
        avg_payment_usd: numericAmount,
        revenue_7d: numericAmount,
        revenue_30d: numericAmount,
        growth_trend: "up",
        last_called_at: new Date().toISOString(),
      });
    }
  } catch { /* best-effort analytics */ }
}

// ---- A/B Pricing Experiment Tracking ----
async function trackABExperiment(endpoint: string, variant: string, converted: boolean, amount: number) {
  if (!supabase) return;
  try {
    const { data: exp } = await supabase
      .from("pricing_experiments")
      .select("id, impressions, conversions, revenue_usd")
      .eq("endpoint_path", endpoint)
      .eq("variant_name", variant)
      .eq("is_active", true)
      .maybeSingle();
    if (exp) {
      const newImpressions = (exp.impressions || 0) + 1;
      const newConversions = (exp.conversions || 0) + (converted ? 1 : 0);
      const newRevenue = parseFloat(exp.revenue_usd || "0") + (converted ? amount : 0);
      await supabase.from("pricing_experiments").update({
        impressions: newImpressions,
        conversions: newConversions,
        revenue_usd: newRevenue,
        conversion_rate: newImpressions > 0 ? (newConversions / newImpressions) * 100 : 0,
        avg_revenue_per_impression: newImpressions > 0 ? newRevenue / newImpressions : 0,
      }).eq("id", exp.id);
    }
  } catch { /* best-effort */ }
}

// ---- Swarm Spawn Billing ----
async function billSwarmSpawns(swarmId: string, agents: string[], payerAddress?: string) {
  if (!supabase) return;
  const SPAWN_PRICE = 0.02; // $0.02 per sub-agent spawn
  try {
    const rows = agents.map(agent => ({
      swarm_id: swarmId,
      agent_id: agent,
      spawn_price_usd: SPAWN_PRICE,
      status: "billed",
      payer_address: payerAddress || null,
    }));
    await supabase.from("swarm_spawn_billing").insert(rows);
    // Track total spawn revenue in endpoint analytics
    trackEndpointAnalytics("/swarm/spawns", `$${(SPAWN_PRICE * agents.length).toFixed(2)}`);
  } catch { /* best-effort */ }
}

// ---- Token tier middleware: adds X-Token-Tier and X-Token-Discount headers ----
if (XMETAV_TOKEN_ADDRESS) {
  app.use(async (req, res, next) => {
    // Extract caller address from x-caller header or payment metadata
    const caller = req.headers["x-caller-address"] as string | undefined;
    if (caller) {
      const tier = await getCallerTier(caller);
      res.setHeader("X-Token-Tier", tier.name);
      res.setHeader("X-Token-Discount", `${(tier.discount * 100).toFixed(0)}%`);
    }
    next();
  });
}

// ---- ERC-8004 Identity Resolution Middleware ----
// Resolves calling agent's on-chain identity from X-Agent-Id header
const ERC8004_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;
const ERC8004_ABI = [
  { name: "ownerOf", type: "function", stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "address" }] },
  { name: "tokenURI", type: "function", stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "string" }] },
  { name: "getAgentWallet", type: "function", stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ name: "", type: "address" }] },
] as const;

const erc8004Client = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/bHdHyC4tCZcSjdNYDPRQs"),
});

// Extend Express Request to carry resolved agent identity
declare global {
  namespace Express {
    interface Request {
      callerAgent?: {
        agentId: string;
        owner: string;
        wallet: string;
        tokenURI: string;
        x402Enabled?: boolean;
      };
    }
  }
}

app.use(async (req, _res, next) => {
  const agentIdHeader = req.headers["x-agent-id"] as string | undefined;
  if (!agentIdHeader) return next();

  // Cached ERC-8004 resolution — avoids 3 RPC calls per request
  const resolved = await identityCache.getOrFetch(`agent:${agentIdHeader}`, async () => {
    try {
      const agentId = BigInt(agentIdHeader);
      const [owner, uri, wallet] = await Promise.all([
        erc8004Client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "ownerOf", args: [agentId] }),
        erc8004Client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "tokenURI", args: [agentId] }),
        erc8004Client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "getAgentWallet", args: [agentId] }),
      ]);
      let x402Enabled = false;
      if (uri) {
        try {
          const meta = await fetch(uri).then(r => r.json());
          x402Enabled = meta?.x402Support?.enabled === true;
        } catch { /* metadata fetch optional */ }
      }
      return {
        agentId: agentId.toString(),
        owner: owner as string,
        wallet: wallet as string,
        tokenURI: uri as string,
        x402Enabled,
      };
    } catch {
      return null;
    }
  });

  if (resolved) {
    req.callerAgent = resolved;
    console.log(`[ERC-8004] Resolved caller agent #${agentIdHeader} — owner: ${resolved.owner}, x402: ${resolved.x402Enabled}`);
  } else {
    console.log(`[ERC-8004] Agent #${agentIdHeader} not found in registry, proceeding without identity`);
  }
  next();
});

// ---- x402 Payment Middleware ----
// Gates XmetaV platform endpoints with USDC micro-payments on Base
// PRICING: Cost + margin for profitability

app.use(
  paymentMiddleware(
    {
      "POST /agent-task": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.10",  // Was $0.01 — 10x for agent execution value
            network,
            payTo: evmAddress,
          },
        ],
        description: "Dispatch a task to an XmetaV agent",
        mimeType: "application/json",
      },
      "POST /intent": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.05",  // Was $0.005 — 10x for intent resolution value
            network,
            payTo: evmAddress,
          },
        ],
        description: "Resolve a goal into executable agent commands",
        mimeType: "application/json",
      },
      "GET /fleet-status": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.01",  // Was $0.001 — 10x minimum viable
            network,
            payTo: evmAddress,
          },
        ],
        description: "Live status of all agents in the XmetaV fleet",
        mimeType: "application/json",
      },
      "POST /swarm": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.50",  // Was $0.02 — 25x for multi-agent orchestration
            network,
            payTo: evmAddress,
          },
        ],
        description: "Launch a multi-agent swarm orchestration",
        mimeType: "application/json",
      },
      // ---- Value-Based Premium Endpoints ----
      "POST /memory-crystal": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.05",  // Unique memory crystal summon
            network,
            payTo: evmAddress,
          },
        ],
        description: "Summon a memory crystal from the agent's memory cosmos",
        mimeType: "application/json",
      },
      "POST /neural-swarm": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.10",  // Complex multi-agent delegation
            network,
            payTo: evmAddress,
          },
        ],
        description: "Delegate a task across the neural swarm network",
        mimeType: "application/json",
      },
      "POST /fusion-chamber": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.15",  // Rare memory fusion operation
            network,
            payTo: evmAddress,
          },
        ],
        description: "Fuse memory crystals in the Materia chamber",
        mimeType: "application/json",
      },
      "POST /cosmos-explore": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.20",  // Experiential memory cosmos exploration
            network,
            payTo: evmAddress,
          },
        ],
        description: "Explore the Memory Cosmos world — islands, highways, crystals",
        mimeType: "application/json",
      },
      ...(openai
        ? {
            "POST /voice/transcribe": {
              accepts: [
                {
                  scheme: "exact",
                  price: "$0.05",  // Was $0.005 — 10x (covers Whisper ~$0.006 + margin)
                  network,
                  payTo: evmAddress,
                },
              ],
              description: "Speech-to-text transcription via Whisper",
              mimeType: "application/json",
            },
            "POST /voice/synthesize": {
              accepts: [
                {
                  scheme: "exact",
                  price: "$0.08",  // Was $0.01 — 8x (covers TTS $0.015 + healthy margin)
                  network,
                  payTo: evmAddress,
                },
              ],
              description: "Text-to-speech synthesis via OpenAI TTS",
              mimeType: "audio/mpeg",
            },
          }
        : {}),
      // ---- Trade Execution Endpoints (%-of-capital pricing) ----
      "POST /execute-trade": {
        accepts: [{ scheme: "exact", price: "$0.50", network, payTo: evmAddress }],
        description: "Generate unsigned swap transaction (fee: 0.5% of trade, min $0.50)",
        mimeType: "application/json",
      },
      "POST /rebalance-portfolio": {
        accepts: [{ scheme: "exact", price: "$2.00", network, payTo: evmAddress }],
        description: "Portfolio rebalance analysis + tx bundle (fee: $2 + 0.3% of portfolio)",
        mimeType: "application/json",
      },
      "GET /arb-opportunity": {
        accepts: [{ scheme: "exact", price: "$0.25", network, payTo: evmAddress }],
        description: "Scan for cross-DEX arbitrage opportunities",
        mimeType: "application/json",
      },
      "POST /execute-arb": {
        accepts: [{ scheme: "exact", price: "$0.10", network, payTo: evmAddress }],
        description: "Execute arbitrage (fee: 1% of profit captured, min $0.10)",
        mimeType: "application/json",
      },
      "GET /yield-optimize": {
        accepts: [{ scheme: "exact", price: "$0.50", network, payTo: evmAddress }],
        description: "Analyze yield farming opportunities across Base protocols",
        mimeType: "application/json",
      },
      "POST /deploy-yield-strategy": {
        accepts: [{ scheme: "exact", price: "$3.00", network, payTo: evmAddress }],
        description: "Deploy capital into yield strategy (fee: $3 + 0.5% of capital)",
        mimeType: "application/json",
      },
      // ---- Alpha / Intelligence Feeds (recurring revenue) ----
      "GET /whale-alert": {
        accepts: [{ scheme: "exact", price: "$0.15", network, payTo: evmAddress }],
        description: "Whale transfer/swap detection on Base — tiered lookback depth",
        mimeType: "application/json",
      },
      "GET /liquidation-signal": {
        accepts: [{ scheme: "exact", price: "$0.25", network, payTo: evmAddress }],
        description: "DeFi lending liquidation signals (Aave V3, Moonwell, Seamless)",
        mimeType: "application/json",
      },
      "GET /arb-detection": {
        accepts: [{ scheme: "exact", price: "$0.20", network, payTo: evmAddress }],
        description: "Cross-DEX arbitrage signal detection (Uniswap V3 × Aerodrome)",
        mimeType: "application/json",
      },
      "GET /governance-signal": {
        accepts: [{ scheme: "exact", price: "$0.10", network, payTo: evmAddress }],
        description: "Governance proposal tracker across Base protocols",
        mimeType: "application/json",
      },
    },
    new x402ResourceServer(facilitatorClient).register(
      network,
      new ExactEvmScheme()
    )
  )
);

// ---- Gated Endpoints ----

/**
 * POST /agent-task — dispatch a task to a specific agent
 * Body: { agent: "main"|"akua"|"basedintern", message: "..." }
 */
app.post("/agent-task", async (req, res) => {
  logPayment("/agent-task", "$0.10", req);
  const { agent, message } = req.body;

  if (!agent || !message) {
    res.status(400).json({ error: "agent and message are required" });
    return;
  }

  const validAgents = ["main", "sentinel", "soul", "briefing", "oracle", "alchemist", "midas", "web3dev", "akua", "akua_web", "basedintern", "basedintern_web"];
  if (!validAgents.includes(agent)) {
    res.status(400).json({ error: `Invalid agent. Choose from: ${validAgents.join(", ")}` });
    return;
  }

  if (supabase) {
    // Insert command into Supabase — the bridge daemon picks it up
    const { data, error } = await supabase
      .from("agent_commands")
      .insert({
        agent_id: agent,
        message: `[x402] ${message.trim()}`,
        status: "pending",
      })
      .select("id, agent_id, message, status, created_at")
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({
      command: data,
      note: "Task queued — the bridge daemon will execute it. Poll /api/commands/:id for status.",
      timestamp: new Date().toISOString(),
    });
  } else {
    // No Supabase — return acknowledgment
    res.json({
      accepted: true,
      agent,
      message,
      note: "Supabase not connected — task logged but not dispatched",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /intent — resolve a goal into agent commands
 * Body: { goal: "Deploy an NFT contract on Base" }
 */
app.post("/intent", async (req, res) => {
  logPayment("/intent", "$0.05", req);
  const { goal } = req.body;

  if (!goal || typeof goal !== "string") {
    res.status(400).json({ error: "goal is required" });
    return;
  }

  if (supabase) {
    // Create an intent session for external callers
    const { data, error } = await supabase
      .from("intent_sessions")
      .insert({
        cursor_agent_id: "x402-api",
        goal: goal.trim(),
        repository: "",
        model: "x402-api",
        status: "THINKING",
        commands: [],
        conversation: [
          { id: "sys", type: "user_message", text: goal.trim() },
        ],
      })
      .select("id, goal, status, created_at")
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({
      session: data,
      note: "Intent session created. Poll /api/intent/:id for resolution.",
      timestamp: new Date().toISOString(),
    });
  } else {
    res.json({
      accepted: true,
      goal,
      note: "Supabase not connected — intent logged but not processed",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /fleet-status — live status of all agents
 */
app.get("/fleet-status", async (_req, res) => {
  logPayment("/fleet-status", "$0.01", _req);
  if (supabase) {
    const { data: sessions } = await supabase
      .from("agent_sessions")
      .select("agent_id, status, last_heartbeat");

    const { data: controls } = await supabase
      .from("agent_controls")
      .select("agent_id, enabled");

    const fleet = [
      { id: "main", name: "Main (Orchestrator)", workspace: "~/.openclaw/workspace" },
      { id: "sentinel", name: "Sentinel (Fleet Ops)", workspace: "/home/manifest/sentinel" },
      { id: "soul", name: "Soul (Memory Orchestrator)", workspace: "/home/manifest/soul" },
      { id: "briefing", name: "Briefing (Context Curator)", workspace: "/home/manifest/briefing" },
      { id: "oracle", name: "Oracle (On-Chain Intel)", workspace: "/home/manifest/oracle" },
      { id: "alchemist", name: "Alchemist (Tokenomics)", workspace: "/home/manifest/alchemist" },
      { id: "midas", name: "Midas (Revenue & Growth)", workspace: "/home/manifest/midas" },
      { id: "web3dev", name: "Web3Dev (Blockchain Dev)", workspace: "/home/manifest/web3dev" },
      { id: "akua", name: "Akua (Solidity/Base)", workspace: "/home/manifest/akua" },
      { id: "basedintern", name: "BasedIntern (TypeScript)", workspace: "/home/manifest/basedintern" },
    ].map((agent) => {
      const session = sessions?.find((s) => s.agent_id === agent.id);
      const control = controls?.find((c) => c.agent_id === agent.id);
      return {
        ...agent,
        status: session?.status || "offline",
        enabled: control?.enabled ?? true,
        lastHeartbeat: session?.last_heartbeat || null,
      };
    });

    res.json({
      fleet,
      agentCount: fleet.length,
      onlineCount: fleet.filter((a) => a.status === "online" || a.status === "idle").length,
      timestamp: new Date().toISOString(),
    });
  } else {
    res.json({
      fleet: [
        { id: "main", name: "Main (Orchestrator)", status: "unknown" },
        { id: "sentinel", name: "Sentinel (Fleet Ops)", status: "unknown" },
        { id: "soul", name: "Soul (Memory Orchestrator)", status: "unknown" },
        { id: "briefing", name: "Briefing (Context Curator)", status: "unknown" },
        { id: "oracle", name: "Oracle (On-Chain Intel)", status: "unknown" },
        { id: "alchemist", name: "Alchemist (Tokenomics)", status: "unknown" },
        { id: "midas", name: "Midas (Revenue & Growth)", status: "unknown" },
        { id: "web3dev", name: "Web3Dev (Blockchain Dev)", status: "unknown" },
        { id: "akua", name: "Akua (Solidity/Base)", status: "unknown" },
        { id: "basedintern", name: "BasedIntern (TypeScript)", status: "unknown" },
      ],
      note: "Supabase not connected — live status unavailable",
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /swarm — launch a multi-agent swarm
 * Body: { mode: "parallel"|"pipeline"|"collab", tasks: [{ agent: "...", message: "..." }] }
 */
app.post("/swarm", async (req, res) => {
  logPayment("/swarm", "$0.50", req);
  const { mode, tasks } = req.body;

  const validModes = ["parallel", "pipeline", "collab"];
  if (!mode || !validModes.includes(mode)) {
    res.status(400).json({ error: `mode must be one of: ${validModes.join(", ")}` });
    return;
  }

  if (!Array.isArray(tasks) || tasks.length === 0) {
    res.status(400).json({ error: "tasks array is required" });
    return;
  }

  if (supabase) {
    // Build manifest matching the swarm schema
    const manifest = {
      mode,
      source: "x402",
      tasks: tasks.map((t: { agent: string; message: string }, i: number) => ({
        taskId: `x402-task-${i}`,
        agent: t.agent,
        message: t.message,
      })),
    };

    // Create swarm run in Supabase — the bridge swarm executor picks it up
    const { data: run, error: runError } = await supabase
      .from("swarm_runs")
      .insert({
        name: `x402 ${mode} swarm`,
        mode,
        status: "pending",
        manifest,
      })
      .select("id, mode, status, created_at")
      .single();

    if (runError) {
      res.status(500).json({ error: runError.message });
      return;
    }

    // Insert individual tasks (columns: swarm_id, task_id, agent_id, message, status)
    const taskRows = tasks.map((t: { agent: string; message: string }, i: number) => ({
      swarm_id: run.id,
      task_id: `x402-task-${i}`,
      agent_id: t.agent,
      message: t.message,
      status: "pending",
    }));

    await supabase.from("swarm_tasks").insert(taskRows);

    // Per-spawn billing: charge $0.02 per sub-agent
    const spawnAgents = tasks.map((t: { agent: string }) => t.agent);
    const callerAddr = req.headers["x-caller-address"] as string | undefined;
    billSwarmSpawns(run.id, spawnAgents, callerAddr);

    // A/B tracking
    trackABExperiment("/swarm", "control", true, 0.50);

    res.json({
      swarm: run,
      tasks: taskRows.length,
      spawnBilling: {
        agentsSpawned: spawnAgents.length,
        costPerSpawn: "$0.02",
        totalSpawnCost: `$${(0.02 * spawnAgents.length).toFixed(2)}`,
      },
      note: "Swarm queued — the bridge daemon will orchestrate execution.",
      timestamp: new Date().toISOString(),
    });
  } else {
    res.json({
      accepted: true,
      mode,
      taskCount: tasks.length,
      note: "Supabase not connected — swarm logged but not dispatched",
      timestamp: new Date().toISOString(),
    });
  }
});

// ---- Value-Based Premium Endpoints ----

/**
 * POST /memory-crystal — summon a memory crystal from agent memory
 * Body: { query: "...", agent?: "soul" }
 */
app.post("/memory-crystal", async (req, res) => {
  logPayment("/memory-crystal", "$0.05", req);
  const { query, agent } = req.body;
  if (!query) { res.status(400).json({ error: "query is required" }); return; }

  if (supabase) {
    // Find matching memories and return as crystal
    const { data: memories } = await supabase
      .from("agent_memory")
      .select("id, agent_id, content, kind, source, created_at")
      .ilike("content", `%${query}%`)
      .order("created_at", { ascending: false })
      .limit(5);

    const crystal = {
      type: "memory-crystal",
      query,
      fragments: memories || [],
      crystalClass: (memories?.length || 0) >= 3 ? "rare" : "common",
      xp: Math.floor(Math.random() * 50) + 10,
      timestamp: new Date().toISOString(),
    };
    res.json(crystal);
  } else {
    res.json({ type: "memory-crystal", query, fragments: [], note: "Supabase not connected", timestamp: new Date().toISOString() });
  }
});

/**
 * POST /neural-swarm — delegate a complex task across multiple agents
 * Body: { goal: "...", agents?: ["oracle", "alchemist"] }
 */
app.post("/neural-swarm", async (req, res) => {
  logPayment("/neural-swarm", "$0.10", req);
  const { goal, agents: requestedAgents } = req.body;
  if (!goal) { res.status(400).json({ error: "goal is required" }); return; }

  const targetAgents = requestedAgents || ["oracle", "alchemist", "web3dev"];
  if (supabase) {
    const manifest = {
      mode: "collab",
      source: "x402-neural-swarm",
      tasks: targetAgents.map((a: string, i: number) => ({
        taskId: `neural-${i}`,
        agent: a,
        message: `[Neural Swarm] ${goal}`,
      })),
    };
    const { data: run, error } = await supabase
      .from("swarm_runs")
      .insert({ name: `Neural Swarm: ${goal.slice(0, 50)}`, mode: "collab", status: "pending", manifest })
      .select("id, mode, status, created_at")
      .single();
    if (error) { res.status(500).json({ error: error.message }); return; }

    const taskRows = targetAgents.map((a: string, i: number) => ({
      swarm_id: run.id, task_id: `neural-${i}`, agent_id: a, message: `[Neural Swarm] ${goal}`, status: "pending",
    }));
    await supabase.from("swarm_tasks").insert(taskRows);

    // Per-spawn billing for neural swarm
    const callerAddr = req.headers["x-caller-address"] as string | undefined;
    billSwarmSpawns(run.id, targetAgents, callerAddr);

    res.json({
      swarm: run,
      agents: targetAgents,
      taskCount: taskRows.length,
      spawnBilling: {
        agentsSpawned: targetAgents.length,
        costPerSpawn: "$0.02",
        totalSpawnCost: `$${(0.02 * targetAgents.length).toFixed(2)}`,
      },
      note: "Neural swarm dispatched.",
      timestamp: new Date().toISOString(),
    });
  } else {
    res.json({ accepted: true, goal, agents: targetAgents, note: "Supabase not connected", timestamp: new Date().toISOString() });
  }
});

/**
 * POST /fusion-chamber — fuse memory crystals together
 * Body: { memoryIds: ["id1", "id2"], catalyst?: "dream" }
 */
app.post("/fusion-chamber", async (req, res) => {
  logPayment("/fusion-chamber", "$0.15", req);
  const { memoryIds, catalyst } = req.body;
  if (!Array.isArray(memoryIds) || memoryIds.length < 2) {
    res.status(400).json({ error: "At least 2 memoryIds required for fusion" }); return;
  }

  if (supabase) {
    const { data: memories } = await supabase
      .from("agent_memory")
      .select("id, content, kind, source")
      .in("id", memoryIds);

    if (!memories || memories.length < 2) {
      res.status(404).json({ error: "Could not find enough memories to fuse" }); return;
    }

    // Create a fused memory association
    const fusedContent = memories.map(m => m.content).join(" ⟷ ");
    const { data: association } = await supabase
      .from("memory_associations")
      .insert({
        memory_id: memories[0].id,
        related_memory_id: memories[1].id,
        association_type: catalyst === "dream" ? "causal" : "related",
        strength: Math.min(1.0, 0.7),
      })
      .select("id, association_type, strength, created_at")
      .single();

    res.json({
      type: "fusion-result",
      inputMemories: memoryIds.length,
      catalyst: catalyst || "standard",
      association,
      crystalClass: memories.length >= 4 ? "legendary" : memories.length >= 3 ? "epic" : "rare",
      xp: memories.length * 20 + 25,
      timestamp: new Date().toISOString(),
    });
  } else {
    res.json({ type: "fusion-result", inputMemories: memoryIds.length, note: "Supabase not connected", timestamp: new Date().toISOString() });
  }
});

/**
 * POST /cosmos-explore — explore the Memory Cosmos world
 * Body: { region?: "city"|"wasteland"|"forest", depth?: number }
 */
app.post("/cosmos-explore", async (req, res) => {
  logPayment("/cosmos-explore", "$0.20", req);
  const { region, depth } = req.body;
  const targetRegion = region || "city";
  const exploreDepth = Math.min(depth || 3, 10);

  if (supabase) {
    // Pull recent memories, associations, and dream insights
    const [memRes, assocRes, dreamRes] = await Promise.all([
      supabase.from("agent_memory").select("id, agent_id, content, kind, source, created_at")
        .order("created_at", { ascending: false }).limit(exploreDepth * 5),
      supabase.from("memory_associations").select("id, memory_id, related_memory_id, association_type, strength")
        .order("strength", { ascending: false }).limit(exploreDepth * 3),
      supabase.from("dream_insights").select("id, category, insight, confidence, created_at")
        .order("created_at", { ascending: false }).limit(exploreDepth),
    ]);

    const islands = (memRes.data || []).reduce((acc: Record<string, number>, m) => {
      acc[m.agent_id] = (acc[m.agent_id] || 0) + 1;
      return acc;
    }, {});

    res.json({
      type: "cosmos-exploration",
      region: targetRegion,
      depth: exploreDepth,
      islands: Object.entries(islands).map(([agent, count]) => ({ agent, memoryCount: count, terrain: targetRegion })),
      highways: (assocRes.data || []).map(a => ({ from: a.memory_id, to: a.related_memory_id, type: a.association_type, strength: a.strength })),
      dreams: dreamRes.data || [],
      totalMemories: memRes.data?.length || 0,
      totalConnections: assocRes.data?.length || 0,
      timestamp: new Date().toISOString(),
    });
  } else {
    res.json({ type: "cosmos-exploration", region: targetRegion, note: "Supabase not connected", timestamp: new Date().toISOString() });
  }
});

// ---- Voice endpoints (gated, require OPENAI_API_KEY) ----

if (openai) {
  /**
   * POST /voice/transcribe — speech-to-text via Whisper
   * Body: multipart/form-data with "audio" file
   */
  app.post("/voice/transcribe", express.raw({ type: "audio/*", limit: "25mb" }), async (req, res) => {
    try {
      const audioBuffer = req.body as Buffer;

      if (!audioBuffer || audioBuffer.length === 0) {
        res.status(400).json({ error: "Audio data is required" });
        return;
      }

      const file = new File([new Uint8Array(audioBuffer)], "audio.webm", { type: "audio/webm" });

      const response = await openai.audio.transcriptions.create({
        model: "whisper-1",
        file,
        language: "en",
      });

      res.json({
        text: response.text,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transcription failed";
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /voice/synthesize — text-to-speech via OpenAI TTS
   * Body: { text: "...", voice?: "nova"|"alloy"|"echo"|"fable"|"onyx"|"shimmer" }
   */
  app.post("/voice/synthesize", async (req, res) => {
    const { text, voice } = req.body;

    if (!text || typeof text !== "string") {
      res.status(400).json({ error: "text is required" });
      return;
    }

    if (text.length > 4096) {
      res.status(413).json({ error: "Text too long (max 4096 characters)" });
      return;
    }

    const validVoices = ["alloy", "echo", "fable", "nova", "onyx", "shimmer"];
    const selectedVoice = voice && validVoices.includes(voice) ? voice : "nova";

    try {
      const response = await openai.audio.speech.create({
        model: "tts-1-hd",
        voice: selectedVoice,
        input: text.trim(),
        response_format: "mp3",
      });

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
      });
      res.send(buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Synthesis failed";
      res.status(500).json({ error: message });
    }
  });
}

// ---- Free endpoints (no payment required) ----

app.get("/token-info", async (_req, res) => {
  res.json({
    token: {
      name: "XmetaV",
      symbol: "XMETAV",
      address: XMETAV_TOKEN_ADDRESS || "not configured",
      network: "eip155:8453",
      chainId: 8453,
    },
    tiers: TIERS.map((t) => ({
      name: t.name,
      minBalance: t.minBalance,
      discount: `${(t.discount * 100).toFixed(0)}%`,
      dailyLimit: `$${t.dailyLimit}`,
      color: t.color,
    })),
    enabled: !!XMETAV_TOKEN_ADDRESS,
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "xmetav-x402",
    version: "1.0.0",
    network,
    payTo: evmAddress,
    supabase: supabase ? "connected" : "not configured",
    voice: openai ? "enabled" : "disabled (no OPENAI_API_KEY)",
    token: XMETAV_TOKEN_ADDRESS
      ? { address: XMETAV_TOKEN_ADDRESS, tiers: "enabled" }
      : "disabled (no XMETAV_TOKEN_ADDRESS)",
    endpoints: {
      gated: {
        "POST /agent-task": "$0.10 — dispatch a task to an agent",
        "POST /intent": "$0.05 — resolve a goal into commands",
        "GET /fleet-status": "$0.01 — live agent fleet status",
        "POST /swarm": "$0.50 — launch multi-agent swarm",
        "POST /memory-crystal": "$0.05 — summon memory crystal",
        "POST /neural-swarm": "$0.10 — neural swarm delegation",
        "POST /fusion-chamber": "$0.15 — fuse memory crystals",
        "POST /cosmos-explore": "$0.20 — explore Memory Cosmos",
        ...(openai
          ? {
              "POST /voice/transcribe": "$0.05 — speech-to-text (Whisper)",
              "POST /voice/synthesize": "$0.08 — text-to-speech (TTS HD)",
            }
          : {}),
        // Trade Execution
        "POST /execute-trade": "$0.50 min (0.5% of trade) — generate swap tx bundle",
        "POST /rebalance-portfolio": "$2.00 + 0.3% — portfolio rebalance analysis",
        "GET /arb-opportunity": "$0.25 — scan for arbitrage opportunities",
        "POST /execute-arb": "$0.10 min (1% of profit) — execute arbitrage",
        "GET /yield-optimize": "$0.50 — yield farming opportunity analysis",
        "POST /deploy-yield-strategy": "$3.00 + 0.5% — deploy capital to yield",
        // Alpha / Intelligence Feeds
        "GET /whale-alert": "$0.15 — whale transfer/swap detection",
        "GET /liquidation-signal": "$0.25 — DeFi liquidation signals",
        "GET /arb-detection": "$0.20 — cross-DEX arbitrage signals",
        "GET /governance-signal": "$0.10 — governance proposal tracker",
      },
      free: {
        "GET /health": "this endpoint",
        "GET /token-info": "XMETAV token info and tier table",
        "GET /agent/:agentId/payment-info": "ERC-8004 agent payment capabilities",
        "POST /digest": "trigger payment→memory digest (writes to agent memories)",
        "GET /trade-fees": "fee schedule, examples, and revenue projections",
      },
    },
  });
});

// ---- Trade Execution Routes ----
const tradeRouter = createTradeRouter(
  (endpoint, amount, req) => logPayment(endpoint, amount, req),
  (callerAddress) => getCallerTier(callerAddress)
);
app.use(tradeRouter);

// ---- Alpha / Intelligence Feeds ----
const alphaRouter = createAlphaFeedsRouter(
  (endpoint, amount, req) => logPayment(endpoint, amount, req),
  (callerAddress) => getCallerTier(callerAddress)
);
app.use(alphaRouter);

// ---- On-Demand Payment Digest ----
app.post("/digest", async (_req, res) => {
  try {
    await generatePaymentDigest();
    res.json({
      status: "ok",
      message: "Payment digest written to midas, oracle, alchemist, and shared agent memories.",
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---- ERC-8004 Agent Payment Info (free, public discovery) ----
// Uses the shared erc8004Client and ERC8004_ABI from identity middleware above

app.get("/agent/:agentId/payment-info", async (req, res) => {
  const agentId = BigInt(req.params.agentId);

  try {
    const [owner, tokenURI, agentWallet] = await Promise.all([
      erc8004Client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "ownerOf", args: [agentId] }),
      erc8004Client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "tokenURI", args: [agentId] }),
      erc8004Client.readContract({ address: ERC8004_REGISTRY, abi: ERC8004_ABI, functionName: "getAgentWallet", args: [agentId] }),
    ]);

    // Check if the agent metadata declares x402 support
    let metadata: Record<string, unknown> | null = null;
    let x402Enabled = false;
    if (tokenURI) {
      try {
        if ((tokenURI as string).startsWith("data:")) {
          const json64 = (tokenURI as string).split(",")[1];
          metadata = JSON.parse(Buffer.from(json64, "base64").toString());
        } else {
          const resp = await fetch(tokenURI as string, { signal: AbortSignal.timeout(5000) });
          if (resp.ok) metadata = await resp.json() as Record<string, unknown>;
        }
        if (metadata) {
          // Check both new x402Support.enabled flag and legacy services array
          const x402Support = metadata.x402Support as { enabled?: boolean } | undefined;
          const services = metadata.services as Array<{ type: string }> | undefined;
          x402Enabled = x402Support?.enabled === true || !!services?.some((s) => s.type === "x402");
        }
      } catch { /* metadata fetch failed — ok, just report what we have */ }
    }

    // Extract x402Support details from metadata for structured response
    const x402Support = metadata?.x402Support as Record<string, unknown> | undefined;

    res.json({
      agentId: agentId.toString(),
      owner: owner as string,
      wallet: agentWallet as string,
      tokenURI: tokenURI as string,
      x402Enabled,
      x402Support: x402Enabled && x402Support ? {
        enabled: true,
        network: x402Support.network || "eip155:8453",
        payTo: x402Support.payTo,
        acceptedSchemes: x402Support.acceptedSchemes || ["exact"],
        denomination: x402Support.denomination || "USDC",
        facilitator: x402Support.facilitator,
        pricing: x402Support.pricing || {},
        tokenDiscounts: x402Support.tokenDiscounts || null,
      } : null,
      capabilities: metadata?.capabilities || [],
      services: metadata?.services || [],
      contracts: metadata?.contracts || {},
      registry: ERC8004_REGISTRY,
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(404).json({
      error: `Agent #${agentId} not found in ERC-8004 registry`,
      registry: ERC8004_REGISTRY,
    });
  }
});

// ---- Start ----

const server = app.listen(port, () => {
  console.log(`\n  XmetaV x402 Payment-Gated API`);
  console.log(`  ─────────────────────────────`);
  console.log(`  Server:    http://localhost:${port}`);
  console.log(`  Network:   ${network}`);
  console.log(`  Pay-to:    ${evmAddress}`);
  console.log(`  Supabase:  ${supabase ? "connected" : "not configured"}`);
  console.log(`  Health:    http://localhost:${port}/health`);
  console.log(`  Voice:     ${openai ? "enabled" : "disabled (no OPENAI_API_KEY)"}`);
  console.log(`  Token:     ${XMETAV_TOKEN_ADDRESS ? XMETAV_TOKEN_ADDRESS : "disabled (no XMETAV_TOKEN_ADDRESS)"}`);
  console.log(`  Memory:    ${supabase ? "enabled (digests every 60min)" : "disabled"}`);
  console.log(`\n  Gated endpoints:`);
  console.log(`    POST /agent-task       $0.10   Dispatch task to agent`);
  console.log(`    POST /intent           $0.05   Resolve goal → commands`);
  console.log(`    GET  /fleet-status     $0.01   Live fleet status`);
  console.log(`    POST /swarm            $0.50   Multi-agent swarm`);
  console.log(`    POST /memory-crystal   $0.05   Memory crystal summon`);
  console.log(`    POST /neural-swarm     $0.10   Neural swarm delegation`);
  console.log(`    POST /fusion-chamber   $0.15   Fuse memory crystals`);
  console.log(`    POST /cosmos-explore   $0.20   Explore Memory Cosmos`);
  if (openai) {
    console.log(`    POST /voice/transcribe $0.05   Speech-to-text (Whisper)`);
    console.log(`    POST /voice/synthesize $0.08   Text-to-speech (TTS HD)`);
  }
  console.log(`\n  Trade Execution (%-of-capital):`);
  console.log(`    POST /execute-trade        $0.50 min  0.5% of trade value`);
  console.log(`    POST /rebalance-portfolio  $2.00 +    0.3% of portfolio`);
  console.log(`    GET  /arb-opportunity       $0.25      Arb scan`);
  console.log(`    POST /execute-arb          $0.10 min  1% of profit`);
  console.log(`    GET  /yield-optimize       $0.50      Yield scan`);
  console.log(`    POST /deploy-yield-strategy $3.00 +   0.5% of capital`);
  console.log(`\n  Alpha / Intelligence Feeds:`);
  console.log(`    GET  /whale-alert          $0.15      Whale transfer detection`);
  console.log(`    GET  /liquidation-signal   $0.25      DeFi liquidation signals`);
  console.log(`    GET  /arb-detection        $0.20      Cross-DEX arb signals`);
  console.log(`    GET  /governance-signal    $0.10      Governance proposals`);
  console.log(`\n  Free endpoints:`);
  console.log(`    GET  /health                    Service health`);
  console.log(`    GET  /token-info                Token tiers & discounts`);
  console.log(`    GET  /agent/:agentId/payment-info  ERC-8004 agent lookup`);
  console.log(`    GET  /trade-fees                Fee schedule & projections`);
  console.log();

  // Start payment→memory digest scheduler (hourly)
  startDigestScheduler();
});

// ── Graceful Shutdown: write session summary to memory ──
async function gracefulShutdown(signal: string) {
  console.log(`\n[x402] ${signal} received — writing session summary...`);
  stopDigestScheduler();
  await writeSessionSummary();
  server.close(() => {
    console.log("[x402] Server closed.");
    process.exit(0);
  });
  // Force exit after 5s if shutdown hangs
  setTimeout(() => process.exit(0), 5000);
}
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
