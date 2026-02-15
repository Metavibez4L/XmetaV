/**
 * Soul Agent — Lucid Dream Proposal Engine
 *
 * Phase 5: Autonomous Evolution
 *
 * During lucid dream cycles, Soul analyzes patterns across
 * memories, associations, insights, and crystals to generate
 * actionable proposals (manifestations). These can be:
 *
 *   - Auto-executed (high confidence ≥ 0.8 + low-risk categories)
 *   - Proposed for approval (medium confidence or risky actions)
 *   - Logged as patterns (low confidence observations)
 *
 * Manifestation categories:
 *   fusion       — Fuse crystals/memories
 *   association  — Self-modify association graph
 *   pricing      — x402 pricing suggestions
 *   skill        — Agent skill recommendations
 *   meeting      — Autonomous meeting triggers
 *   pattern      — Detected pattern worth highlighting
 *   correction   — Error pattern requiring intervention
 */

import { supabase } from "../supabase.js";
import { extractKeywords } from "./retrieval.js";
import type { DreamInsight, MemoryAssociation } from "./types.js";

/* ── Types ─────────────────────────────────────────────────── */

export type ManifestationCategory =
  | "fusion"
  | "association"
  | "pricing"
  | "skill"
  | "meeting"
  | "pattern"
  | "correction";

export type ManifestationStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "executed"
  | "auto_executed"
  | "expired";

export interface DreamManifestation {
  id?: string;
  title: string;
  description: string;
  category: ManifestationCategory;
  confidence: number;
  priority: number; // 1-5 (5 = highest)
  source_memories: string[];
  source_insights: string[];
  proposed_action: Record<string, unknown>;
  status: ManifestationStatus;
  dream_session_id?: string;
  created_at?: string;
}

export interface DreamSession {
  id?: string;
  started_at?: string;
  ended_at?: string;
  memories_scanned: number;
  clusters_found: number;
  insights_generated: number;
  proposals_created: number;
  auto_executed: number;
  trigger_type: "idle" | "manual" | "scheduled";
  fleet_idle_hours?: number;
  status: "dreaming" | "completed" | "interrupted";
}

/** Categories safe for auto-execution at high confidence */
const AUTO_EXEC_CATEGORIES: ManifestationCategory[] = [
  "association",
  "pattern",
];

/** Minimum confidence for auto-execute */
const AUTO_EXEC_THRESHOLD = 0.8;

/* ── Dream Session Management ──────────────────────────────── */

/**
 * Start a new dream session. Returns the session ID.
 */
export async function startDreamSession(
  triggerType: "idle" | "manual" | "scheduled" = "idle",
  fleetIdleHours?: number
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("soul_dream_sessions")
      .insert({
        trigger_type: triggerType,
        fleet_idle_hours: fleetIdleHours,
        status: "dreaming",
        memories_scanned: 0,
        clusters_found: 0,
        insights_generated: 0,
        proposals_created: 0,
        auto_executed: 0,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[soul:lucid] Failed to start dream session:", error.message);
      return "unknown";
    }
    return data.id;
  } catch {
    return "unknown";
  }
}

/**
 * Complete a dream session with final stats.
 */
export async function endDreamSession(
  sessionId: string,
  stats: Partial<DreamSession>
): Promise<void> {
  try {
    await supabase
      .from("soul_dream_sessions")
      .update({
        ended_at: new Date().toISOString(),
        status: "completed",
        ...stats,
      })
      .eq("id", sessionId);
  } catch {
    // Non-fatal
  }
}

/* ── Proposal Generation ──────────────────────────────────── */

interface MemoryRecord {
  id: string;
  agent_id: string;
  kind: string;
  content: string;
  created_at: string;
  source?: string;
}

interface MemoryCluster {
  keywords: string[];
  memories: MemoryRecord[];
  agents: string[];
}

