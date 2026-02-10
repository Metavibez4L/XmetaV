import { supabase } from "../lib/supabase.js";
import { runAgent } from "../lib/openclaw.js";
import type { ChildProcess } from "child_process";

// ============================================================
// Swarm Executor -- handles swarm_runs orchestration
// ============================================================

interface SwarmManifestTask {
  id: string;
  agent: string;
  message: string;
  depends_on?: string;
  timeout?: number;
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
const OUTPUT_FLUSH_MS = 1000;

/** Track active swarm run IDs to prevent duplicate execution */
const activeSwarms = new Set<string>();

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
  }
}

// ============================================================
// Mode: Parallel
// ============================================================

async function executeParallel(runId: string, manifest: SwarmManifest) {
  const tasks = manifest.tasks ?? [];
  if (tasks.length === 0) throw new Error("No tasks defined in manifest");

  // Create task rows
  const taskRows = await createTaskRows(runId, tasks);

  // Check if cancelled before execution
  if (await isCancelled(runId)) return;

  // Run tasks with concurrency limit
  const results: Map<string, { output: string; exitCode: number | null }> = new Map();
  const chunks = chunkArray(taskRows, MAX_CONCURRENT);

  for (const chunk of chunks) {
    if (await isCancelled(runId)) return;

    await Promise.all(
      chunk.map(async (taskRow) => {
        const taskDef = tasks.find((t) => t.id === taskRow.task_id);
        const result = await executeTask(taskRow, taskDef?.message ?? taskRow.message, taskDef?.timeout);
        results.set(taskRow.task_id, result);
      })
    );

    // Check for failures if on_failure === "stop"
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
    const synthesisOutput = await runSynthesis(
      runId,
      manifest.synthesize_agent,
      tasks.map((t) => t.id),
      results
    );
    await supabase.from("swarm_runs").update({ synthesis: synthesisOutput }).eq("id", runId);
  }

  await finalizeRun(runId, "completed");
}

// ============================================================
// Mode: Pipeline
// ============================================================

async function executePipeline(runId: string, manifest: SwarmManifest) {
  const tasks = manifest.tasks ?? [];
  if (tasks.length === 0) throw new Error("No tasks defined in manifest");

  // Create task rows
  const taskRows = await createTaskRows(runId, tasks);

  let previousOutput = "";

  for (let i = 0; i < taskRows.length; i++) {
    if (await isCancelled(runId)) return;

    const taskRow = taskRows[i];
    const taskDef = tasks[i];

    // For pipeline, prepend previous output as context
    let message = taskDef.message;
    if (previousOutput && i > 0) {
      message = `[Context from previous step "${tasks[i - 1].id}"]:\n${previousOutput}\n\n[Your task]:\n${message}`;
    }

    const result = await executeTask(taskRow, message, taskDef.timeout);
    previousOutput = result.output;

    // Stop on failure
    if (manifest.on_failure === "stop" && result.exitCode !== 0 && result.exitCode !== null) {
      // Skip remaining tasks
      for (let j = i + 1; j < taskRows.length; j++) {
        await supabase
          .from("swarm_tasks")
          .update({ status: "skipped" })
          .eq("id", taskRows[j].id);
      }
      await finalizeRun(runId, "failed");
      return;
    }
  }

  await finalizeRun(runId, "completed");
}

// ============================================================
// Mode: Collaborative
// ============================================================

