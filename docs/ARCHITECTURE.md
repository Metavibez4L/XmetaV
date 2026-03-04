# Architecture — XmetaV OpenClaw Command Center

**Last updated:** 2026-03-03  
**Platform:** Mac Studio (M3 Ultra, 96GB) — macOS 26.3  
**Location:** NYC (always-on headless server)  
**Remote access:** Tailscale VPN from MacBook Air (NC)

This repo is the operational layer around OpenClaw. It provides a **Control Plane Dashboard** (Next.js + Supabase), a **Bridge Daemon** (Node.js), an **x402 Payment Server** (Express), automation scripts, and documentation to manage OpenClaw agents, swarms, and infrastructure on macOS.

## System Overview

```mermaid
flowchart TB
    subgraph DASHBOARD["Control Plane Dashboard (localhost:3000)"]
        direction LR
        UI_CC["Command Center"]
        UI_CHAT["Agent Chat"]
        UI_SWARM["Swarms"]
        UI_FLEET["Fleet"]
        UI_PAY["Payments"]
        UI_ID["Identity"]
        UI_TOK["$XMETAV Token"]
        UI_COSMOS["Memory Cosmos"]
        UI_CONSC["Consciousness"]
        UI_ARENA["XMETAV HQ"]
    end

    subgraph SUPABASE["Supabase (Cloud Postgres + Realtime)"]
        direction LR
        TBL_CMD["agent_commands"]
        TBL_RESP["agent_responses"]
        TBL_CTRL["agent_controls"]
        TBL_MEM["agent_memory"]
        TBL_CRYSTAL["memory_crystals"]
        TBL_SRUN["swarm_runs"]
        TBL_STASK["swarm_tasks"]
        TBL_X402["x402_payments"]
        TBL_SOUL["soul_dream_*"]
        TBL_INTENT["intent_sessions"]
        TBL_SINC["sentinel_incidents"]
        TBL_SHEAL["sentinel_healing_log"]
        TBL_STRC["sentinel_traces"]
        TBL_SRES["sentinel_resource_snapshots"]
    end

    subgraph BASE["Base Mainnet (eip155:8453)"]
        direction LR
        X402["x402 USDC\nPayments"]
        ERC8004["ERC-8004\nIdentity NFT #16905"]
        XMETAV_TOK["$XMETAV ERC-20\n0x5b56...9a54"]
        ANCHOR["AgentMemoryAnchor\n(on-chain memory)"]
    end

    subgraph MACSTUDIO["Mac Studio (M3 Ultra — 96GB, macOS)"]
        subgraph BRIDGE["Bridge Daemon v1.5.0 (:3001)"]
            direction LR
            EXEC["Command\nExecutor"]
            SWEXEC["Swarm\nExecutor"]
            HB["Heartbeat"]
            SOUL_LIB["Soul\nAgent"]
            MEM_ENGINE["Memory\nCrystal Engine"]
            SENTINEL_ENG["Sentinel\nEngine"]
        end

        subgraph X402_SRV["x402 Server (:4021)"]
            direction LR
            PAY_MW["Payment\nMiddleware"]
            TIER_MW["Token Tier\nMiddleware"]
            ERC_MW["ERC-8004\nIdentity MW"]
        end

        subgraph XMETAV["XmetaV (This Repo)"]
            direction LR
            SCRIPTS["Scripts"]
            CONFIGS["Configs"]
            DOCS["Docs"]
            TEMPLATES["Templates"]
            JUSTFILE["justfile"]
        end

        subgraph RUNTIME["OpenClaw Runtime"]
            GW["Gateway\nws://127.0.0.1:18789"]

            subgraph MAIN_AGENT["main agent (ORCHESTRATOR)"]
                direction TB
                FACTORY["Agent Factory"]
                SWARM_SK["Swarm Skill"]
            end

            subgraph FLEET["Agent Fleet"]
                direction LR
                A_MAIN["main"]
                A_SENT["sentinel"]
                A_SOUL["soul"]
                A_BRIEF["briefing"]
                A_ORA["oracle"]
                A_ALCH["alchemist"]
                A_MIDAS["midas"]
                A_W3["web3dev"]
                A_AKUA["akua"]
                A_AKUA_W["akua_web"]
                A_BI["basedintern"]
                A_BI_W["basedintern_web"]
                A_VOX["vox"]
                A_SCHOLAR["scholar"]
                A_DYN["dynamic"]
            end
        end

        subgraph INFRA["Infrastructure"]
            direction LR
            LAUNCHD["LaunchAgent\nAuto-Restart\n(KeepAlive)"]
            WATCHDOG["Watchdog\n(launchd)"]
            TAILSCALE["Tailscale\n100.93.86.17"]
            SSH["SSH :22"]
            VNC["Screen Sharing\n:5900"]
        end
    end

    subgraph PROVIDERS["Model Providers"]
        direction LR
        OLLAMA["Ollama (:11434)\n• kimi-k2.5:cloud (256k)\n• qwen2.5:7b-instruct\n24h hot-keep, 3 models"]
    end

    subgraph EXTERNAL["External Services"]
        direction LR
        GITHUB["GitHub\n(Metavibez4L)"]
        PINATA["Pinata\n(IPFS pinning)"]
        ALCHEMY["Alchemy\n(Base RPC)"]
    end

    subgraph REMOTE["MacBook Air (NC)"]
        direction LR
        AIR_TS["Tailscale\n100.122.52.85"]
        AIR_SSH["SSH client"]
        AIR_VNC["Screen Sharing"]
    end

    DASHBOARD <-->|Realtime WS| SUPABASE
    BRIDGE <-->|Realtime WS| SUPABASE
    BRIDGE --> RUNTIME
    EXEC -->|openclaw agent| GW
    SWEXEC -->|orchestrate| GW
    GW --> MAIN_AGENT
    MAIN_AGENT --> FLEET
    FLEET --> PROVIDERS
    FACTORY -->|--github| GITHUB
    LAUNCHD -->|KeepAlive| DASH
    LAUNCHD -->|KeepAlive| BRIDGE
    LAUNCHD -->|KeepAlive| X402_SRV
    BRIDGE -->|auto-pay 402| X402
    BRIDGE -->|pin memories| PINATA
    BRIDGE -->|anchor hashes| ANCHOR
    X402_SRV -->|on-chain reads| ALCHEMY
    UI_ID -->|read identity| ERC8004
    UI_PAY -->|payment history| TBL_X402
    UI_TOK -->|balanceOf / tier| XMETAV_TOK
    XMETAV_TOK -.->|tier discount| X402_SRV
    REMOTE -->|Tailscale VPN| TAILSCALE
    AIR_SSH -->|ssh :22| SSH
    AIR_VNC -->|vnc :5900| VNC

    style DASHBOARD fill:#0a0e1a,stroke:#00f0ff,color:#00f0ff
    style SUPABASE fill:#1a1a2e,stroke:#3ecf8e,color:#fff
    style BASE fill:#0052ff,stroke:#fff,color:#fff
    style MACSTUDIO fill:#0d1117,stroke:#e94560,color:#fff
    style BRIDGE fill:#16213e,stroke:#00f0ff,color:#fff
    style X402_SRV fill:#16213e,stroke:#16c79a,color:#fff
    style XMETAV fill:#1a1a2e,stroke:#e94560,color:#fff
    style RUNTIME fill:#16213e,stroke:#e94560,color:#fff
    style INFRA fill:#1a1a2e,stroke:#f7b731,color:#fff
    style REMOTE fill:#161b22,stroke:#58a6ff,color:#fff
    style MAIN_AGENT fill:#0f3460,stroke:#e94560,color:#fff
    style FLEET fill:#1a1a3e,stroke:#a29bfe,color:#fff
    style PROVIDERS fill:#222,stroke:#888,color:#fff
    style EXTERNAL fill:#161b22,stroke:#58a6ff,color:#fff
```

