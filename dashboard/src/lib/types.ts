// ============================================================
// Shared TypeScript types for the XmetaV Control Plane
// ============================================================

export type CommandStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type AgentStatus = "online" | "idle" | "busy" | "offline";

export interface AgentControl {
  agent_id: string;
  enabled: boolean;
  updated_by: string | null;
  updated_at: string;
}

/** Row in the agent_commands table */
export interface AgentCommand {
  id: string;
  agent_id: string;
  message: string;
  status: CommandStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Row in the agent_responses table */
export interface AgentResponse {
  id: string;
  command_id: string;
  content: string;
  is_final: boolean;
  created_at: string;
}

/** Row in the agent_sessions table */
export interface AgentSession {
  id: string;
  agent_id: string;
  status: AgentStatus;
  hostname: string | null;
  started_at: string;
  last_heartbeat: string;
}

/** Agent definition from OpenClaw config */
export interface AgentInfo {
  id: string;
  name: string;
  workspace: string;
  tools: string;
  model: string;
  status: AgentStatus;
}

// ============================================================
// Swarm types
// ============================================================

export type SwarmMode = "parallel" | "pipeline" | "collaborative";
export type SwarmRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type SwarmTaskStatus = "pending" | "running" | "completed" | "failed" | "skipped";

/** A single task definition within a swarm manifest */
export interface SwarmManifestTask {
  id: string;
  agent: string;
  message: string;
  depends_on?: string;
  timeout?: number;
}

/** The full manifest stored in swarm_runs.manifest */
export interface SwarmManifest {
  mode: SwarmMode;
  /** For parallel/pipeline mode */
  tasks?: SwarmManifestTask[];
  /** For collaborative mode */
  task?: string;
  agents?: string[];
  synthesize_agent?: string;
  synthesize?: boolean;
  on_failure?: "stop" | "continue";
}

/** Row in the swarm_runs table */
export interface SwarmRun {
  id: string;
  name: string;
  mode: SwarmMode;
  status: SwarmRunStatus;
  manifest: SwarmManifest;
  synthesis: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Row in the swarm_tasks table */
export interface SwarmTask {
  id: string;
  swarm_id: string;
  task_id: string;
  agent_id: string;
  message: string;
  status: SwarmTaskStatus;
  output: string;
  exit_code: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

/** Template descriptor (read from disk) */
export interface SwarmTemplate {
  filename: string;
  name: string;
  mode: SwarmMode;
  description: string;
  manifest: SwarmManifest;
}

// ============================================================
// Intent Layer types (Cursor Cloud Agents as reasoning layer)
// ============================================================

export type IntentSessionStatus =
  | "THINKING"
  | "READY"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

/** A single generated command from the intent layer */
export interface IntentCommand {
  agent: string;
  message: string;
  description: string;
}

/** Row in the intent_sessions table */
export interface IntentSession {
  id: string;
  cursor_agent_id: string;
  goal: string;
  repository: string;
  model: string | null;
  status: IntentSessionStatus;
  commands: IntentCommand[];
  executed_command_ids: string[] | null;
  conversation: IntentConversationMessage[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** A message in the intent conversation */
export interface IntentConversationMessage {
  id: string;
  type: "user_message" | "assistant_message";
  text: string;
}

/** Known agent fleet (matches OpenClaw config) */
export const KNOWN_AGENTS: Omit<AgentInfo, "status">[] = [
  {
    id: "main",
    name: "Main Orchestrator",
    workspace: "~/.openclaw/workspace",
    tools: "full",
    model: "ollama/kimi-k2.5:cloud",
  },
  {
    id: "akua",
    name: "Akua (CRE/DTA/Solidity)",
    workspace: "/home/manifest/akua",
    tools: "coding",
    model: "ollama/kimi-k2.5:cloud",
  },
  {
    id: "basedintern",
    name: "BasedIntern (Repo)",
    workspace: "/home/manifest/basedintern",
    tools: "coding",
    model: "ollama/qwen2.5:7b-instruct",
  },
];