async function executeCollaborative(runId: string, manifest: SwarmManifest) {
  const task = manifest.task;
  const agents = manifest.agents ?? [];
  if (!task || agents.length === 0) throw new Error("Collaborative mode requires task and agents");

  // Create a task row for each agent
  const taskDefs: SwarmManifestTask[] = agents.map((agent) => ({
    id: `${agent}-collab`,
    agent,
    message: task,
  }));
  const taskRows = await createTaskRows(runId, taskDefs);

  if (await isCancelled(runId)) return;

  // Run all agents concurrently on the same task
  const results: Map<string, { output: string; exitCode: number | null }> = new Map();
  await Promise.all(
    taskRows.map(async (taskRow, idx) => {
      const result = await executeTask(taskRow, task);
      results.set(taskDefs[idx].id, result);
    })
  );

  // Synthesis step
  if (manifest.synthesize_agent) {
    const synthesisOutput = await runSynthesis(
      runId,
      manifest.synthesize_agent,
      taskDefs.map((t) => t.id),
      results
    );
    await supabase.from("swarm_runs").update({ synthesis: synthesisOutput }).eq("id", runId);
  }

  await finalizeRun(runId, "completed");
}

// ============================================================
// Helpers
// ============================================================

async function createTaskRows(
  runId: string,
  tasks: SwarmManifestTask[]
): Promise<SwarmTaskRow[]> {
  const rows = tasks.map((t) => ({
    swarm_id: runId,
    task_id: t.id,
    agent_id: t.agent,
    message: t.message,
    status: "pending",
    output: "",
  }));

  const { data, error } = await supabase
    .from("swarm_tasks")
    .insert(rows)
    .select();

  if (error) throw new Error(`Failed to create task rows: ${error.message}`);
  return (data ?? []) as SwarmTaskRow[];
}

async function executeTask(
  taskRow: SwarmTaskRow,
  message: string,
  timeout?: number
): Promise<{ output: string; exitCode: number | null }> {
  // Mark running
  await supabase
    .from("swarm_tasks")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", taskRow.id);

  return new Promise((resolve) => {
    let output = "";
    let outputBuffer = "";
    let flushTimer: ReturnType<typeof setInterval>;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let resolved = false;

    const flushOutput = async () => {
      if (outputBuffer.length === 0) return;
      const chunk = outputBuffer;
      outputBuffer = "";
      output += chunk;

      // Update task output in DB (append)
      await supabase
        .from("swarm_tasks")
        .update({ output })
        .eq("id", taskRow.id);
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
      await supabase
        .from("swarm_tasks")
        .update({
          status,
          output,
          exit_code: exitCode,
          completed_at: new Date().toISOString(),
        })
        .eq("id", taskRow.id);

      resolve({ output, exitCode });
    };

    try {
      const child: ChildProcess = runAgent({
        agentId: taskRow.agent_id,
        message,
        onChunk: (text) => {
          outputBuffer += text;
        },
        onExit: (code) => finish(code),
      });

      // Timeout
      if (timeout && timeout > 0) {
        timeoutTimer = setTimeout(() => {
          console.log(`[swarm] Task ${taskRow.task_id} timed out after ${timeout}s`);
          child.kill("SIGTERM");
          setTimeout(() => {
            if (!resolved) {
              child.kill("SIGKILL");
              finish(124); // 124 = timeout exit code
            }
          }, 5000);
        }, timeout * 1000);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      outputBuffer += `\n[Bridge Error] ${errorMsg}\n`;
      finish(1);
    }
  });
}

async function runSynthesis(
  runId: string,
  synthesizeAgent: string,
  taskIds: string[],
  results: Map<string, { output: string; exitCode: number | null }>
): Promise<string> {
  console.log(`[swarm] Running synthesis for run ${runId} using agent ${synthesizeAgent}`);

  // Build synthesis prompt
  const parts = taskIds.map((id) => {
    const res = results.get(id);
    return `--- Task: ${id} (exit: ${res?.exitCode ?? "?"}) ---\n${res?.output ?? "(no output)"}\n`;
  });

  const synthMessage = `You are synthesizing the results of a multi-agent swarm run. Here are the outputs from each task:\n\n${parts.join("\n")}\n\nPlease provide a consolidated summary of findings, reconcile any disagreements, highlight key takeaways, and provide actionable next steps.`;

  // Create a synthesis task row
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

  if (!synthTask) {
    return "(synthesis failed to create task)";
  }

  const result = await executeTask(synthTask as SwarmTaskRow, synthMessage, 120);
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
