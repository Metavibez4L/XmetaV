// ============================================================
// /api/oracle/discovery — Agent Discovery API
// Oracle's REST interface for registry scanning & search
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  scanAndCacheRange,
  scanNewRegistrations,
  refreshAgent,
  searchAgents,
  getDiscoveryStats,
  setRelationship,
  addTags,
  getScanHistory,
} from "@/lib/agent-discovery";
import type { AgentSearchFilters } from "@/lib/types/erc8004";

export const runtime = "nodejs";

/**
 * GET /api/oracle/discovery
 *
 * Query params:
 *   action=search (default) | stats | history | agent
 *
 * action=search:
 *   capability, minReputation, relationship, activeHours,
 *   tag, verified, q, from, to, limit, offset, orderBy, orderDir
 *
 * action=stats:
 *   Returns summary statistics for the discovery dashboard
 *
 * action=history:
 *   limit (default 20)
 *
 * action=agent:
 *   agentId (required) — returns single cached agent
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const action = params.get("action") || "search";

  try {
    const supabase = await createClient();

    switch (action) {
      case "stats": {
        const stats = await getDiscoveryStats(supabase);
        return NextResponse.json(stats);
      }

      case "history": {
        const limit = Math.min(Number(params.get("limit") || "20"), 100);
        const history = await getScanHistory(supabase, limit);
        return NextResponse.json({ history });
      }

      case "agent": {
        const agentId = params.get("agentId");
        if (!agentId) {
          return NextResponse.json(
            { error: "agentId required" },
            { status: 400 }
          );
        }
        const { data } = await supabase
          .from("erc8004_registry_cache")
          .select("*")
          .eq("agent_id", Number(agentId))
          .single();

        if (!data) {
          return NextResponse.json(
            { error: "Agent not found in cache — run a scan first" },
            { status: 404 }
          );
        }
        return NextResponse.json(data);
      }

      case "search":
      default: {
        const filters: AgentSearchFilters = {};

        const fromId = params.get("from");
        const toId = params.get("to");
        if (fromId && toId) {
          filters.idRange = { from: Number(fromId), to: Number(toId) };
        }

        const capability = params.get("capability");
        if (capability) {
          filters.capabilities = capability.split(",").map((c) => c.trim());
        }

        const minRep = params.get("minReputation");
        if (minRep) filters.minReputation = Number(minRep);

        const rel = params.get("relationship");
        if (rel) filters.relationship = rel as AgentSearchFilters["relationship"];

        const hours = params.get("activeHours");
        if (hours) filters.activeWithinHours = Number(hours);

        const tag = params.get("tag");
        if (tag) filters.tags = tag.split(",").map((t) => t.trim());

        if (params.get("verified") === "true") filters.verifiedOnly = true;

        const q = params.get("q");
        if (q) filters.query = q;

        filters.limit = Math.min(Number(params.get("limit") || "50"), 100);
        filters.offset = Number(params.get("offset") || "0");

        const orderBy = params.get("orderBy");
        if (orderBy) filters.orderBy = orderBy as AgentSearchFilters["orderBy"];

        const orderDir = params.get("orderDir");
        if (orderDir) filters.orderDir = orderDir as AgentSearchFilters["orderDir"];

        const result = await searchAgents(supabase, filters);
        return NextResponse.json(result);
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Discovery failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}

/**
 * POST /api/oracle/discovery
 *
 * Body JSON:
 *   action: "scan_range" | "scan_events" | "refresh" | "set_relationship" | "add_tags"
 *
 *   scan_range:  { from: number, to: number, fetchMetadata?: bool, fetchReputation?: bool }
 *   scan_events: { fromBlock?: number }
 *   refresh:     { agentId: number }
 *   set_relationship: { agentId: number, relationship: string, notes?: string }
 *   add_tags:    { agentId: number, tags: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json(
        { error: "action is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    switch (action) {
      case "scan_range": {
        const { from, to, fetchMetadata, fetchReputation } = body;
        if (from === undefined || to === undefined) {
          return NextResponse.json(
            { error: "from and to are required for scan_range" },
            { status: 400 }
          );
        }
        // Limit scan range to 200 agents per request
        if (to - from > 200) {
          return NextResponse.json(
            { error: "Maximum scan range is 200 agents per request" },
            { status: 400 }
          );
        }
        const result = await scanAndCacheRange(supabase, from, to, {
          fetchMetadata,
          fetchReputation,
        });
        return NextResponse.json({ action: "scan_range", ...result });
      }

      case "scan_events": {
        const fromBlock = body.fromBlock
          ? BigInt(body.fromBlock)
          : undefined;
        const result = await scanNewRegistrations(supabase, fromBlock);
        return NextResponse.json({ action: "scan_events", ...result });
      }

      case "refresh": {
        const { agentId } = body;
        if (!agentId) {
          return NextResponse.json(
            { error: "agentId is required for refresh" },
            { status: 400 }
          );
        }
        const agent = await refreshAgent(supabase, agentId);
        if (!agent) {
          return NextResponse.json(
            { error: `Agent ${agentId} not found on-chain` },
            { status: 404 }
          );
        }
        return NextResponse.json({ action: "refresh", agent });
      }

      case "set_relationship": {
        const { agentId, relationship, notes } = body;
        if (!agentId || !relationship) {
          return NextResponse.json(
            { error: "agentId and relationship are required" },
            { status: 400 }
          );
        }
        await setRelationship(supabase, agentId, relationship, notes);
        return NextResponse.json({ action: "set_relationship", ok: true });
      }

      case "add_tags": {
        const { agentId, tags } = body;
        if (!agentId || !tags?.length) {
          return NextResponse.json(
            { error: "agentId and tags are required" },
            { status: 400 }
          );
        }
        await addTags(supabase, agentId, tags);
        return NextResponse.json({ action: "add_tags", ok: true });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Discovery action failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