## Components

### Control Plane Dashboard (Next.js 16)

A cyberpunk-themed web application providing a browser-based control interface for the entire XmetaV ecosystem.

- **Framework**: Next.js 16 (App Router) with TypeScript
- **Styling**: Tailwind CSS + shadcn/ui primitives + custom cyberpunk theme
- **Auth**: Supabase Auth (email/password)
- **Hosting**: Vercel (production) or localhost:3000 (development)
- **Pages**: Command Center, Agent Chat, Swarms, Fleet, Payments, Identity, $XMETAV Token, XMETAV HQ (Arena), Live Logs, Consciousness, Memory Cosmos

### XMETAV HQ — Isometric Office Visualization (PixiJS)

A standalone fullscreen page (`/arena`) rendering an isometric cyberpunk office in real-time using PixiJS (WebGL).

- **Renderer**: PixiJS v8.16.0 with dynamic imports (SSR-safe via `next/dynamic`)
- **Isometric Engine**: Custom `iso.ts` with 2:1 projection, tile/cube/wall drawing primitives
- **Office Layout**: Command room (Main + Operator visualization orb), meeting area (hex table + projector), Intel room, Dev floor, Soul office alcove
- **Agent Avatars**: Glowing translucent orbs with ghost silhouettes — idle (breathing pulse), busy (spinning ring), offline (static flicker)
- **Reactive Furniture**: Holo screens on every desk animate based on agent state (scrolling code, red flicker, dim)
- **Real-Time Effects**: Command pulses travel office pathways, streaming particles rise from desks, dispatch beams route through meeting table, completion bursts, failure glitches
- **Data Source**: `useArenaEvents` hook subscribes to Supabase Realtime channels (sessions, commands, responses, controls) and drives PixiJS imperatively via refs (plus 10s periodic sync)
- **HUD**: DOM overlay with title, system status, agent legend, and floating labels computed from isometric coordinates
- **Location**: `dashboard/src/components/arena/` (ArenaCanvas, agents, useArenaEvents, renderer/)

