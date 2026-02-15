# 🟡 Oracle Skill: Agent Identity Scout (ERC-8004)

> **Skill ID:** `agent_search`  
> **Agent:** Oracle (On-Chain Intel)  
> **Color:** `#fbbf24` (Gold)  
> **Room:** intel  
> **Version:** 1.0  
> **Registry:** Base Mainnet — `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`

---

## Overview

The Oracle Identity Scout extends Oracle's capability from passive market monitoring to **active ecosystem discovery**. It scans the ERC-8004 IdentityRegistry on Base to find, index, and analyze other registered AI agents.

XmetaV (Agent #16905) becomes the **mapmaker** of the Base agent ecosystem.

---

## Capabilities

```
Oracle Skill: agent_search

├── Scan by agent ID range (discover new registrations)
├── Scan by contract events (Registered, URIUpdated)
├── Search by capability tags (DeFi, coding, gaming)
├── Search by reputation score (high-trust agents)
├── Search by activity (recently scanned agents)
├── Filter by verification status
├── Filter by relationship (ally / neutral / avoided)
├── Cross-reference with on-chain reputation
├── Fetch & parse IPFS/HTTP metadata URIs
└── Classify agents (relationship tagging)
```

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 DASHBOARD UI                      │
│  AgentDiscoveryPanel.tsx                         │
│  ├── Stats bar (cached, verified, allies, etc)   │
│  ├── Scan controls (range scan, event scan)      │
│  ├── Search + filters (text, rep, relationship)  │
│  └── Agent list (expandable rows + classify)     │
├─────────────────────────────────────────────────┤
│                 REACT HOOK                        │
│  useERC8004Registry.ts                           │
│  ├── Auto-refresh (30s)                          │
│  ├── Realtime subscription (new cache entries)   │
│  ├── scanRange() / scanEvents()                  │
│  ├── searchAgents() with filters                 │
│  └── classifyAgent() / refreshAgent()            │
├─────────────────────────────────────────────────┤
│                 API LAYER                         │
│  /api/oracle/discovery                           │
│  ├── GET: search, stats, history, agent          │
│  └── POST: scan_range, scan_events, refresh,     │
│       set_relationship, add_tags                  │
├─────────────────────────────────────────────────┤
│              DISCOVERY LOGIC                      │
│  agent-discovery.ts                              │
│  ├── scanAndCacheRange()                         │
│  ├── scanNewRegistrations() (event-based)        │
│  ├── refreshAgent()                              │
│  ├── searchAgents() (Supabase query builder)     │
│  ├── getDiscoveryStats()                         │
│  └── setRelationship() / addTags()               │
├─────────────────────────────────────────────────┤
│              ON-CHAIN SCOUT                       │
│  erc8004-scout.ts                                │
│  ├── getAgentIdentity() (ownerOf, tokenURI)      │
│  ├── scanAgentRange() (batch with concurrency)   │
│  ├── scanRegisteredEvents() (event logs)         │
│  ├── getAgentReputation() (ReputationRegistry)   │
│  ├── fetchAgentMetadata() (IPFS/HTTP fetch)      │
│  └── agentExists() (fast check)                  │
├─────────────────────────────────────────────────┤
│              DATABASE CACHE                       │
│  erc8004_registry_cache (Supabase)               │
│  ├── agent_id, owner, agent_wallet               │
│  ├── metadata_uri, agent_name, capabilities[]    │
│  ├── reputation_score, reputation_count          │
│  ├── relationship, tags[], notes                 │
│  ├── is_verified, has_metadata, has_reputation   │
│  └── GIN indexes on capabilities + tags          │
│                                                   │
│  erc8004_scan_log (audit trail)                  │
│  ├── scan_type, range, agents found/new/updated  │
│  └── duration_ms, error                          │
└─────────────────────────────────────────────────┘
```

---

## Commands

### CLI (via oracle-agent.sh)

```bash
# Scan ID range around our agent
oracle agent_search --range 16900-17100

# Scan latest registrations via events (last ~24h)
oracle agent_search --recent

# Search by capability
oracle agent_search --capability defi

# Search by reputation
oracle agent_search --reputation >80

# Refresh a specific agent
oracle agent_search --refresh 17234

# Classify an agent
oracle agent_search --classify 17234 ally "DeFi specialist, potential swarm partner"
```

### API (via HTTP)

```bash
# Search cached agents
GET /api/oracle/discovery?action=search&q=defi&minReputation=50

# Get stats
GET /api/oracle/discovery?action=stats

# Scan a range (POST)
POST /api/oracle/discovery
{ "action": "scan_range", "from": 16900, "to": 17100 }

# Scan new registrations (POST)
POST /api/oracle/discovery
{ "action": "scan_events" }

# Refresh single agent (POST)  
POST /api/oracle/discovery
{ "action": "refresh", "agentId": 17234 }

# Classify agent (POST)
POST /api/oracle/discovery
{ "action": "set_relationship", "agentId": 17234, "relationship": "ally", "notes": "DeFi specialist" }
```

---

## Database Schema

### erc8004_registry_cache

| Column | Type | Description |
|--------|------|-------------|
| agent_id | BIGINT UNIQUE | On-chain agent ID |
| owner | TEXT | Wallet that registered the agent |
| agent_wallet | TEXT | Agent's designated wallet |
| metadata_uri | TEXT | tokenURI (IPFS or HTTP) |
| agent_name | TEXT | Parsed from metadata |
| agent_type | TEXT | Parsed from metadata |
| capabilities | TEXT[] | Parsed capability tags |
| fleet_members | TEXT[] | Parsed fleet member IDs |
| reputation_score | NUMERIC | From ReputationRegistry |
| reputation_count | INTEGER | Number of feedback entries |
| relationship | ENUM | unknown / ally / neutral / avoided |
| tags | TEXT[] | Custom classification tags |
| is_verified | BOOLEAN | Verified by Oracle |
| has_metadata | BOOLEAN | Metadata successfully fetched |
| has_reputation | BOOLEAN | Has on-chain reputation |

### erc8004_scan_log

| Column | Type | Description |
|--------|------|-------------|
| scan_type | TEXT | range / event / refresh / single |
| range_start | BIGINT | Start of scanned range |
| range_end | BIGINT | End of scanned range |
| agents_found | INTEGER | Existing agents found |
| agents_new | INTEGER | New agents discovered |
| duration_ms | INTEGER | Time taken |

---

## Gameplay Loop

```
1. XmetaV (Agent #16905) is ERC-8004 registered ✓
2. Oracle scans Base for other registered agents
3. Discovers Agent #17234 (DeFi specialist)
4. Briefing researches Agent #17234's on-chain history
5. Soul analyzes compatibility with our fleet
6. Main decides: approach for alliance?
7. Web3Dev prepares collaboration contracts
8. Alchemist models tokenomics of partnership
9. Sentinel monitors the interaction
10. If successful → ANCHOR the alliance as milestone
```

---

## File Map

```
dashboard/
├── src/
│   ├── lib/
│   │   ├── erc8004-scout.ts          # On-chain query layer
│   │   ├── agent-discovery.ts        # Cache + search logic
│   │   └── types/
│   │       └── erc8004.ts            # TypeScript interfaces
│   ├── hooks/
│   │   └── useERC8004Registry.ts     # React hook
│   ├── components/
│   │   └── oracle/
│   │       └── AgentDiscoveryPanel.tsx # UI component
│   └── app/
│       └── api/
│           └── oracle/
│               └── discovery/
│                   └── route.ts      # REST API
└── supabase/
    └── migrations/
        └── 20260214170000_erc8004_registry_cache.sql
```

---

## Principles

- **Signal over noise** — Only cache agents that actually exist on-chain
- **Numbers not opinions** — Reputation scores come from the contract, not us
- **Timestamp everything** — Every scan is logged with duration and results
- **Fail silently** — Bad metadata URIs, RPC timeouts → graceful degradation
- **Be the canary** — First to detect new agents registering on Base
- **Respect the chain** — All reads are free (public client), never modify others' data

---

*Oracle watches the markets. Now Oracle watches the agents. The eyes on the entire ecosystem.* 🟡
