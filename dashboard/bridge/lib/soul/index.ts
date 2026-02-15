/**
 * Soul Agent — The Memory Orchestrator
 *
 * Entry point for all Soul functionality. Import from here.
 *
 * Usage:
 *   import { buildSoulContext, processNewMemory, maybeStartDream } from "../lib/soul/index.js";
 */

export { buildSoulContext, processNewMemory, buildContextPacket } from "./context.js";
export { retrieveRelevantMemories, extractKeywords } from "./retrieval.js";
export { buildAssociations, reinforceAssociation } from "./associations.js";
export { maybeStartDream, getRelevantInsights, triggerManualDream } from "./dream.js";
export {
  getActiveProposals,
  approveManifest,
  rejectManifest,
  getManifestationStats,
  getRecentSessions,
} from "./dream-proposals.js";
export type {
  DreamManifestation,
  DreamSession,
  ManifestationCategory,
  ManifestationStatus,
} from "./dream-proposals.js";
export type { ContextPacket, SoulConfig, DreamInsight, MemoryAssociation, MemoryQuery } from "./types.js";
export { DEFAULT_CONFIG } from "./types.js";