### Supabase (Message Bus + Database)

Supabase acts as the communication layer between the remote dashboard and the local bridge daemon.

- **Database**: Postgres with RLS policies for all tables (authenticated SELECT on all user-facing tables; dream tables have both authenticated SELECT and service-role ALL)
- **Realtime**: WebSocket subscriptions for live updates (commands, responses, swarm status)
- **Tables**: `agent_commands`, `agent_responses`, `agent_sessions`, `agent_controls`, `agent_memory`, `memory_associations`, `memory_queries`, `dream_insights`, `soul_dream_manifestations`, `soul_dream_sessions`, `soul_association_modifications`, `memory_crystals`, `memory_fusions`, `memory_summons`, `limit_breaks`, `memory_achievements`, `daily_quests`, `swarm_runs`, `swarm_tasks`, `x402_payments`, `intent_sessions`, `sentinel_incidents`, `sentinel_healing_log`, `sentinel_traces`, `sentinel_resource_snapshots`
- **Indexes**: `agent_memory(source)`, `memory_associations(memory_id, related_memory_id)` composite
- **Project**: `ptlneqcjsnrxxruutsxm`

### Bridge Daemon (Node.js — v1.5.0)

A local Node.js process (runs on Mac Studio alongside OpenClaw) that bridges the remote dashboard to the local OpenClaw CLI.

- **Port**: 3001
- **Command Executor**: Subscribes to `agent_commands` via Realtime, spawns `openclaw agent` processes, streams output to `agent_responses`
- **Swarm Executor**: Subscribes to `swarm_runs` via Realtime, orchestrates multi-agent tasks (parallel/pipeline/collaborative), updates `swarm_tasks` with live output
- **Heartbeat**: Periodic status updates so the dashboard knows the bridge is alive
- **Agent Controls**: Checks `agent_controls` table before executing commands (disabled agents are blocked)
- **Sentinel Engine**: Autonomous monitoring system with event-driven health checks, smart alerting, self-healing, predictive analysis, and distributed tracing (see below)
- **Graceful Shutdown**: SIGTERM handler unsubscribes Realtime channels, stops Sentinel engine, sets session offline
- **Sequential Command Execution**: `processPendingCommands` awaits each command before processing the next
- **x402 Client**: Wraps fetch with automatic 402 payment handling via `@x402/fetch` + `viem` signer
- **Dashboard Integration**: `bridge-manager.ts` uses `launchctl` to start/stop/status the bridge service (no more spawned child processes)
- **Location**: `dashboard/bridge/`

### x402 Payment Service (Express)

A standalone Express server that gates XmetaV API endpoints with USDC micro-payments via the x402 protocol (Coinbase CDP facilitator with automatic JWT auth).

- **Port**: 4021
- **Middleware**: `paymentMiddleware` from `@x402/express` gates endpoints with price + network requirements
- **Endpoints**: `/agent-task` ($0.10), `/intent` ($0.05), `/fleet-status` ($0.01), `/swarm` ($0.50), `/memory-crystal` ($0.05), `/neural-swarm` ($0.10), `/fusion-chamber` ($0.15), `/cosmos-explore` ($0.20), `/voice/transcribe` ($0.05), `/voice/synthesize` ($0.08), `/execute-trade` ($0.50+), `/rebalance-portfolio` ($2.00+), `/arb-opportunity` ($0.25), `/execute-arb` ($0.10+), `/yield-optimize` ($0.50), `/deploy-yield-strategy` ($3.00+)
- **ERC-8004 Identity MW**: Resolves caller agent via `X-Agent-Id` header (on-chain lookup → `req.callerAgent`)
- **Discovery**: `GET /agent/:agentId/payment-info` — public ERC-8004 lookup with x402 detection
- **Payment Logging**: Writes to `x402_payments` Supabase table (agent_id, payer/payee, network, metadata)
- **Token Tiers**: Checks caller's $XMETAV balance on-chain and applies tier discount to pricing
- **Free endpoints**: `/health`, `/token-info`, `/agent/:agentId/payment-info`, `/digest`, `/trade-fees`
- **Settlement**: USDC on Base Mainnet
- **Facilitator**: `@coinbase/x402` CDP facilitator with `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET` JWT auth
- **Location**: `dashboard/x402-server/`

### Service Management (LaunchAgent)

All three core services are managed by macOS `launchd` via LaunchAgent plists with `KeepAlive: true` and `RunAtLoad: true`.

