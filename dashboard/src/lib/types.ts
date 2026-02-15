// ============================================================
// Shared TypeScript types for the XmetaV Control Plane
// ============================================================

export type CommandStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | "timeout";
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
  skills?: string[];
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
  retry_count: number;
  max_retries: number;
  timeout_seconds: number;
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

// ============================================================
// ERC-8004 Identity types
// ============================================================

/** On-chain agent identity from the ERC-8004 IdentityRegistry */
export interface ERC8004Identity {
  agentId: string;
  name: string;
  owner: string;
  agentWallet: string;
  tokenURI: string;
  registered: boolean;
  network: string;
  registryAddress: string;
  reputationAddress: string;
  basescanUrl: string;
}

/** Reputation summary from the ERC-8004 ReputationRegistry */
export interface ERC8004Reputation {
  count: number;
  score: string;
  decimals: number;
}

// ============================================================
// x402 Payment types
// ============================================================

export type X402PaymentStatus = "pending" | "completed" | "failed";

/** Row in the x402_payments table */
export interface X402Payment {
  id: string;
  command_id: string | null;
  session_id: string | null;
  agent_id: string;
  endpoint: string;
  amount: string;
  currency: string;
  network: string;
  tx_hash: string | null;
  payer_address: string | null;
  payee_address: string | null;
  status: X402PaymentStatus;
  created_at: string;
  updated_at: string;
}

/** Wallet info returned by /api/x402/wallet */
export interface X402WalletInfo {
  address: string | null;
  configured: boolean;
  network: string;
  budgetLimit: string;
}

// ============================================================
// Memory Crystal (Materia) types
// ============================================================

export type CrystalType = "milestone" | "decision" | "incident";
export type CrystalColor = "cyan" | "magenta" | "gold" | "red" | "green" | "purple" | "amber";
export type CrystalClass =
  | "anchor" | "knight" | "paladin" | "mage" | "sage"
  | "rogue" | "ninja" | "summoner" | "godhand";

/** Row in the memory_crystals table */
export interface MemoryCrystal {
  id: string;
  memory_id: string | null;
  anchor_tx_hash: string | null;
  ipfs_cid: string | null;
  agent_id: string;
  name: string;
  description: string | null;
  crystal_type: CrystalType;
  crystal_color: CrystalColor;
  star_rating: number;
  xp: number;
  level: number;
  class: CrystalClass;
  effects: Record<string, number>;
  equipped_by: string | null;
  is_fused: boolean;
  is_legendary: boolean;
  created_at: string;
  evolved_at: string | null;
  last_used_at: string | null;
}

/** Row in the memory_fusions table */
export interface MemoryFusion {
  id: string;
  crystal_a_id: string;
  crystal_b_id: string;
  result_crystal_id: string | null;
  recipe_name: string;
  recipe_key: string;
  result_effects: Record<string, number>;
  result_star: number;
  fused_by: string;
  fused_at: string;
}

/** Row in the memory_summons table */
export interface MemorySummon {
  id: string;
  crystal_id: string;
  summoned_by: string;
  task_context: string | null;
  context_boost: number;
  xp_gained: number;
  arena_effect: string;
  summoned_at: string;
}

/** Row in the limit_breaks table */
export interface LimitBreak {
  id: string;
  trigger_event: string;
  trigger_agent: string;
  legendary_crystal_id: string | null;
  power_boost: number;
  agents_affected: string[];
  anchor_count_at_trigger: number;
  active: boolean;
  activated_at: string;
  resolved_at: string | null;
}

/** Row in the memory_achievements table */
export interface MemoryAchievement {
  id: string;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  tier: "bronze" | "silver" | "gold" | "legendary";
  requirement: Record<string, number>;
  unlocked: boolean;
  progress: number;
  target: number;
  unlocked_at: string | null;
  created_at: string;
}

/** Row in the daily_quests table */
export interface DailyQuest {
  id: string;
  quest_date: string;
  title: string;
  description: string | null;
  quest_type: string;
  target: number;
  progress: number;
  completed: boolean;
  xp_reward: number;
  completed_at: string | null;
  created_at: string;
}

// ============================================================
// Agent fleet
// ============================================================

/** Known agent fleet (matches OpenClaw config) */
export const KNOWN_AGENTS: Omit<AgentInfo, "status">[] = [
  {
    id: "main",
    name: "Main Orchestrator",
    workspace: "~/.openclaw/workspace",
    tools: "full",
    model: "ollama/kimi-k2.5:cloud",
    skills: ["wallets"],
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
    model: "ollama/kimi-k2.5:cloud",
  },
  {
    id: "briefing",
    name: "Briefing (Context Curator)",
    workspace: "/home/manifest/briefing",
    tools: "coding",
    model: "ollama/kimi-k2.5:cloud",
  },
  {
    id: "oracle",
    name: "Oracle (On-Chain Intel)",
    workspace: "/home/manifest/oracle",
    tools: "coding",
    model: "ollama/kimi-k2.5:cloud",
    skills: ["gas", "l2s"],
  },
  {
    id: "alchemist",
    name: "Alchemist (Tokenomics)",
    workspace: "/home/manifest/alchemist",
    tools: "coding",
    model: "ollama/kimi-k2.5:cloud",
  },
  {
    id: "web3dev",
    name: "Web3Dev (Blockchain)",
    workspace: "/home/manifest/web3dev",
    tools: "coding",
    model: "ollama/kimi-k2.5:cloud",
    skills: ["tools", "l2s", "orchestration", "addresses", "concepts", "security", "standards", "frontend-ux", "frontend-playbook", "building-blocks"],
  },
  {
    id: "soul",
    name: "Soul (Memory Orchestrator)",
    workspace: "/home/manifest/soul",
    tools: "coding",
    model: "ollama/kimi-k2.5:cloud",
    skills: ["recall", "dream", "inject"],
  },
];
