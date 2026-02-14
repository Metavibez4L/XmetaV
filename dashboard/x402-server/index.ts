import "dotenv/config";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

// ============================================================
// XmetaV x402 Payment-Gated API
// Pay-per-use access to the XmetaV agent orchestration platform
// ============================================================

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
const facilitatorUrl = process.env.FACILITATOR_URL;
const port = parseInt(process.env.PORT || "4021", 10);
const network = process.env.NETWORK || "eip155:8453"; // Base Mainnet default

if (!evmAddress) {
  console.error("EVM_ADDRESS environment variable is required");
  process.exit(1);
}
if (!facilitatorUrl) {
  console.error("FACILITATOR_URL environment variable is required");
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

const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

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
  { name: "None",    minBalance: 0,         discount: 0,    dailyLimit: 5,    color: "#4a6a8a" },
  { name: "Bronze",  minBalance: 1_000,     discount: 0.10, dailyLimit: 25,   color: "#cd7f32" },
  { name: "Silver",  minBalance: 10_000,    discount: 0.20, dailyLimit: 100,  color: "#c0c0c0" },
  { name: "Gold",    minBalance: 100_000,   discount: 0.35, dailyLimit: 500,  color: "#ffd700" },
  { name: "Diamond", minBalance: 1_000_000, discount: 0.50, dailyLimit: 2000, color: "#b9f2ff" },
];

function getTier(balance: number): TokenTier {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (balance >= TIERS[i].minBalance) return TIERS[i];
  }
  return TIERS[0];
}

const viemClient = XMETAV_TOKEN_ADDRESS
  ? createPublicClient({ chain: base, transport: http("https://mainnet.base.org") })
  : null;

async function getCallerTier(callerAddress?: string): Promise<TokenTier> {
  if (!viemClient || !XMETAV_TOKEN_ADDRESS || !callerAddress) return TIERS[0];
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
}

const app = express();
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
    // metadata column may not exist yet — try with it, fallback without
    const metaPayload = callerAgent
      ? { callerAgentId: callerAgent.agentId, callerOwner: callerAgent.owner, x402Enabled: callerAgent.x402Enabled }
      : null;
    const { error } = await supabase.from("x402_payments").insert({ ...row, metadata: metaPayload });
    if (error?.message?.includes("metadata")) {
      await supabase.from("x402_payments").insert(row);
    }
  } catch { /* best effort */ }
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
  transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
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
    req.callerAgent = {
      agentId: agentId.toString(),
      owner: owner as string,
      wallet: wallet as string,
      tokenURI: uri as string,
      x402Enabled,
    };
    console.log(`[ERC-8004] Resolved caller agent #${agentId} — owner: ${owner}, x402: ${x402Enabled}`);
  } catch {
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

  const validAgents = ["main", "akua", "akua_web", "basedintern", "basedintern_web"];
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
      { id: "briefing", name: "Briefing (Context Curator)", workspace: "/home/manifest/briefing" },
      { id: "oracle", name: "Oracle (On-Chain Intel)", workspace: "/home/manifest/oracle" },
      { id: "alchemist", name: "Alchemist (Tokenomics)", workspace: "/home/manifest/alchemist" },
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
        { id: "briefing", name: "Briefing (Context Curator)", status: "unknown" },
        { id: "oracle", name: "Oracle (On-Chain Intel)", status: "unknown" },
        { id: "alchemist", name: "Alchemist (Tokenomics)", status: "unknown" },
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

    res.json({
      swarm: run,
      tasks: taskRows.length,
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

      const file = new File([audioBuffer], "audio.webm", { type: "audio/webm" });

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
        ...(openai
          ? {
              "POST /voice/transcribe": "$0.05 — speech-to-text (Whisper)",
              "POST /voice/synthesize": "$0.08 — text-to-speech (TTS HD)",
            }
          : {}),
      },
      free: {
        "GET /health": "this endpoint",
        "GET /token-info": "XMETAV token info and tier table",
        "GET /agent/:agentId/payment-info": "ERC-8004 agent payment capabilities",
      },
    },
  });
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

    res.json({
      agentId: agentId.toString(),
      owner: owner as string,
      agentWallet: agentWallet as string,
      tokenURI: tokenURI as string,
      x402Enabled,
      acceptedSchemes: x402Enabled ? ["exact"] : [],
      network: "eip155:8453",
      pricing: x402Enabled && metadata
        ? (metadata as Record<string, unknown>)
        : null,
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

app.listen(port, () => {
  console.log(`\n  XmetaV x402 Payment-Gated API`);
  console.log(`  ─────────────────────────────`);
  console.log(`  Server:    http://localhost:${port}`);
  console.log(`  Network:   ${network}`);
  console.log(`  Pay-to:    ${evmAddress}`);
  console.log(`  Supabase:  ${supabase ? "connected" : "not configured"}`);
  console.log(`  Health:    http://localhost:${port}/health`);
  console.log(`  Voice:     ${openai ? "enabled" : "disabled (no OPENAI_API_KEY)"}`);
  console.log(`  Token:     ${XMETAV_TOKEN_ADDRESS ? XMETAV_TOKEN_ADDRESS : "disabled (no XMETAV_TOKEN_ADDRESS)"}`);
  console.log(`\n  Gated endpoints:`);
  console.log(`    POST /agent-task       $0.10   Dispatch task to agent`);
  console.log(`    POST /intent           $0.05   Resolve goal → commands`);
  console.log(`    GET  /fleet-status     $0.01   Live fleet status`);
  console.log(`    POST /swarm            $0.50   Multi-agent swarm`);
  if (openai) {
    console.log(`    POST /voice/transcribe $0.05   Speech-to-text (Whisper)`);
    console.log(`    POST /voice/synthesize $0.08   Text-to-speech (TTS HD)`);
  }
  console.log(`\n  Free endpoints:`);
  console.log(`    GET  /health                    Service health`);
  console.log(`    GET  /token-info                Token tiers & discounts`);
  console.log(`    GET  /agent/:agentId/payment-info  ERC-8004 agent lookup`);
  console.log();
});
