# Agent: `scholar` — 24/7 Deep Research Daemon

## Overview

Scholar is the fleet's autonomous research agent. Running continuously inside the bridge daemon (v1.6.0+), it cycles through five research domains on a scheduled loop, scoring every finding for relevance and automatically anchoring significant discoveries to the Memory Anchor contract on Base. Scholar feeds the entire fleet with fresh intelligence — ensuring Oracle, Midas, Alchemist, and the rest operate on the latest data.

## Purpose

> Continuous deep research across ERC-8004, x402, L2, stablecoins, and small-business adoption. Score relevance. Anchor what matters.

## Research Domains

| Domain | Interval | Focus |
|--------|----------|-------|
| **ERC-8004** | 15 min | Identity registry updates, new registrations, standard proposals, ecosystem tooling |
| **x402** | 20 min | Payment protocol adoption, CDP facilitator changes, micro-payment patterns, pricing trends |
| **Layer 2** | 30 min | Base/OP Stack/Arbitrum developments, gas optimizations, cross-chain bridges, rollup upgrades |
| **Stablecoins** | 45 min | USDC/USDT/DAI flows, regulatory developments, yield strategies, de-peg risk monitoring |
| **SMB Adoption** | 60 min | Small-business x402 integration patterns, onboarding case studies, API adoption metrics |

## Relevance Scoring

Every finding is scored on four dimensions, weighted to prioritize novel, high-impact intel:

| Dimension | Weight | Description |
|-----------|--------|-------------|
| **Novelty** | 0.35 | How new/unique is this vs. existing fleet knowledge? |
| **Impact** | 0.30 | How much does this affect XmetaV strategy or revenue? |
| **Actionability** | 0.20 | Can the fleet act on this immediately? |
| **Recency** | 0.15 | How fresh is this information? |

**Formula:** `score = (novelty × 0.35) + (impact × 0.30) + (actionability × 0.20) + (recency × 0.15)`

### Memory Thresholds

| Score | Action |
|-------|--------|
| >= 0.3 | Store as scholar memory |
| >= 0.6 | Share to `_shared` fleet memory |
| >= 0.7 | Anchor on-chain via Memory Anchor contract |

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Bridge Daemon (v1.6.0)              │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │         Scholar Research Loop             │   │
│  │                                           │   │
│  │  pickNextDomain() → buildPrompt()        │   │
│  │       ↓                                   │   │
│  │  openclaw exec → raw findings            │   │
│  │       ↓                                   │   │
│  │  scoreRelevance() → scored findings      │   │
│  │       ↓                                   │   │
│  │  isDuplicate() → dedup filter            │   │
│  │       ↓                                   │   │
│  │  writeMemory() → Supabase agent_memory   │   │
│  │  shareMemory() → _shared (if >= 0.6)    │   │
│  │  anchorIfSignificant() → on-chain (>=0.7)│   │
│  │  buildAssociations() → Soul links        │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  Health: GET /scholar → stats JSON              │
└─────────────────────────────────────────────────┘
```

## Integration Points

| System | Integration |
|--------|------------|
| **Bridge** | Auto-started/stopped with daemon lifecycle |
| **Soul** | Associations built for each research finding |
| **Heartbeat** | Included in FLEET_AGENTS for health monitoring |
| **Arena** | Research room desk with emerald green workstation |
| **ERC-8004** | Listed in fleet metadata with research capabilities |
| **Supabase** | agent_controls + agent_memory tables |

## How to Run

### Automatic (bridge daemon)

Scholar starts automatically with the bridge daemon (v1.6.0+). No manual action needed.

```bash
# Check scholar health via bridge
curl -s http://localhost:3001/scholar | python3 -m json.tool
```

### Manual (one-shot tasks)

```bash
# Full research cycle (all 5 domains)
./scripts/scholar-agent.sh

# Single domain
./scripts/scholar-agent.sh --domain erc8004
./scripts/scholar-agent.sh --domain x402
./scripts/scholar-agent.sh --domain layer2
./scripts/scholar-agent.sh --domain stablecoins
./scripts/scholar-agent.sh --domain smb-adoption

# Ad-hoc research question
./scripts/scholar-agent.sh --research "What are the latest ERC-8004 implementations on Base?"

# Health stats
./scripts/scholar-agent.sh --stats

# Direct openclaw
./scripts/agent-task.sh scholar "Your research task here"
```

## Fleet Connections

| Agent | Relationship |
|-------|-------------|
| **Soul** | Scholar writes memories → Soul builds associations and curates context |
| **Oracle** | Scholar feeds market/chain intel → Oracle cross-references on-chain data |
| **Midas** | Scholar's adoption/pricing findings → Midas refines revenue strategy |
| **Briefing** | Scholar's discoveries enrich daily SITREPs |
| **Main** | Scholar findings available for fleet-wide decision making |

## Deduplication

Scholar uses keyword-overlap deduplication (>= 70% overlap threshold) against the last 50 scholar memories to prevent redundant entries. The oracle memory scan issue ("keeps running the same chat over and over") is avoided by:

1. Maintaining a `lastResearchedAt` timestamp per domain
2. Round-robin domain scheduling (no domain is hit twice before all others cycle)
3. Rotating research prompts with varied analytical angles per cycle
4. Keyword dedup against recent memories before storing

## Identity

- **Agent ID**: `scholar`
- **Workspace**: `~/.openclaw/agents/scholar`
- **Model**: `ollama/kimi-k2.5:cloud`
- **Tools**: `coding`
- **Color**: `#10b981` (emerald green)
- **Room**: `research`
- **Arena Position**: col 5, row 7 (between intel and dev floor)