| Service | Plist Label | Wrapper Script |
|---------|-------------|---------------|
| Dashboard :3000 | `com.xmetav.dashboard` | `/usr/local/bin/xmetav/launchd-dashboard.sh` |
| Bridge :3001 | `com.xmetav.bridge` | `/usr/local/bin/xmetav/launchd-bridge.sh` |
| x402 :4021 | `com.xmetav.x402` | `/usr/local/bin/xmetav/launchd-x402.sh` |

- **Auto-restart**: Services restart automatically on crash (ThrottleInterval: 10s)
- **Boot persistence**: All services start on login via `RunAtLoad`
- **Repo path**: `~/xmetav1/XmetaV` — moved from `~/Documents/` to bypass macOS Sequoia TCC restrictions on launchd
- **tsx watch**: Bridge and x402 use `tsx watch` for auto-reload on file changes
- **Source**: Plist copies in `scripts/launchd/`, wrapper scripts in `scripts/launchd-*.sh`

### Sentinel Monitoring Engine

Autonomous monitoring system embedded in the Bridge Daemon (v1.5.0). Provides event-driven health checks, smart alerting, automated self-healing, predictive analysis, and distributed tracing.

- **EventMonitor**: Checks 6 services (bridge, dashboard, x402, ollama, gateway, tailscale) via launchctl + HTTP probes. Adaptive polling interval (5s–120s) based on failure rate. Supabase Realtime subscriptions on `agent_sessions` and `sentinel_incidents`.
- **AlertManager**: Anti-fatigue alerting with escalation levels (1st fail → immediate, 3rd → warning/5min cooldown, 5th → critical/15min cooldown). Alert history with resolution tracking.
- **SelfHealer**: Registered remediation actions for each service (restart via `launchctl kickstart`), plus system-level actions (clean stale `.jsonl.lock` files, rotate large logs). 2-minute cooldown per issue.
- **PredictiveHealth**: Collects macOS resources (CPU via `top`, memory via `vm_stat`, disk via `df`, load via `sysctl`). Linear regression trend prediction. Z-score anomaly detection (threshold: 3).
- **DistributedTracer**: Span-based request tracking. Calculates P95 latency, throughput (req/min), and error rate. Persists spans to `sentinel_traces` table.
- **Orchestrator**: Singleton lifecycle wired to bridge start/stop. Auto-heals on `service:down` events. Triggers SITREP on critical alerts. Persists incidents to `sentinel_incidents`.
- **Endpoints**: `GET /sentinel` on bridge health server, `GET /api/sentinel` on dashboard (authenticated)
- **DB Tables**: `sentinel_incidents`, `sentinel_healing_log`, `sentinel_traces`, `sentinel_resource_snapshots`
- **Location**: `dashboard/bridge/lib/sentinel/`, `dashboard/scripts/setup-db-sentinel.sql`

### ERC-8004 Agent Identity

On-chain identity for the XmetaV agent using the ERC-8004 standard (ERC-721 NFTs) on Base mainnet.

- **Agent ID**: 16905 (minted via `IdentityRegistryUpgradeable`)
- **Identity Contract**: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- **Reputation Contract**: `0x8004b1041543F0eB1f3459E8a2FC4Ab06ceC7251`
- **Registration**: `register.ts` script mints the agent NFT with a metadata URI
- **Client Library**: `lib/client.ts` reads identity and reputation data via `viem`
- **Location**: `dashboard/erc8004/`

### $XMETAV Token (ERC-20)

Native utility token on Base Mainnet providing tiered discounts on x402-gated endpoints.

- **Contract**: `0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54` (ERC-20, OpenZeppelin Ownable)
- **Supply**: 1,000,000,000 (1B) fixed — all minted to deployer at construction
- **Tiers**: None → Starter (10%) → Bronze (15%) → Silver (25%) → Gold (50%) → Diamond (75% discount)
- **Integration**: x402 server middleware reads `balanceOf()` on-chain to apply tier discount
- **Dashboard**: `/token` page, balance + tier badge on `/identity` and `/payments`
- **API**: `/api/token?wallet=0x...` returns balance, tier, discount
- **Location**: `dashboard/token/` (Hardhat project), `dashboard/src/lib/token-tiers.ts`

### Soul Agent (Memory Orchestrator + Lucid Dreaming)

A dedicated agent that sits between task dispatch and agent execution, curating context, building memory associations, consolidating memories during fleet idle periods, and autonomously proposing evolution actions.

