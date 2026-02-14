/**
 * Soul Agent — Association Builder
 *
 * After each task completion, builds associations between the
 * new memory and existing memories that share keywords, agents,
 * or temporal proximity.
 */

import { supabase } from "../supabase.js";
import { extractKeywords } from "./retrieval.js";
import type { AssociationType } from "./types.js";

/**
 * Build associations between a new memory and existing ones.
 * Called after captureCommandOutcome writes a new memory entry.
 */
export async function buildAssociations(
  newMemoryId: string,
  agentId: string,
  content: string
): Promise<number> {
  try {
    // Check if table exists
    const { error: tableCheck } = await supabase
      .from("memory_associations")
      .select("id")
      .limit(0);
    if (tableCheck) return 0; // Table doesn't exist yet

    const keywords = extractKeywords(content);
    if (keywords.length === 0) return 0;

    // Fetch recent memories for the same agent (excluding the new one)
    const { data: memories, error } = await supabase
      .from("agent_memory")
      .select("id, content, kind, created_at")
      .in("agent_id", [agentId, "_shared"])
      .neq("id", newMemoryId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error || !memories || memories.length === 0) return 0;

    const associations: Array<{
      memory_id: string;
      related_memory_id: string;
      association_type: AssociationType;
      strength: number;
    }> = [];

    for (const mem of memories) {
      const memKeywords = extractKeywords(mem.content);
      if (memKeywords.length === 0) continue;

      // Calculate keyword overlap
      const overlap = keywords.filter((kw) => memKeywords.includes(kw));
      if (overlap.length === 0) continue;

      const keywordStrength = overlap.length / Math.max(keywords.length, memKeywords.length);

      // Temporal proximity bonus (memories within 1 hour are likely related)
      const timeDiffMs =
        Math.abs(
          Date.now() - new Date(mem.created_at || 0).getTime()
        );
      const timeDiffHours = timeDiffMs / (1000 * 60 * 60);
      const temporalBonus = timeDiffHours < 1 ? 0.2 : timeDiffHours < 6 ? 0.1 : 0;

      const strength = Math.min(1.0, keywordStrength + temporalBonus);

      if (strength < 0.15) continue; // Too weak to store

      // Determine association type
      let type: AssociationType = "related";
      if (timeDiffHours < 1) type = "sequential";
      if (keywordStrength > 0.5) type = "similar";

      associations.push({
        memory_id: newMemoryId,
        related_memory_id: mem.id,
        association_type: type,
        strength: Math.round(strength * 100) / 100,
      });
    }

    if (associations.length === 0) return 0;

    // Insert top 5 strongest associations
    const topAssociations = associations
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5);

    const { error: insertError } = await supabase
      .from("memory_associations")
      .upsert(topAssociations, {
        onConflict: "memory_id,related_memory_id",
      });

    if (insertError) {
      console.error("[soul] Failed to write associations:", insertError.message);
      return 0;
    }

    return topAssociations.length;
  } catch {
    return 0; // Non-fatal
  }
}

/**
 * Strengthen an existing association (called when a retrieval proves useful).
 */
export async function reinforceAssociation(
  memoryId: string,
  relatedMemoryId: string,
  boost = 0.1
): Promise<void> {
  try {
    const { data } = await supabase
      .from("memory_associations")
      .select("strength")
      .eq("memory_id", memoryId)
      .eq("related_memory_id", relatedMemoryId)
      .single();

    if (data) {
      const newStrength = Math.min(1.0, data.strength + boost);
      await supabase
        .from("memory_associations")
        .update({ strength: newStrength })
        .eq("memory_id", memoryId)
        .eq("related_memory_id", relatedMemoryId);
    }
  } catch {
    // Non-fatal
  }
}
