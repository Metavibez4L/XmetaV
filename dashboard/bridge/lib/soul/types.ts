/**
 * Soul Agent — Type definitions
 *
 * The memory orchestrator for the XmetaV fleet.
 * Soul sits between task dispatch and agent execution,
 * curating context, building associations, and consolidating
 * memories during idle periods.
 */

// ---- Memory Associations ----

export type AssociationType = "causal" | "similar" | "sequential" | "related";

export interface MemoryAssociation {
  id?: string;
  memory_id: string;
  related_memory_id: string;
  association_type: AssociationType;
  strength: number; // 0.0 – 1.0
  created_at?: string;
}

// ---- Memory Queries ----

export interface MemoryQuery {
  id?: string;
  agent_id: string;
  task_keywords: string[];
  retrieved_memory_ids: string[];
  relevance_scores: number[];
  query_time?: string;
}

// ---- Dream Insights ----

export interface DreamInsight {
  id?: string;
  insight: string;
  source_memories: string[];
  category: "pattern" | "recommendation" | "summary" | "correction";
  confidence: number; // 0.0 – 1.0
  generated_at?: string;
}

// ---- Context Packet ----

/** What Psyche assembles for pre-dispatch injection */
export interface ContextPacket {
  memories: Array<{
    id: string;
    content: string;
    kind: string;
    relevance: number;
    age_hours: number;
  }>;
  insights: Array<{
    insight: string;
    confidence: number;
  }>;
  patterns: string[];
  total_anchors: number;
}

// ---- Psyche Config ----

export interface PsycheConfig {
  /** Max memories to retrieve per context query */
  maxRetrievalCount: number;
  /** Max characters in injected context */
  maxContextChars: number;
  /** Hours of idle time before dream mode triggers */
  dreamIdleThresholdHours: number;
  /** Minimum association strength to include in context */
  minAssociationStrength: number;
  /** How many recent memories to scan for association building */
  associationScanWindow: number;
}

export const DEFAULT_CONFIG: PsycheConfig = {
  maxRetrievalCount: 10,
  maxContextChars: 3000,
  dreamIdleThresholdHours: 6,
  minAssociationStrength: 0.3,
  associationScanWindow: 50,
};