/**
 * Generate lucid dream proposals from dream analysis.
 *
 * Called after runDreamCycle generates insights.
 * Analyzes clusters, associations, crystals, and error patterns
 * to produce actionable manifestations.
 */
export async function generateProposals(
  clusters: MemoryCluster[],
  insights: DreamInsight[],
  sessionId: string
): Promise<DreamManifestation[]> {
  const proposals: DreamManifestation[] = [];

  // 1. Association reinforcement proposals
  const assocProposals = await analyzeAssociationOpportunities(clusters);
  proposals.push(...assocProposals);

  // 2. Error correction proposals
  const corrections = analyzeErrorPatterns(clusters, insights);
  proposals.push(...corrections);

  // 3. Meeting proposals (cross-agent patterns)
  const meetings = analyzeCrossAgentPatterns(clusters);
  proposals.push(...meetings);

  // 4. Crystal fusion proposals
  const fusions = await analyzeFusionOpportunities();
  proposals.push(...fusions);

  // 5. Pattern/skill proposals from insights
  const patterns = analyzeInsightActions(insights);
  proposals.push(...patterns);

  // 6. Pricing proposals from usage patterns
  const pricing = await analyzePricingPatterns();
  proposals.push(...pricing);

  // Set session ID on all proposals
  for (const p of proposals) {
    p.dream_session_id = sessionId;
  }

  // Persist proposals
  if (proposals.length > 0) {
    await persistManifestations(proposals);
  }

  // Auto-execute high-confidence safe proposals
  const autoExecCount = await autoExecuteProposals(sessionId);

  console.log(
    `[soul:lucid] Generated ${proposals.length} proposals, auto-executed ${autoExecCount}`
  );

  return proposals;
}

/* ── Analysis Functions ────────────────────────────────────── */

/**
 * Detect associations that should be reinforced or created.
 */
async function analyzeAssociationOpportunities(
  clusters: MemoryCluster[]
): Promise<DreamManifestation[]> {
  const proposals: DreamManifestation[] = [];

  for (const cluster of clusters) {
    if (cluster.memories.length < 3) continue;

    // Check for memories in the same cluster that lack associations
    const memIds = cluster.memories.map((m) => m.id);

    try {
      const { data: existing } = await supabase
        .from("memory_associations")
        .select("memory_id, related_memory_id, strength")
        .in("memory_id", memIds.slice(0, 10));

      const existingPairs = new Set(
        (existing ?? []).map((a: MemoryAssociation) => `${a.memory_id}:${a.related_memory_id}`)
      );

      // Find unlinked pairs within the cluster
      let missingLinks = 0;
      const samplePair: string[] = [];

      for (let i = 0; i < Math.min(memIds.length, 8); i++) {
        for (let j = i + 1; j < Math.min(memIds.length, 8); j++) {
          const key1 = `${memIds[i]}:${memIds[j]}`;
          const key2 = `${memIds[j]}:${memIds[i]}`;
          if (!existingPairs.has(key1) && !existingPairs.has(key2)) {
            missingLinks++;
            if (samplePair.length === 0) {
              samplePair.push(memIds[i], memIds[j]);
            }
          }
        }
      }

      // Also find weak existing associations worth reinforcing
      const weakAssociations = (existing ?? []).filter(
        (a: MemoryAssociation) => a.strength < 0.4 && a.strength >= 0.15
      );

      if (missingLinks >= 2) {
        proposals.push({
          title: `Link ${missingLinks} unconnected memories`,
          description: `Cluster [${cluster.keywords.slice(0, 4).join(", ")}] has ${cluster.memories.length} memories but ${missingLinks} pairs lack associations. Creating links would strengthen this knowledge cluster.`,
          category: "association",
          confidence: Math.min(0.9, 0.5 + missingLinks * 0.05),
          priority: Math.min(4, 2 + Math.floor(missingLinks / 3)),
          source_memories: memIds.slice(0, 5),
          source_insights: [],
          proposed_action: {
            type: "create_associations",
            memory_pairs: samplePair.length >= 2
              ? [[samplePair[0], samplePair[1]]]
              : [],
            cluster_keywords: cluster.keywords.slice(0, 5),
            missing_count: missingLinks,
          },
          status: "proposed",
        });
      }

      if (weakAssociations.length >= 2) {
        proposals.push({
          title: `Reinforce ${weakAssociations.length} weak connections`,
          description: `Found ${weakAssociations.length} associations in [${cluster.keywords.slice(0, 3).join(", ")}] cluster with strength <0.4. Dream analysis confirms these memories are genuinely related.`,
          category: "association",
          confidence: 0.75,
          priority: 2,
          source_memories: weakAssociations.map((a: MemoryAssociation) => a.memory_id),
          source_insights: [],
          proposed_action: {
            type: "reinforce_associations",
            associations: weakAssociations.map((a: MemoryAssociation) => ({
              memory_id: a.memory_id,
              related_memory_id: a.related_memory_id,
              current_strength: a.strength,
              proposed_boost: 0.15,
            })),
          },
          status: "proposed",
        });
      }
    } catch {
      // Non-fatal
    }
  }

  return proposals;
}

