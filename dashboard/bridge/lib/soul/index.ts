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

// Dream Synthesis — fuse anchors into insight shards
export { runDreamSynthesis, getInsightShards, getAwakeningMessages, getSynthesisStats } from "./synthesis.js";
export type { InsightShard, ShardPatternType, ShardClass } from "./synthesis.js";

// Predictive Context Loading — anticipate what you'll need
export {
  runPredictiveAnalysis,
  getActivePredictions,
  consumePrediction,
  getPredictionStats,
  buildPredictiveInjection,
} from "./predictive.js";
export type { PredictiveContext, PredictionTrigger } from "./predictive.js";

// Memory Reforging — decay, archive, compress
export {
  runDecayPass,
  findReforgeTargets,
  reforgeMemories,
  autoReforge,
  recordMemoryAccess,
  isMemoryArchived,
  getReforgeStats,
  getRecentReforges,
} from "./reforge.js";
export type { DecayEntry, ReforgedCrystal } from "./reforge.js";

export type { ContextPacket, SoulConfig, DreamInsight, MemoryAssociation, MemoryQuery } from "./types.js";
export { DEFAULT_CONFIG } from "./types.js";