- **Room**: SOUL (private magenta alcove in Arena, cols 0–1, rows 2–5)
- **Bridge Library**: `dashboard/bridge/lib/soul/` — context building, memory retrieval, association building, dream mode, dream proposals, type definitions
- **DB Tables**: `memory_associations`, `memory_queries`, `dream_insights`, `soul_dream_manifestations`, `soul_dream_sessions`, `soul_association_modifications`
- **Dream Mode**: When all agents are idle, Soul consolidates recent memories into clusters, generates insights, and saves them for future context injection
- **Lucid Dreaming (Phase 5)**: During dream cycles, Soul generates actionable manifestations (proposals) across 7 categories: fusion, association, pricing, skill, meeting, pattern, correction. High-confidence safe proposals auto-execute; others await user approval via `/api/soul` or the Consciousness page
- **Association Building**: After each new memory entry, Soul automatically builds associations (causal, similar, sequential, related) with existing memories
- **Self-Modification**: Soul can propose and auto-execute association reinforcements, creating new links or boosting weak ones based on dream analysis
- **Context Packets**: Soul builds contextual memory packets injected into agent prompts at dispatch time
- **Arena**: Surveillance desk with mini fleet-monitor screens that mirror every agent's screen state; observer seat at meetings (195°)
- **API Route**: `GET/POST /api/soul` — proposals listing, stats, sessions, approve/reject, manual dream trigger
- **ERC-8004**: Listed in `fleet.agents` with 6 soul-specific capabilities
- **Location**: `dashboard/bridge/lib/soul/`, `dashboard/scripts/setup-db-soul.sql`, `dashboard/supabase/migrations/20260215220000_lucid_dreaming.sql`

### Memory Crystal System (Cyber-Neural Memory Evolution)

A Final-Fantasy-inspired memory gamification layer at `/memory-cosmos` with 7 interconnected subsystems.

- **Crystal Materia**: Living memory crystals with XP, 30 levels, star ratings (1-6★), and class evolution (anchor → mage → knight → sage → rogue → summoner → ninja → godhand)
- **Crystal Fusion**: 5 FF7-style fusion recipes (Nexus, Prophecy, Storm, Phantom, Infinity) with animated 4-phase fusion chamber
- **Memory Summons**: Keyword-triggered crystal summoning with animated triple summoning circles
- **Limit Breaks**: Triggered at 10+ crystals with 500+ total XP; creates legendary 6★ godhand crystal
- **Memory Cosmos**: Pannable/zoomable explorable world map with golden-spiral island layout, 3 terrain types, neon highway bridges with data particles
- **Achievements**: 7 seeded achievements with Bronze/Silver/Gold/Legendary tiers
- **Daily Quests**: Auto-generated daily quests with type-based objectives and XP rewards
- **Bridge Engine**: `dashboard/bridge/lib/memory-crystal.ts` — full game logic (~530 lines)
- **DB Tables**: `memory_crystals`, `memory_fusions`, `memory_summons`, `limit_breaks`, `memory_achievements`, `daily_quests` (3 custom enums, `crystal_level_thresholds` view)
- **Hook**: `useMemoryCrystals` — Supabase queries + realtime subscriptions, 12s auto-refresh
- **Components**: CrystalCard (canvas), CrystalInventory, FusionChamber, SummonOverlay, LimitBreakBanner, MemoryCosmos, QuestTracker
- **Location**: `dashboard/src/components/crystals/`, `dashboard/src/hooks/useMemoryCrystals.ts`, `dashboard/bridge/lib/memory-crystal.ts`

### OpenClaw CLI
- Entry point for everything: `openclaw ...`
- Reads configuration from the default state directory.

### State directory
This command center uses the default OpenClaw config (no profile flag needed).

- State directory: `~/.openclaw/`
- Config path: `~/.openclaw/openclaw.json`

OpenClaw also uses per-agent directories under the state dir for sessions.

### Gateway (WebSocket)
OpenClaw uses a WebSocket gateway that the CLI connects to.

- Gateway port: `18789`
- Default bind in this setup: `loopback` (127.0.0.1 only)

**Golden path for WSL2:** `gateway.mode = "local"`
- Keeps routing simple.
- Avoids confusion between gateway port and any manually-set remote URL.
- Avoids relying on systemd services (not available here).

### Agent runtime
`openclaw agent ...` runs a single agent turn via the Gateway.

Important practical details:
- Sessions are persisted as JSONL files.
- Locks are created as `*.jsonl.lock` to protect concurrent writers.
- Stale locks (e.g., from a crash) can hang future runs.
- All agents use macOS-native paths (`~/.openclaw/agents/...`)

### Agents

Static agents are defined in `openclaw.json`. Dynamic agents can be created at runtime by the `main` agent via the Agent Factory.