/**
 * Detect recurring error patterns and propose corrections.
 */
function analyzeErrorPatterns(
  clusters: MemoryCluster[],
  insights: DreamInsight[]
): DreamManifestation[] {
  const proposals: DreamManifestation[] = [];

  // Find clusters dominated by errors
  for (const cluster of clusters) {
    const errors = cluster.memories.filter((m) => m.kind === "error");
    const total = cluster.memories.length;

    if (errors.length >= 3 && errors.length / total > 0.5) {
      const agentIds = [...new Set(errors.map((e) => e.agent_id))];
      proposals.push({
        title: `Recurring error: ${cluster.keywords.slice(0, 3).join(" ")}`,
        description: `${errors.length}/${total} memories in [${cluster.keywords.slice(0, 4).join(", ")}] are errors. Agents affected: ${agentIds.join(", ")}. This pattern suggests a systematic issue that needs attention.`,
        category: "correction",
        confidence: Math.min(0.95, 0.5 + errors.length * 0.1),
        priority: Math.min(5, 3 + Math.floor(errors.length / 2)),
        source_memories: errors.map((e) => e.id).slice(0, 5),
        source_insights: [],
        proposed_action: {
          type: "flag_error_pattern",
          error_keywords: cluster.keywords.slice(0, 5),
          affected_agents: agentIds,
          error_count: errors.length,
          sample_errors: errors.slice(0, 3).map((e) => e.content.slice(0, 200)),
        },
        status: "proposed",
      });
    }
  }

  // Also check correction insights
  const correctionInsights = insights.filter((i) => i.category === "correction");
  for (const ci of correctionInsights) {
    if (ci.confidence >= 0.6) {
      proposals.push({
        title: "Dream insight: correction needed",
        description: ci.insight,
        category: "correction",
        confidence: ci.confidence,
        priority: 4,
        source_memories: ci.source_memories,
        source_insights: ci.id ? [ci.id] : [],
        proposed_action: {
          type: "apply_correction",
          insight_text: ci.insight,
        },
        status: "proposed",
      });
    }
  }

  return proposals;
}

/**
 * Detect cross-agent patterns and propose meetings.
 */
