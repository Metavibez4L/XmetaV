import "dotenv/config";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// ============================================================
// XmetaV x402 Payment-Gated API
// Pay-per-use access to the XmetaV agent orchestration platform
// ============================================================

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
const facilitatorUrl = process.env.FACILITATOR_URL;
const port = parseInt(process.env.PORT || "4021", 10);
const network = process.env.NETWORK || "eip155:84532"; // Base Sepolia default

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

const app = express();
app.use(express.json());

// ---- x402 Payment Middleware ----
// Gates XmetaV platform endpoints with USDC micro-payments on Base

app.use(
  paymentMiddleware(
    {
      "POST /agent-task": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.01",
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
            price: "$0.005",
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
            price: "$0.001",
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
            price: "$0.02",
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
                  price: "$0.005",
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
                  price: "$0.01",
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
  if (supabase) {
    const { data: sessions } = await supabase
      .from("agent_sessions")
      .select("agent_id, status, last_heartbeat");

    const { data: controls } = await supabase
      .from("agent_controls")
      .select("agent_id, enabled");

    const fleet = [
      { id: "main", name: "Main (Orchestrator)", workspace: "~/.openclaw/workspace" },
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

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "xmetav-x402",
    version: "1.0.0",
    network,
    payTo: evmAddress,
    supabase: supabase ? "connected" : "not configured",
    voice: openai ? "enabled" : "disabled (no OPENAI_API_KEY)",
    endpoints: {
      gated: {
        "POST /agent-task": "$0.01 — dispatch a task to an agent",
        "POST /intent": "$0.005 — resolve a goal into commands",
        "GET /fleet-status": "$0.001 — live agent fleet status",
        "POST /swarm": "$0.02 — launch multi-agent swarm",
        ...(openai
          ? {
              "POST /voice/transcribe": "$0.005 — speech-to-text (Whisper)",
              "POST /voice/synthesize": "$0.01 — text-to-speech (TTS HD)",
            }
          : {}),
      },
      free: {
        "GET /health": "this endpoint",
      },
    },
  });
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
  console.log(`\n  Gated endpoints:`);
  console.log(`    POST /agent-task       $0.01   Dispatch task to agent`);
  console.log(`    POST /intent           $0.005  Resolve goal → commands`);
  console.log(`    GET  /fleet-status     $0.001  Live fleet status`);
  console.log(`    POST /swarm            $0.02   Multi-agent swarm`);
  if (openai) {
    console.log(`    POST /voice/transcribe $0.005  Speech-to-text (Whisper)`);
    console.log(`    POST /voice/synthesize $0.01   Text-to-speech (TTS HD)`);
  }
  console.log();
});