| Agent | Model | Workspace | Tools | Purpose |
|-------|-------|-----------|-------|---------|
| `main` (default) | `kimi-k2.5:cloud` (256k) | `~/.openclaw/workspace` | **full** | **Orchestrator** — command center + agent factory + swarm |
| `basedintern` | `kimi-k2.5:cloud` (256k) | `~/.openclaw/agents/basedintern` | coding | Repo agent — code/tests/commits (lean, fast) |
| `basedintern_web` | `kimi-k2.5:cloud` (256k) | `~/.openclaw/agents/basedintern` | full | Same repo — browser/web automation only |
| `akua` | `kimi-k2.5:cloud` (256k) | `~/.openclaw/agents/akua` | coding | Solidity/Hardhat repo agent |
| `akua_web` | `kimi-k2.5:cloud` (256k) | `~/.openclaw/agents/akua` | full | Same repo — browser/web automation only |
| `soul` | `kimi-k2.5:cloud` (256k) | `~/.openclaw/agents/soul` | coding | **Memory Orchestrator** — context curation, dream consolidation, associations |
| `vox` | `kimi-k2.5:cloud` (256k) | `~/.openclaw/agents/vox` | coding | **Brand & Campaigns** — content strategy, voice calibration, competitor analysis |
| `scholar` | `kimi-k2.5:cloud` (256k) | `~/.openclaw/agents/scholar` | coding | **Deep Research** — 24/7 research daemon, relevance scoring, memory anchoring (ERC-8004, x402, L2, stablecoins, SMB adoption) |
| _(dynamic)_ | `kimi-k2.5:cloud` | _(per-agent)_ | _(per-agent)_ | Created on-demand by Agent Factory |

### Agent Factory (Orchestrator Layer)

The `main` agent has an **Agent Factory** skill that enables it to:

1. **Create agents** — add new entries to `openclaw.json` with workspace + identity files
2. **Scaffold apps** — generate project starters (Node.js, Python, bots, etc.) in agent workspaces
3. **Manage the fleet** — list, update, remove, health-check all agents
4. **Self-spawn** — autonomously create agents when it identifies the need

```mermaid
flowchart TD
    subgraph ORCH["main agent (orchestrator)"]
        AF["Agent Factory\ncreate-agent.sh"]
        BA["Build App\nbuild-app.sh"]
        MA["Manage Agents\nmanage-agents.sh"]
    end

    AF -->|upsert| CFG["openclaw.json\n(agent entries)"]
    AF -->|--github| GH["GitHub Repo\n(gh repo create)"]
    BA -->|scaffold| WS["workspace/\n(scaffolded apps)"]
    BA -->|--github| GH
    MA -->|query| FLEET["Fleet Health\n(status checks)"]

    style ORCH fill:#1a1a2e,stroke:#e94560,color:#fff
    style AF fill:#0f3460,stroke:#e94560,color:#fff
    style BA fill:#0f3460,stroke:#e94560,color:#fff
    style MA fill:#0f3460,stroke:#e94560,color:#fff
    style GH fill:#161b22,stroke:#58a6ff,color:#fff
```

Scripts: `XmetaV/scripts/create-agent.sh`, `build-app.sh`, `manage-agents.sh`
Templates: `XmetaV/templates/agents/` (coding, bot, research, devops, general)

### Swarm (Multi-Agent Orchestration)

The main agent has a **Swarm** skill that enables multi-agent task execution:

1. **Parallel** — dispatch independent tasks to multiple agents simultaneously
2. **Pipeline** — chain agents sequentially, passing output as context to the next
3. **Collaborative** — send the same task to multiple agents, then synthesize responses

```mermaid
flowchart TD
    SW["swarm.sh"] --> PAR & PIPE & COLLAB

    subgraph PAR["Parallel"]
        direction LR
        PA["Agent A"] & PB["Agent B"] & PC["Agent C"]
    end

    subgraph PIPE["Pipeline"]
        direction LR
        PIA["Agent A"] -->|output| PIB["Agent B"] -->|output| PIC["Agent C"]
    end

    subgraph COLLAB["Collaborative"]
        direction LR
        CA["Agent A"] & CB["Agent B"]
        CA & CB -->|merge| SYN["Synthesize"]
    end

    PAR & PIPE & COLLAB --> OUT["~/.openclaw/swarm/&lt;run-id&gt;/\nmanifest.json | *.out | summary.md"]

    style SW fill:#1a1a2e,stroke:#e94560,color:#fff
    style PAR fill:#0f3460,stroke:#16c79a,color:#fff
    style PIPE fill:#0f3460,stroke:#f7b731,color:#fff
    style COLLAB fill:#0f3460,stroke:#a29bfe,color:#fff
    style OUT fill:#222,stroke:#888,color:#fff
```

Script: `XmetaV/scripts/swarm.sh`
Templates: `XmetaV/templates/swarms/` (health-all, ship-all, research-implement, code-review)
Full docs: `docs/SWARM.md`

### Model provider: Ollama (local)
OpenClaw talks to Ollama through its OpenAI-compatible API.