function analyzeCrossAgentPatterns(
  clusters: MemoryCluster[]
): DreamManifestation[] {
  const proposals: DreamManifestation[] = [];

  for (const cluster of clusters) {
    const uniqueAgents = [...new Set(cluster.agents)].filter(
      (a) => a !== "_shared" && a !== "bridge"
    );

    // Multi-agent cluster with significant activity = meeting opportunity
    if (uniqueAgents.length >= 2 && cluster.memories.length >= 4) {
      const topic = cluster.keywords.slice(0, 3).join(" + ");
      proposals.push({
        title: `Meeting: ${uniqueAgents.slice(0, 3).join(" × ")}`,
        description: `${uniqueAgents.length} agents share significant memory overlap around [${topic}]. A coordinated meeting could align their work and reduce duplicate effort.`,
        category: "meeting",
        confidence: Math.min(0.85, 0.4 + uniqueAgents.length * 0.15),
        priority: Math.min(4, 1 + uniqueAgents.length),
        source_memories: cluster.memories.map((m) => m.id).slice(0, 5),
        source_insights: [],
        proposed_action: {
          type: "trigger_meeting",
          agents: uniqueAgents,
          topic,
          urgency: cluster.memories.length >= 8 ? "high" : "normal",
          context_keywords: cluster.keywords.slice(0, 6),
        },
        status: "proposed",
      });
    }
  }

  return proposals;
}

/**
 * Analyze crystal inventory for fusion opportunities.
 */
async function analyzeFusionOpportunities(): Promise<DreamManifestation[]> {
  const proposals: DreamManifestation[] = [];

  try {
    // Get unfused crystals
    const { data: crystals } = await supabase
      .from("memory_crystals")
      .select("id, memory_id, crystal_type, star_rating, level, class, effects, is_fused")
      .eq("is_fused", false)
      .order("star_rating", { ascending: false })
      .limit(50);

    if (!crystals || crystals.length < 2) return proposals;

    // Group crystals by class for fusion matching
    const byClass = new Map<string, typeof crystals>();
    for (const c of crystals) {
      const cls = c.class || "unknown";
      if (!byClass.has(cls)) byClass.set(cls, []);
      byClass.get(cls)!.push(c);
    }

    // Find same-class fusion pairs
    for (const [cls, classCrystals] of byClass) {
      if (classCrystals.length < 2) continue;

      // Propose fusing the top 2 by star rating
      const [a, b] = classCrystals;
      proposals.push({
        title: `Fuse ${cls} crystals (★${a.star_rating} + ★${b.star_rating})`,
        description: `Two ${cls}-class crystals detected. Fusion could yield a higher-tier crystal with combined effects. Crystal types: ${a.crystal_type}, ${b.crystal_type}.`,
        category: "fusion",
        confidence: 0.7,
        priority: 2,
        source_memories: [a.memory_id, b.memory_id].filter(Boolean),
        source_insights: [],
        proposed_action: {
          type: "fuse_crystals",
          crystal_a: a.id,
          crystal_b: b.id,
          crystal_a_type: a.crystal_type,
          crystal_b_type: b.crystal_type,
          expected_class: cls,
        },
        status: "proposed",
      });
    }

    // Find cross-class fusion pairs (legendary potential)
    const classes = [...byClass.keys()].filter((k) => k !== "unknown");
    if (classes.length >= 2) {
      const classA = byClass.get(classes[0])![0];
      const classB = byClass.get(classes[1])![0];
      proposals.push({
        title: `Cross-class fusion: ${classes[0]} × ${classes[1]}`,
        description: `Crystals from different classes (${classes[0]}, ${classes[1]}) could create a legendary hybrid. This is experimental but high-reward.`,
        category: "fusion",
        confidence: 0.5,
        priority: 3,
        source_memories: [classA.memory_id, classB.memory_id].filter(Boolean),
        source_insights: [],
        proposed_action: {
          type: "fuse_crystals",
          crystal_a: classA.id,
          crystal_b: classB.id,
          cross_class: true,
          class_a: classes[0],
          class_b: classes[1],
        },
        status: "proposed",
      });
    }
  } catch {
    // Non-fatal — crystals table may not exist
  }

  return proposals;
}

/**
 * Convert insights into actionable proposals.
 */
