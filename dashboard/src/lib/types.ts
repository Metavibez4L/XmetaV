// ============================================================
// Shared TypeScript types for the XmetaV Control Plane
// ============================================================

export type CommandStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type AgentStatus = "online" | "idle" | "busy" | "offline";

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
