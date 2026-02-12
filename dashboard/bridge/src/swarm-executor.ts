import { supabase } from "../lib/supabase.js";
import { runAgentWithFallback } from "../lib/openclaw.js";
import type { ChildProcess } from "child_process";

// ============================================================
// Swarm Executor -- handles swarm_runs orchestration
// Optimizations:
// - Cancellation-aware: kills child processes on cancel
// - Agent-enabled check before spawning
// - Error resilience: individual task failures don't crash the run
// - Output buffer dedup to reduce DB writes
// ============================================================

interface SwarmManifestTask {
  id: string;
  agent: string;
  message: string;
  depends_on?: string;
  timeout?: number;
  /** Task type: "openclaw" (default) or "intent" (uses Cursor API to generate commands first) */
  type?: "openclaw" | "intent";
  /** For intent tasks: target GitHub repo */
  repo?: string;
  /** For intent tasks: auto-execute generated commands */
  auto_execute?: boolean;
}

interface SwarmManifest {
  mode: "parallel" | "pipeline" | "collaborative";
  tasks?: SwarmManifestTask[];
  task?: string;
  agents?: string[];
  synthesize_agent?: string;
  synthesize?: boolean;
  on_failure?: "stop" | "continue";
}

interface SwarmRun {
  id: string;
  name: string;
  mode: string;
  status: string;
  manifest: SwarmManifest;
}

interface SwarmTaskRow {
  id: string;
  swarm_id: string;
  task_id: string;
  agent_id: string;
  message: string;
  status: string;
  output: string;
}

const MAX_CONCURRENT = 3;
const OUTPUT_FLUSH_MS = 800;

/** Track active swarm run IDs to prevent duplicate execution */
const activeSwarms = new Set<string>();

/** Track child processes per run so they can be killed on cancel */
const runChildren = new Map<string, Set<ChildProcess>>();

/** Listen for new swarm_runs inserts with status=pending */
export function subscribeToSwarms() {
  const channel = supabase
    .channel("bridge-swarms")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "swarm_runs",
        filter: "status=eq.pending",
      },
      (payload) => {
        const run = payload.new as SwarmRun;
        console.log(`[swarm] New swarm run received: ${run.id} (${run.name})`);
        processSwarmRun(run);
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "swarm_runs",
        filter: "status=eq.cancelled",
      },
      (payload) => {
        const run = payload.new as SwarmRun;
        killRunChildren(run.id);
      }
    )
    .subscribe((status) => {
      console.log(`[swarm] Realtime subscription: ${status}`);
    });

  // Also pick up any pending swarm runs on startup
  processPendingSwarms();

  return channel;
}

async function processPendingSwarms() {
  const { data } = await supabase
    .from("swarm_runs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (data && data.length > 0) {
    console.log(`[swarm] Found ${data.length} pending swarm run(s) to process`);
    for (const run of data) {
      processSwarmRun(run as SwarmRun);
    }
  }
}