- Ollama base: `http://127.0.0.1:11434`
- OpenAI-compat base (this setup): `http://127.0.0.1:11434/v1`
- API key: `"local"` (required placeholder for OpenClaw auth checks)

**Golden path for agents (this repo):** `models.providers.ollama.api = "openai-responses"`

Why: `openai-responses` supports **tool calling** (function/tool schemas are sent to the model). If you use `openai-completions`, the model may "narrate" tool usage but cannot actually execute tools.

Practical note for small local models (e.g. 7B):
- If the agent hangs or loops calling tools (commonly `tts`), restrict tools with `tools.profile = "minimal"` and deny `tts`.

## Data flow

### Single agent turn

```mermaid
sequenceDiagram
    actor User
    participant CLI as OpenClaw CLI
    participant CFG as openclaw.json
    participant GW as Gateway :18789
    participant AGT as Agent Runtime
    participant LLM as Ollama / Kimi K2.5
    participant SESS as Session JSONL

    User->>CLI: openclaw agent --message "..."
    CLI->>CFG: Read config
    CLI->>GW: WebSocket connect
    GW->>AGT: Route to agent
    AGT->>LLM: openai-responses API call
    LLM-->>AGT: Model response (+ tool calls)
    AGT->>SESS: Persist turn
    AGT-->>GW: Return response
    GW-->>CLI: WebSocket message
    CLI-->>User: Print output
```

### Swarm execution

```mermaid
sequenceDiagram
    actor User
    participant SW as swarm.sh
    participant DIR as ~/.openclaw/swarm/
    participant AT as agent-task.sh
    participant OC as openclaw agent
    participant LLM as Kimi K2.5

    User->>SW: swarm.sh --parallel / --pipeline / --collab
    SW->>DIR: Create run directory (run-id)
    SW->>DIR: Save manifest.json

    alt Parallel mode
        SW->>AT: Task A (background)
        SW->>AT: Task B (background)
        SW->>AT: Task C (background)
        AT->>OC: openclaw agent (fresh session)
        OC->>LLM: API call
        LLM-->>OC: Response
        OC-->>AT: Output
        AT-->>DIR: Write task-id.out
    else Pipeline mode
        SW->>AT: Task A
        AT-->>DIR: Write A.out
        SW->>AT: Task B (with A.out as context)
        AT-->>DIR: Write B.out
    else Collaborative mode
        SW->>AT: Same task → Agent A (background)
        SW->>AT: Same task → Agent B (background)
        AT-->>DIR: Write per-agent .out
        SW->>AT: Synthesis agent merges results
        AT-->>DIR: Write synthesis.out
    end

    SW->>DIR: Generate summary.md
    SW-->>User: Print results
```

### Agent Factory flow

```mermaid
sequenceDiagram
    actor User
    participant MAIN as main agent
    participant CS as create-agent.sh
    participant BS as build-app.sh
    participant CFG as openclaw.json
    participant WS as Agent Workspace
    participant GH as GitHub (gh CLI)

    User->>MAIN: "Create an API agent with a GitHub repo"
    MAIN->>CS: exec create-agent.sh --id api --github --private
    CS->>CFG: Upsert agent entry
    CS->>WS: Create workspace + identity files
    CS->>GH: gh repo create Metavibez4L/api --private
    GH-->>CS: Repo created
    CS->>GH: git push -u origin HEAD
    CS-->>MAIN: Agent ready

    MAIN->>BS: exec build-app.sh --type fastapi --workspace ...
    BS->>WS: Scaffold FastAPI project
    BS->>WS: git init + commit
    BS->>GH: git push
    BS-->>MAIN: App scaffolded + pushed
    MAIN-->>User: Report: agent ID, repo URL, next steps
```

All agents use **Kimi K2.5** (256k context) via Ollama as the model provider.

### Dashboard command flow

```mermaid
sequenceDiagram
    actor User
    participant DASH as Dashboard (Browser)
    participant SUPA as Supabase
    participant BRIDGE as Bridge Daemon (WSL)
    participant OC as OpenClaw CLI
    participant LLM as Kimi K2.5

    User->>DASH: Type command in Agent Chat
    DASH->>SUPA: INSERT into agent_commands
    SUPA-->>BRIDGE: Realtime: new command
    BRIDGE->>BRIDGE: Check agent_controls (enabled?)
    BRIDGE->>OC: spawn openclaw agent --message "..."
    OC->>LLM: API call
    LLM-->>OC: Response
    OC-->>BRIDGE: stdout stream
    BRIDGE->>SUPA: INSERT/UPDATE agent_responses (streaming chunks)
    SUPA-->>DASH: Realtime: response chunks
    DASH-->>User: Display streaming response
```

### Dashboard swarm flow

