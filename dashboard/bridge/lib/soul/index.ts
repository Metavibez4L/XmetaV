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
export { maybeStartDream, getRelevantInsights } from "./dream.js";
export type { ContextPacket, PsycheConfig, DreamInsight, MemoryAssociation, MemoryQuery } from "./types.js";
export { DEFAULT_CONFIG } from "./types.js";