async function processSwarmRun(run: SwarmRun) {
  if (activeSwarms.has(run.id)) {
    console.log(`[swarm] Run ${run.id} already active, skipping`);
    return;
  }
  activeSwarms.add(run.id);
  runChildren.set(run.id, new Set());

  try {
    // Mark as running
    await supabase.from("swarm_runs").update({ status: "running" }).eq("id", run.id);

    const manifest = run.manifest;
    console.log(`[swarm] Executing run ${run.id}: mode=${manifest.mode}, name="${run.name}"`);

    switch (manifest.mode) {
      case "parallel":
        await executeParallel(run.id, manifest);
        break;
      case "pipeline":
        await executePipeline(run.id, manifest);
        break;
      case "collaborative":
        await executeCollaborative(run.id, manifest);
        break;
      default:
        throw new Error(`Unknown swarm mode: ${manifest.mode}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[swarm] Run ${run.id} failed:`, msg);
    await supabase.from("swarm_runs").update({ status: "failed" }).eq("id", run.id);
  } finally {
    activeSwarms.delete(run.id);
    runChildren.delete(run.id);
  }
}

// ============================================================
// Mode: Parallel
// ============================================================

async function executeParallel(runId: string, manifest: SwarmManifest) {
  const tasks = manifest.tasks ?? [];
  if (tasks.length === 0) throw new Error("No tasks defined in manifest");

  const taskRows = await createTaskRows(runId, tasks);
  if (await isCancelled(runId)) return;

  const results: Map<string, { output: string; exitCode: number | null }> = new Map();
  const chunks = chunkArray(taskRows, MAX_CONCURRENT);

  for (const chunk of chunks) {
    if (await isCancelled(runId)) return;

    await Promise.all(
      chunk.map(async (taskRow) => {
        const taskDef = tasks.find((t) => t.id === taskRow.task_id);
        const result = taskDef?.type === "intent"
          ? await executeIntentTask(runId, taskRow, taskDef?.message ?? taskRow.message, taskDef?.repo, taskDef?.auto_execute)
          : await executeTask(runId, taskRow, taskDef?.message ?? taskRow.message, taskDef?.timeout);
        results.set(taskRow.task_id, result);
      })
    );

    if (manifest.on_failure === "stop") {
      for (const [, res] of results) {
        if (res.exitCode !== 0 && res.exitCode !== null) {
          await finalizeRun(runId, "failed");
          return;
        }
      }
    }
  }

  // Synthesis
  if (manifest.synthesize && manifest.synthesize_agent) {
    if (!(await isCancelled(runId))) {
      const synthesisOutput = await runSynthesis(runId, manifest.synthesize_agent, tasks.map((t) => t.id), results);
      await supabase.from("swarm_runs").update({ synthesis: synthesisOutput }).eq("id", runId);
    }
  }

  if (!(await isCancelled(runId))) {
    await finalizeRun(runId, "completed");
  }
}

// ============================================================
// Mode: Pipeline
// ============================================================

async function executePipeline(runId: string, manifest: SwarmManifest) {
  const tasks = manifest.tasks ?? [];
  if (tasks.length === 0) throw new Error("No tasks defined in manifest");

  const taskRows = await createTaskRows(runId, tasks);
  let previousOutput = "";

  for (let i = 0; i < taskRows.length; i++) {
    if (await isCancelled(runId)) return;

    const taskRow = taskRows[i];
    const taskDef = tasks[i];

    let message = taskDef.message;
    if (previousOutput && i > 0) {
      message = `[Context from previous step "${tasks[i - 1].id}"]:\n${previousOutput}\n\n[Your task]:\n${message}`;
    }

    const result = taskDef.type === "intent"
      ? await executeIntentTask(runId, taskRow, message, taskDef.repo, taskDef.auto_execute)
      : await executeTask(runId, taskRow, message, taskDef.timeout);
    previousOutput = result.output;

    if (manifest.on_failure === "stop" && result.exitCode !== 0 && result.exitCode !== null) {
      for (let j = i + 1; j < taskRows.length; j++) {
        await supabase.from("swarm_tasks").update({ status: "skipped" }).eq("id", taskRows[j].id);
      }
      await finalizeRun(runId, "failed");
      return;
    }
  }

  if (!(await isCancelled(runId))) {
    await finalizeRun(runId, "completed");
  }
}

// ============================================================
// Mode: Collaborative
// ============================================================

async function executeCollaborative(runId: string, manifest: SwarmManifest) {
  const task = manifest.task;
  const agents = manifest.agents ?? [];
  if (!task || agents.length === 0) throw new Error("Collaborative mode requires task and agents");

  const taskDefs: SwarmManifestTask[] = agents.map((agent) => ({
    id: `${agent}-collab`,
    agent,
    message: task,
  }));
  const taskRows = await createTaskRows(runId, taskDefs);
  if (await isCancelled(runId)) return;

  const results: Map<string, { output: string; exitCode: number | null }> = new Map();
  await Promise.all(
    taskRows.map(async (taskRow, idx) => {
      const result = await executeTask(runId, taskRow, task);
      results.set(taskDefs[idx].id, result);
    })
  );

  if (manifest.synthesize_agent && !(await isCancelled(runId))) {
    const synthesisOutput = await runSynthesis(runId, manifest.synthesize_agent, taskDefs.map((t) => t.id), results);
    await supabase.from("swarm_runs").update({ synthesis: synthesisOutput }).eq("id", runId);
  }

  if (!(await isCancelled(runId))) {
    await finalizeRun(runId, "completed");
  }
}

// ============================================================
// Helpers
// ============================================================

async function createTaskRows(runId: string, tasks: SwarmManifestTask[]): Promise<SwarmTaskRow[]> {
  const rows = tasks.map((t) => ({
    swarm_id: runId,
    task_id: t.id,
    agent_id: t.agent,
    message: t.message,
    status: "pending",
    output: "",
  }));

  const { data, error } = await supabase.from("swarm_tasks").insert(rows).select();
  if (error) throw new Error(`Failed to create task rows: ${error.message}`);
  return (data ?? []) as SwarmTaskRow[];
}

async function isAgentEnabled(agentId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("agent_controls")
      .select("enabled")
      .eq("agent_id", agentId)
      .single();
    if (error) return true; // default enabled if no row
    return data?.enabled !== false;
  } catch {
    return true;
  }
}

