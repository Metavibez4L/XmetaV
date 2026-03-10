/**
 * Scholar Research Engine — Public API
 *
 * Exports for bridge integration.
 */

export { startScholar, stopScholar, getScholarStats, researchDomain } from "./research-loop.js";
export { scoreRelevance, isDuplicate } from "./scorer.js";
export {
  RESEARCH_DOMAINS,
  DEFAULT_SCHOLAR_CONFIG,
  type ResearchDomain,
  type ResearchFinding,
  type ScholarConfig,
} from "./types.js";
