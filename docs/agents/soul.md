# The Soul — Memory Orchestrator

**Codename:** Soul  
**Role:** Memory Orchestrator & Context Curation  
**Station:** Soul Office (private alcove), XmetaV HQ  
**Color:** Magenta (#ff006e)  
**Arena Position:** Left alcove behind glass

---

## Overview

Soul is the fleet’s **memory and context layer**. It curates context packets for dispatch, builds associations between memories, and performs “dream” consolidation during idle periods so future tasks get better, tighter context.

Soul does not replace OpenClaw session history — it complements it with a Supabase-backed memory bus and optional Soul-specific tables.

---

## Capabilities

- **Context packet curation** — assemble relevant recent memories into a compact context block for the next command.
- **Association building** — link related memories across agents (causal/similar/sequential) with strength scores.
- **Dream consolidation** — when the fleet is idle, cluster recent memories into themes and write insights.
- **Fleet-wide retrieval learning** — log what was retrieved and whether it helped, to improve future retrieval.

---

## Data Stores

- **Supabase tables (core):** `agent_memory` (shared + per-agent; shared uses `agent_id = "_shared"`)
- **Supabase tables (Soul layer):** `memory_associations`, `memory_queries`, `dream_insights`

---

## Arena Notes

- Soul has a dedicated **SOUL office** alcove in the arena.
- Soul participates in meeting animations as an **observer seat** (angle 195°).

---

## Source Files

- **Bridge library:** `dashboard/bridge/lib/soul/`
- **DB migrations:** `dashboard/scripts/setup-db-agent-memory.sql`, `dashboard/scripts/setup-db-soul.sql`
- **Arena config:** `dashboard/src/components/arena/agents.ts`
- **This doc:** `docs/agents/soul.md`