async function executeTask(
  runId: string,
  taskRow: SwarmTaskRow,
  message: string,
  timeout?: number
): Promise<{ output: string; exitCode: number | null }> {
  // Check if agent is enabled
  const enabled = await isAgentEnabled(taskRow.agent_id);
  if (!enabled) {
    const msg = `[Bridge] Agent "${taskRow.agent_id}" is DISABLED. Skipping task.`;
    console.log(`[swarm] ${msg}`);
    await supabase.from("swarm_tasks").update({
      status: "skipped",
      output: msg,
      completed_at: new Date().toISOString(),
    }).eq("id", taskRow.id);
    return { output: msg, exitCode: null };
  }

  // Check if run was cancelled before starting
  if (await isCancelled(runId)) {
    await supabase.from("swarm_tasks").update({ status: "skipped" }).eq("id", taskRow.id);
    return { output: "", exitCode: null };
  }

  // Mark running
  await supabase.from("swarm_tasks").update({
    status: "running",
    started_at: new Date().toISOString(),
  }).eq("id", taskRow.id);

  return new Promise((resolve) => {
    let output = "";
    let outputBuffer = "";
    let lastFlushedOutput = "";
    let flushTimer: ReturnType<typeof setInterval>;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let resolved = false;

    const flushOutput = async () => {
      if (outputBuffer.length === 0) return;
      const chunk = outputBuffer;
      outputBuffer = "";
      output += chunk;

      // Only write to DB if output actually changed (dedup)
      if (output !== lastFlushedOutput) {
        lastFlushedOutput = output;
        await supabase.from("swarm_tasks").update({ output }).eq("id", taskRow.id);
      }
    };

    flushTimer = setInterval(flushOutput, OUTPUT_FLUSH_MS);

    const finish = async (exitCode: number | null) => {
      if (resolved) return;
      resolved = true;

      if (timeoutTimer) clearTimeout(timeoutTimer);
      clearInterval(flushTimer);

      // Final flush
      if (outputBuffer.length > 0) {
        output += outputBuffer;
        outputBuffer = "";
      }

      const status = exitCode === 0 ? "completed" : "failed";
      await supabase.from("swarm_tasks").update({
        status,
        output,
        exit_code: exitCode,
        completed_at: new Date().toISOString(),
      }).eq("id", taskRow.id);

      // Remove child from tracking
      const children = runChildren.get(runId);
      if (children) {
        for (const c of children) {
          if (c.pid === child?.pid) {
            children.delete(c);
            break;
          }
        }
      }

      resolve({ output, exitCode });
    };

    let child: ChildProcess | null = null;

    try {
      child = runAgentWithFallback({
        agentId: taskRow.agent_id,
        message,
        onChunk: (text) => { outputBuffer += text; },
        onExit: (code) => finish(code),
      });

      // Track child for cancellation
      const children = runChildren.get(runId);
      if (children) children.add(child);

      // Timeout
      if (timeout && timeout > 0) {
        timeoutTimer = setTimeout(() => {
          console.log(`[swarm] Task ${taskRow.task_id} timed out after ${timeout}s`);
          child?.kill("SIGTERM");
          setTimeout(() => {
            if (!resolved) {
              child?.kill("SIGKILL");
              finish(124);
            }
          }, 5000);
        }, timeout * 1000);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[swarm] Task ${taskRow.task_id} spawn error:`, errorMsg);
      outputBuffer += `\n[Bridge Error] ${errorMsg}\n`;
      finish(1);
    }
  });
}

/**
 * Execute an intent task: use Cursor Cloud Agent to generate commands,
 * then optionally auto-execute them via OpenClaw.
 */
async function executeIntentTask(
  runId: string,
  taskRow: SwarmTaskRow,
  message: string,
  repo?: string,
  autoExecute?: boolean
): Promise<{ output: string; exitCode: number | null }> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    const err = "[Bridge] CURSOR_API_KEY not configured. Cannot run intent task.";
    console.error(`[swarm] ${err}`);
    await supabase.from("swarm_tasks").update({
      status: "failed",
      output: err,
      completed_at: new Date().toISOString(),
    }).eq("id", taskRow.id);
    return { output: err, exitCode: 1 };
  }

  await supabase.from("swarm_tasks").update({
    status: "running",
    started_at: new Date().toISOString(),
  }).eq("id", taskRow.id);

  try {
    // Dynamic import of the Cursor client
    const mod = await import("../lib/cursor-client.js");
    const CursorClient = mod.CursorClient;
    const cursor = new CursorClient(apiKey);

    const intentPrompt = `You are the Intent Layer for the XmetaV agent orchestration system.
Available agents: main, basedintern, akua.
Output ONLY a JSON array of command objects: [{"agent": "...", "message": "...", "description": "..."}]

Goal: ${message}`;

    // Launch Cursor agent
    const agent = await cursor.launchAgent({
      prompt: { text: intentPrompt },
      source: {
        repository: repo || "https://github.com/Metavibez4L/XmetaV",
      },
    });

    let output = `[Intent] Launched Cursor agent ${agent.id}\n`;
    await supabase.from("swarm_tasks").update({ output }).eq("id", taskRow.id);

    // Poll until finished
    const maxWait = 120_000; // 2 min
    const pollInterval = 5_000;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      if (await isCancelled(runId)) {
        try { await cursor.stopAgent(agent.id); } catch { /* */ }
        output += "[Intent] Cancelled\n";
        await supabase.from("swarm_tasks").update({ status: "skipped", output }).eq("id", taskRow.id);
        return { output, exitCode: null };
      }

      const status = await cursor.getStatus(agent.id);
      if (status.status === "FINISHED") {
        const convo = await cursor.getConversation(agent.id);
        // Find the last assistant message with JSON
        let commands: { agent: string; message: string; description: string }[] = [];
        for (let i = convo.messages.length - 1; i >= 0; i--) {
          if (convo.messages[i].type === "assistant_message") {
            try {
              const text = convo.messages[i].text.trim();
              const match = text.match(/\[[\s\S]*\]/);
              if (match) commands = JSON.parse(match[0]);
              else commands = JSON.parse(text);
              break;
            } catch { /* try previous message */ }
          }
        }

        output += `[Intent] Generated ${commands.length} commands:\n`;
        commands.forEach((c, i) => {
          output += `  ${i + 1}. [${c.agent}] ${c.description || c.message}\n`;
        });

        if (autoExecute && commands.length > 0) {
          output += "\n[Intent] Auto-executing commands...\n";
          for (const cmd of commands) {
            output += `\n--- Executing: [${cmd.agent}] ${cmd.message} ---\n`;
            await supabase.from("swarm_tasks").update({ output }).eq("id", taskRow.id);

            // Execute via OpenClaw
            const result = await executeTask(runId, {
              ...taskRow,
              agent_id: cmd.agent,
              task_id: `intent-${cmd.agent}`,
            }, cmd.message, 120);
            output += result.output + "\n";
          }
        }

        await supabase.from("swarm_tasks").update({
          status: "completed",
          output,
          exit_code: 0,
          completed_at: new Date().toISOString(),
        }).eq("id", taskRow.id);

        return { output, exitCode: 0 };
      }

      if (status.status === "STOPPED" || status.status === "FAILED") {
        output += `[Intent] Cursor agent ${status.status}\n`;
        await supabase.from("swarm_tasks").update({
          status: "failed",
          output,
          exit_code: 1,
          completed_at: new Date().toISOString(),
        }).eq("id", taskRow.id);
        return { output, exitCode: 1 };
      }

      await new Promise((r) => setTimeout(r, pollInterval));
    }

    // Timeout
    output += "[Intent] Timed out waiting for Cursor agent\n";
    try { await cursor.stopAgent(agent.id); } catch { /* */ }
    await supabase.from("swarm_tasks").update({
      status: "failed",
      output,
      exit_code: 124,
      completed_at: new Date().toISOString(),
    }).eq("id", taskRow.id);
    return { output, exitCode: 124 };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const output = `[Intent Error] ${errMsg}\n`;
    await supabase.from("swarm_tasks").update({
      status: "failed",
      output,
      exit_code: 1,
      completed_at: new Date().toISOString(),
    }).eq("id", taskRow.id);
    return { output, exitCode: 1 };
  }
}

function killRunChildren(runId: string) {
  const children = runChildren.get(runId);
  if (!children || children.size === 0) return;
  console.log(`[swarm] Killing ${children.size} child process(es) for cancelled run ${runId}`);
  for (const child of children) {
    try {
      child.kill("SIGTERM");
      setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* already dead */ }
      }, 3000);
    } catch { /* already dead */ }
  }
}

async function runSynthesis(
  runId: string,
  synthesizeAgent: string,
  taskIds: string[],
  results: Map<string, { output: string; exitCode: number | null }>
): Promise<string> {
  console.log(`[swarm] Running synthesis for run ${runId} using agent ${synthesizeAgent}`);

  const parts = taskIds.map((id) => {
    const res = results.get(id);
    return `--- Task: ${id} (exit: ${res?.exitCode ?? "?"}) ---\n${res?.output ?? "(no output)"}\n`;
  });

  const synthMessage = `You are synthesizing the results of a multi-agent swarm run. Here are the outputs from each task:\n\n${parts.join("\n")}\n\nPlease provide a consolidated summary of findings, reconcile any disagreements, highlight key takeaways, and provide actionable next steps.`;

  const { data: synthTask } = await supabase
    .from("swarm_tasks")
    .insert({
      swarm_id: runId,
      task_id: "__synthesis__",
      agent_id: synthesizeAgent,
      message: "Synthesis",
      status: "pending",
      output: "",
    })
    .select()
    .single();

  if (!synthTask) return "(synthesis failed to create task)";

  const result = await executeTask(runId, synthTask as SwarmTaskRow, synthMessage, 120);
  return result.output;
}

async function finalizeRun(runId: string, status: "completed" | "failed") {
  await supabase.from("swarm_runs").update({ status }).eq("id", runId);
  console.log(`[swarm] Run ${runId} finalized: ${status}`);
}

async function isCancelled(runId: string): Promise<boolean> {
  const { data } = await supabase
    .from("swarm_runs")
    .select("status")
    .eq("id", runId)
    .single();
  return data?.status === "cancelled";
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