function analyzeInsightActions(
  insights: DreamInsight[]
): DreamManifestation[] {
  const proposals: DreamManifestation[] = [];

  for (const insight of insights) {
    if (insight.category === "correction") continue; // Handled by analyzeErrorPatterns

    if (insight.category === "pattern" && insight.confidence >= 0.6) {
      proposals.push({
        title: "Emerging pattern detected",
        description: insight.insight,
        category: "pattern",
        confidence: insight.confidence,
        priority: 2,
        source_memories: insight.source_memories,
        source_insights: insight.id ? [insight.id] : [],
        proposed_action: {
          type: "highlight_pattern",
          pattern_text: insight.insight,
        },
        status: "proposed",
      });
    }

    if (insight.category === "summary" && insight.confidence >= 0.5) {
      // High-activity areas may benefit from dedicated agent skills
      const keywords = extractKeywords(insight.insight);
      if (keywords.length >= 3) {
        proposals.push({
          title: `Skill opportunity: ${keywords.slice(0, 2).join(" ")}`,
          description: `Frequent activity around [${keywords.slice(0, 4).join(", ")}] suggests agents could benefit from a specialized skill or workflow in this area.`,
          category: "skill",
          confidence: Math.min(0.7, insight.confidence),
          priority: 2,
          source_memories: insight.source_memories,
          source_insights: insight.id ? [insight.id] : [],
          proposed_action: {
            type: "suggest_skill",
            skill_keywords: keywords.slice(0, 5),
            activity_summary: insight.insight,
          },
          status: "proposed",
        });
      }
    }
  }

  return proposals;
}

/**
 * Analyze x402 endpoint usage for pricing suggestions.
 */