```mermaid
sequenceDiagram
    actor User
    participant DASH as Dashboard (Browser)
    participant SUPA as Supabase
    participant BRIDGE as Bridge Daemon (WSL)
    participant OC as OpenClaw CLI

    User->>DASH: Create swarm (template or custom)
    DASH->>SUPA: INSERT into swarm_runs (status=pending)
    SUPA-->>BRIDGE: Realtime: new swarm run
    BRIDGE->>BRIDGE: Parse manifest, determine mode

    alt Parallel mode
        BRIDGE->>SUPA: INSERT swarm_tasks (one per agent)
        BRIDGE->>OC: Spawn agents in parallel
        OC-->>BRIDGE: stdout streams
        BRIDGE->>SUPA: UPDATE swarm_tasks (output chunks)
    else Pipeline mode
        BRIDGE->>OC: Run agent A
        OC-->>BRIDGE: Output A
        BRIDGE->>OC: Run agent B (with A's output as context)
        OC-->>BRIDGE: Output B
    else Collaborative mode
        BRIDGE->>OC: Same task to all agents (parallel)
        OC-->>BRIDGE: All outputs
        BRIDGE->>OC: Synthesis agent merges
        OC-->>BRIDGE: Synthesis result
    end

    BRIDGE->>SUPA: UPDATE swarm_runs (status=completed, synthesis)
    SUPA-->>DASH: Realtime updates throughout
    DASH-->>User: Live progress, streaming output, final results
```

## Ports and endpoints

| Service | Port | URL |
|---------|------|-----|
| Dashboard | 3000 | `http://localhost:3000` |
| Bridge | 3001 | `http://localhost:3001` |
| x402 Server | 4021 | `http://localhost:4021` |
| Gateway WS | 18789 | `ws://127.0.0.1:18789` |
| Ollama | 11434 | `http://127.0.0.1:11434` |
| SSH | 22 | Tailscale: `100.93.86.17:22` |
| Screen Sharing | 5900 | Tailscale: `100.93.86.17:5900` |
| Supabase | Cloud | `https://ptlneqcjsnrxxruutsxm.supabase.co` |

## Command runner (just)

The project uses `just` (v1.46.0) as a command runner with a `justfile` at the repo root.

```bash
just status     # Check all services
just all        # Start dashboard + bridge + x402
just killall    # Stop all services
just push "msg" # Git commit + push to dev
just revenue    # Check x402 payment revenue
just health     # Full system health
just models     # List Ollama models
```

## Failure modes (what this repo is designed to prevent)

- **1006 (WebSocket closed)**: usually means the CLI connected to the wrong place/port or no gateway was running.
- **Agent hangs**: often caused by wrong provider API mode (completions vs chat), or stale session locks.
- **Stale locks**: `*.jsonl.lock` left behind can block forever.

This repo provides scripts and runbooks to make these problems quick to detect and fix.

- **Agent limit exceeded**: MAX_AGENTS guard prevents runaway self-spawning (default: 10). Increase with `MAX_AGENTS=20` env var.
- **Duplicate agent**: `create-agent.sh` is idempotent — running twice with the same ID updates rather than duplicates.

## API Security Architecture

All dashboard API routes are protected with a shared auth guard pattern.

- **Auth Utility**: `dashboard/src/lib/api-auth.ts` — shared helpers for API route security
  - `requireAuth()` — reads Supabase session from SSR cookies, returns `{ user }` or `{ error: NextResponse(401) }`
  - `isValidUUID(s)` — regex validation for UUID params (prevents injection)
  - `clampLimit(raw, defaultVal, maxVal)` — safe parseInt with bounds (prevents unbounded result sets)
- **Protected Routes**: `/api/soul`, `/api/agents/memory`, `/api/midas`, `/api/erc8004/identity`, `/api/anchors`
- **Already Protected**: `/api/terminal` (uses `createClient()` + `getUser()` directly)
- **Pattern**: Every handler starts with `const auth = await requireAuth(); if (auth.error) return auth.error;`
- **Admin Client**: Routes that need cross-user data use `createAdminClient()` (service_role key) but still require an authenticated session first

## Performance Architecture

- **Explicit Column Selection**: All Supabase queries use explicit column lists instead of `SELECT *` to minimize payload size
- **Query Bounds**: All unbounded queries have `.limit()` caps (dream cycle: 500, manifestation stats: 1000, consciousness hook: 30-500 per table)
- **Batch Queries**: Dream proposal engine collects all memory IDs across clusters and executes a single batched association query instead of per-cluster N+1
- **Polling Intervals**: Dashboard consciousness hook polls at 30s (previously 15s), arena syncs at 10s
- **Canvas Optimization**: Force simulations use Map lookups for O(1) edge resolution; `setTransform()` prevents cumulative scaling; `document.hidden` stops rendering in backgrounded tabs
- **Build**: `optimizePackageImports` for lucide-react tree-shaking; `serverExternalPackages` for pg to prevent client bundling