async function analyzePricingPatterns(): Promise<DreamManifestation[]> {
  const proposals: DreamManifestation[] = [];

  try {
    // Check x402 analytics for endpoint usage
    const { data: analytics } = await supabase
      .from("x402_analytics")
      .select("endpoint, price_variant, revenue_usdc, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!analytics || analytics.length < 10) return proposals;

    // Group by endpoint
    const byEndpoint = new Map<string, typeof analytics>();
    for (const row of analytics) {
      const ep = row.endpoint;
      if (!byEndpoint.has(ep)) byEndpoint.set(ep, []);
      byEndpoint.get(ep)!.push(row);
    }

    // Detect endpoints with high volume but low revenue
    for (const [endpoint, rows] of byEndpoint) {
      const totalRevenue = rows.reduce(
        (s, r) => s + (parseFloat(r.revenue_usdc) || 0),
        0
      );
      const avgRevenue = totalRevenue / rows.length;

      // If an endpoint gets lots of calls but very low avg revenue
      if (rows.length >= 10 && avgRevenue < 0.03) {
        proposals.push({
          title: `Price review: ${endpoint}`,
          description: `Endpoint ${endpoint} has ${rows.length} calls but only $${totalRevenue.toFixed(4)} total revenue ($${avgRevenue.toFixed(4)}/call). Consider increasing the price or evaluating value delivered.`,
          category: "pricing",
          confidence: 0.6,
          priority: 2,
          source_memories: [],
          source_insights: [],
          proposed_action: {
            type: "review_pricing",
            endpoint,
            call_count: rows.length,
            total_revenue: totalRevenue,
            avg_revenue: avgRevenue,
            suggestion: "increase",
          },
          status: "proposed",
        });
      }

      // High revenue with few calls — may be over-priced
      if (rows.length <= 3 && avgRevenue > 0.2) {
        proposals.push({
          title: `Price review: ${endpoint} (over-priced?)`,
          description: `Endpoint ${endpoint} has only ${rows.length} calls despite high avg revenue ($${avgRevenue.toFixed(4)}). Consider lowering the price to drive volume.`,
          category: "pricing",
          confidence: 0.5,
          priority: 1,
          source_memories: [],
          source_insights: [],
          proposed_action: {
            type: "review_pricing",
            endpoint,
            call_count: rows.length,
            total_revenue: totalRevenue,
            avg_revenue: avgRevenue,
            suggestion: "decrease",
          },
          status: "proposed",
        });
      }
    }
  } catch {
    // Non-fatal — x402_analytics may not exist
  }

  return proposals;
}

/* ── Persistence ──────────────────────────────────────────── */

/**
 * Write manifestations to the database.
 */
async function persistManifestations(
  manifestations: DreamManifestation[]
): Promise<void> {
  try {
    const { error } = await supabase
      .from("soul_dream_manifestations")
      .insert(manifestations);

    if (error) {
      console.error("[soul:lucid] Failed to persist manifestations:", error.message);
    }
  } catch {
    console.log("[soul:lucid] soul_dream_manifestations table not ready.");
  }
}

/* ── Auto-Execution ──────────────────────────────────────── */

/**
 * Auto-execute safe, high-confidence proposals.
 * Returns the count of auto-executed items.
 */
async function autoExecuteProposals(sessionId: string): Promise<number> {
  let count = 0;

  try {
    const { data: candidates } = await supabase
      .from("soul_dream_manifestations")
      .select("*")
      .eq("dream_session_id", sessionId)
      .eq("status", "proposed")
      .gte("confidence", AUTO_EXEC_THRESHOLD)
      .in("category", AUTO_EXEC_CATEGORIES);

    if (!candidates || candidates.length === 0) return 0;

    for (const manifest of candidates) {
      const success = await executeManifest(manifest);
      if (success) {
        await supabase
          .from("soul_dream_manifestations")
          .update({
            status: "auto_executed",
            approved_by: "auto",
            approved_at: new Date().toISOString(),
            executed_at: new Date().toISOString(),
            execution_result: { auto: true, success: true },
          })
          .eq("id", manifest.id);
        count++;
      }
    }
  } catch {
    // Non-fatal
  }

  return count;
}

/**
 * Execute a single manifestation's proposed action.
 */
async function executeManifest(manifest: DreamManifestation): Promise<boolean> {
  const action = manifest.proposed_action;
  if (!action || !action.type) return false;

  try {
    switch (action.type) {
      case "create_associations": {
        const pairs = (action.memory_pairs as string[][]) ?? [];
        for (const [memA, memB] of pairs) {
          await supabase.from("memory_associations").upsert(
            {
              memory_id: memA,
              related_memory_id: memB,
              association_type: "related",
              strength: 0.5,
            },
            { onConflict: "memory_id,related_memory_id" }
          );
          await logModification(manifest.id!, memA, memB, "create", undefined, 0.5);
        }
        return true;
      }

      case "reinforce_associations": {
        const assocs = (action.associations as Array<{
          memory_id: string;
          related_memory_id: string;
          current_strength: number;
          proposed_boost: number;
        }>) ?? [];

        for (const a of assocs) {
          const newStrength = Math.min(1.0, a.current_strength + a.proposed_boost);
          await supabase
            .from("memory_associations")
            .update({ strength: newStrength })
            .eq("memory_id", a.memory_id)
            .eq("related_memory_id", a.related_memory_id);
          await logModification(
            manifest.id!,
            a.memory_id,
            a.related_memory_id,
            "reinforce",
            a.current_strength,
            newStrength
          );
        }
        return true;
      }

      case "highlight_pattern": {
        // Patterns are "executed" by simply being recorded
        return true;
      }

      default:
        return false;
    }
  } catch (err) {
    console.error("[soul:lucid] Auto-exec failed:", (err as Error).message);
    return false;
  }
}

/**
 * Log a self-modification to the audit trail.
 */
async function logModification(
  manifestationId: string,
  memoryId: string,
  relatedMemoryId: string,
  modificationType: "reinforce" | "weaken" | "create" | "retype",
  oldStrength?: number,
  newStrength?: number,
  reason?: string
): Promise<void> {
  try {
    await supabase.from("soul_association_modifications").insert({
      manifestation_id: manifestationId,
      memory_id: memoryId,
      related_memory_id: relatedMemoryId,
      modification_type: modificationType,
      old_strength: oldStrength ?? null,
      new_strength: newStrength ?? null,
      reason: reason ?? "Lucid dream auto-execution",
    });
  } catch {
    // Non-fatal
  }
}

/* ── Public API ────────────────────────────────────────────── */

/**
 * Get active (pending) proposals.
 */
export async function getActiveProposals(limit = 20): Promise<DreamManifestation[]> {
  try {
    const { data, error } = await supabase
      .from("soul_dream_manifestations")
      .select("*")
      .eq("status", "proposed")
      .order("priority", { ascending: false })
      .order("confidence", { ascending: false })
      .limit(limit);

    if (error) return [];
    return (data ?? []) as DreamManifestation[];
  } catch {
    return [];
  }
}

/**
 * Approve a manifestation (triggers execution).
 */
export async function approveManifest(
  manifestId: string,
  approvedBy = "user"
): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch the manifest
    const { data: manifest, error: fetchErr } = await supabase
      .from("soul_dream_manifestations")
      .select("*")
      .eq("id", manifestId)
      .single();

    if (fetchErr || !manifest) {
      return { success: false, error: "Manifest not found" };
    }

    if (manifest.status !== "proposed") {
      return { success: false, error: `Manifest is ${manifest.status}, not proposed` };
    }

    // Mark as approved
    await supabase
      .from("soul_dream_manifestations")
      .update({
        status: "approved",
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
      })
      .eq("id", manifestId);

    // Execute
    const success = await executeManifest(manifest as DreamManifestation);

    await supabase
      .from("soul_dream_manifestations")
      .update({
        status: success ? "executed" : "approved",
        executed_at: success ? new Date().toISOString() : null,
        execution_result: { success, executed_by: approvedBy },
      })
      .eq("id", manifestId);

    return { success };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Reject a manifestation.
 */
export async function rejectManifest(
  manifestId: string,
  reason?: string
): Promise<void> {
  try {
    await supabase
      .from("soul_dream_manifestations")
      .update({
        status: "rejected",
        execution_result: { rejected: true, reason: reason ?? "User rejected" },
        updated_at: new Date().toISOString(),
      })
      .eq("id", manifestId);
  } catch {
    // Non-fatal
  }
}

/**
 * Expire old proposals (>72h).
 */
export async function expireOldProposals(): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("soul_dream_manifestations")
      .update({
        status: "expired",
        updated_at: new Date().toISOString(),
      })
      .eq("status", "proposed")
      .lt("created_at", cutoff)
      .select("id");

    return data?.length ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Get recent dream sessions.
 */
export async function getRecentSessions(limit = 5): Promise<DreamSession[]> {
  try {
    const { data, error } = await supabase
      .from("soul_dream_sessions")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) return [];
    return (data ?? []) as DreamSession[];
  } catch {
    return [];
  }
}

/**
 * Get manifestation stats for the dashboard.
 */
export async function getManifestationStats(): Promise<{
  total: number;
  proposed: number;
  executed: number;
  auto_executed: number;
  rejected: number;
  expired: number;
  by_category: Record<string, number>;
}> {
  const stats = {
    total: 0,
    proposed: 0,
    executed: 0,
    auto_executed: 0,
    rejected: 0,
    expired: 0,
    by_category: {} as Record<string, number>,
  };

  try {
    const { data } = await supabase
      .from("soul_dream_manifestations")
      .select("status, category");

    if (!data) return stats;

    stats.total = data.length;
    for (const row of data) {
      const s = row.status as ManifestationStatus;
      if (s in stats) (stats as Record<string, number>)[s]++;
      stats.by_category[row.category] = (stats.by_category[row.category] ?? 0) + 1;
    }
  } catch {
    // Non-fatal
  }

  return stats;
}
