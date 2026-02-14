# XmetaV -- OpenClaw Command Center

> **Your central hub for managing OpenClaw agents, gateways, and infrastructure on WSL2/Linux**

Last updated: **2026-02-15** | OpenClaw 2026.2.1 | XmetaV Command Center v18

```
 ___   ___                    __           ___   ___
 \  \ /  / _ __ ___    ___  _/  |_  __ _   \  \ /  /
  \  V  / | '_ ` _ \  / _ \ \   __\/ _` |   \  V  /
  /  X  \ | | | | | ||  __/  |  | | (_| |   /     \
 /__/ \__\|_| |_| |_| \___|  |__|  \__,_|  /__/ \__\

      [ COMMAND CENTER : AGENT ORCHESTRATION ]
  _______________________________________________
 |                                               |
 |   agents:  11 (+ dynamic)                      |
 |   swarm:   parallel | pipeline | collab       |
 |   payments: x402 USDC micro-payments (Base)   |
 |   identity: ERC-8004 NFT #16905 (Base)        |
 |   token:    $XMETAV ERC-20 (Base)             |
 |   dashboard: Next.js + Supabase (cyberpunk)   |
 |   models:  kimi-k2.5:cloud (256k, all agents) |
 |   gateway: ws://127.0.0.1:18789              |
 |   engine:  Ollama + CUDA  |  RTX 4070        |
 |_______________________________________________|
```

---

## Features

- **Control Plane Dashboard** — Cyberpunk-themed Next.js web UI for agent chat, fleet management, swarm orchestration, and bridge control (Vercel-deployable)
- **XMETAV HQ (Arena)** — Isometric office visualization with PixiJS: boss office, meeting table with seat-based agent meetings, workstations, glowing orb avatars, real-time command pulses, dispatch beams, and reactive holo screens -- all driven by live Supabase events with periodic sync
- **Live Log Streaming** — Real-time log viewer with severity filters, agent filters, search, and auto-scroll
- **Swarm Dashboard** — Create, monitor, and review multi-agent swarm runs from the browser with live streaming output
- **Agent Factory** — main agent can create new agents, scaffold apps, create GitHub repos, and manage the fleet
- **Swarm Orchestration** — parallel, pipeline, and collaborative multi-agent task execution (CLI + dashboard)
- **Fleet Controls** — Enable/disable agents from the dashboard with bridge-side enforcement
- **x402 Payments** — Autonomous USDC micro-payments on Base via `@x402/express` + CDP facilitator with JWT auth (pay-per-use API gating: $0.01-$0.50 per endpoint)
- **ERC-8004 Identity** — On-chain agent identity (NFT #16905) with `x402Support` metadata, identity resolution middleware, and `/agent/:id/payment-info` discovery endpoint
- **Voice Commands** — Speak to agents via Whisper STT + TTS with x402 payment gating ($0.05-$0.08 per request)
- **Persistent Agent Memory Bus** — Supabase-backed memory entries (`_shared` + per-agent) injected by the bridge at dispatch time, with outcome capture after completion (complements OpenClaw session history)
- **Soul Agent (Memory Orchestrator)** — Dedicated memory orchestration agent with dream consolidation, association building, context packet curation, fleet-wide memory retrieval learning, and surveillance desk with mini fleet monitors in the Arena
- **Consciousness Tab** — Dual-aspect awareness dashboard: unified Main↔Soul split view, force-directed memory graph, on-chain anchor timeline, context metrics, dream mode status, and mini arena — all with 15s auto-refresh from Supabase
- **Swap Execution** — Agent-initiated token swaps with gas/balance pre-checks, voice normalization (spoken aliases → canonical symbols), and swap history tracking via `agent_swaps` table
- **Streaming Pipeline v2** — 2.5× faster response rendering: chunk size 160, flush 80ms, token batching (6/15ms), RAF-aligned 50ms throttle, React.memo StreamingBubble
- **$XMETAV Token** — ERC-20 on Base Mainnet (`0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54`) with tiered discounts (10-50% off) on x402 endpoints
- Multi-agent management (11 agents + dynamic): main, sentinel, soul, briefing, oracle, alchemist, web3dev, akua, akua_web, basedintern, basedintern_web
- Multi-model support (local qwen2.5 + cloud kimi-k2.5:cloud with 256k context)
- App scaffolding (Node.js, Python, Next.js, Hardhat, bots, FastAPI)
- GitHub integration for automated repo creation and pushing
- Full tool calling (exec, read, write, process, browser, web, cron, gateway, sessions)
- OpenClaw-managed browser automation
- Ollama integration with GPU acceleration (RTX 4070 + CUDA)

---

## What is XmetaV?

**XmetaV** is your operational command center for managing [OpenClaw](https://openclaw.dev) -- an AI agent automation platform. This repository contains:

- **Control Plane Dashboard** -- Cyberpunk web UI (Next.js + Supabase) for agent chat, fleet management, swarm orchestration, and real-time monitoring
- **Bridge Daemon** -- Local Node.js service that bridges the dashboard to OpenClaw CLI via Supabase Realtime
- **Agent Factory** -- Create agents on the fly, scaffold apps, create GitHub repos, manage the fleet
- **Swarm Engine** -- Orchestrate multi-agent tasks (parallel, pipeline, collaborative) via CLI or dashboard
- **Setup & Fix Scripts** -- Automated solutions for common issues
- **Configuration Templates** -- Battle-tested configs for Ollama + Kimi K2.5
- **Documentation** -- Runbooks, checklists, and troubleshooting guides
- **x402 Payment Service** -- Express server gating XmetaV endpoints with USDC micro-payments on Base
- **ERC-8004 Identity** -- On-chain agent NFT (identity + reputation) on Base mainnet
- **Agent Definitions** -- Multi-agent profiles and workspaces
- **Infrastructure as Code** -- Reproducible OpenClaw deployments

---

## Repository Structure

```
XmetaV/
|-- README.md                 # You are here
|-- LICENSE                   # MIT License
|
|-- dashboard/                # Control Plane Dashboard (Next.js + Supabase)
|   |-- src/
|   |   |-- app/
|   |   |   |-- (dashboard)/  # Protected routes (Command Center, Agent Chat, Swarms, Fleet)
|   |   |   |-- arena/        # XMETAV HQ isometric office visualization (standalone)
|   |   |   |-- auth/         # Login page
|   |   |   +-- api/          # API routes (commands, swarms, agents, bridge)
|   |   |-- components/       # UI: Sidebar, AgentChat, FleetTable, SwarmCreate, Consciousness, etc.
|   |   |   +-- arena/        # PixiJS renderers (iso, background, office, avatars, effects)
|   |   |-- hooks/            # Realtime hooks (messages, bridge, sessions, swarms, consciousness)
|   |   +-- lib/              # Supabase clients, types
|   |-- bridge/               # Bridge Daemon (Node.js)
|   |   |-- src/              # executor, swarm-executor, streamer, heartbeat
|   |   +-- lib/              # openclaw CLI wrapper, Supabase client, x402 client
|   |-- x402-server/          # x402 payment-gated Express service
|   |-- erc8004/              # ERC-8004 agent identity (registration, ABIs, client)
|   |-- scripts/              # DB migrations (setup-db*.sql)
|   +-- README.md             # Dashboard documentation
|
|-- scripts/                  # Executable automation scripts
|   |-- openclaw-fix.sh       # Main fix script (gateway + ollama + locks)
|   |-- start-gateway.sh      # Start gateway in background
|   |-- stop-all.sh           # Stop processes + clear stale locks
|   |-- health-check.sh       # Quick system health verification
|   |-- agent-task.sh         # Single atomic task wrapper
|   |-- agent-pipeline.sh     # Multi-step pipeline workflows
|   |-- create-agent.sh       # Agent Factory — create agents
|   |-- build-app.sh          # Agent Factory — scaffold apps
|   |-- manage-agents.sh      # Agent Factory — manage fleet
|   +-- swarm.sh              # Swarm — multi-agent orchestration (CLI)
|
|-- configs/                  # Configuration files & templates
|   +-- openclaw.json.fixed   # Known-good config for WSL2 + Ollama
|
|-- templates/                # Agent identity & swarm templates
|   |-- agents/               # Per-template identity files
|   |   |-- general.md        # Generic agent template
|   |   |-- coding.md         # Software development agent
|   |   |-- bot.md            # Discord/Telegram bot agent
|   |   |-- research.md       # Web research agent
|   |   +-- devops.md         # Infrastructure/ops agent
|   +-- swarms/               # Pre-built swarm manifests
|       |-- health-all.json   # Parallel health check
|       |-- ship-all.json     # Parallel build+test
|       |-- research-implement.json  # Pipeline: research -> implement
|       +-- code-review.json  # Collaborative code review
|
|-- capabilities/             # Quick-reference command guides
|   |-- README.md             # Capabilities overview
|   |-- quick-commands.md     # Essential daily-use commands
|   |-- agent-tasks.md        # AI agent usage examples
|   |-- cheatsheet.md         # One-page reference card
|   |-- management.md         # System administration commands
|   |-- expand.md             # How to add models, skills, channels, agents
|   |-- x402-payments.md      # x402 autonomous payment protocol reference
|   +-- erc8004-identity.md   # ERC-8004 on-chain agent identity reference
|
    +-- docs/                     # Documentation & runbooks
    |-- ARCHITECTURE.md       # System architecture overview
    |-- AGENTS.md             # Agent configuration guide
    |-- STATUS.md             # Current known-good settings + checks
    |-- TROUBLESHOOTING.md    # Common issues & solutions
    |-- OLLAMA-SETUP.md       # Ollama integration guide
    |-- OPENCLAW-FIX-CHECKLIST.md  # Verification checklist
    |-- GITHUB-SKILL-STATUS.md     # GitHub skill status
    |-- SWARM.md              # Multi-agent swarm reference
    +-- agents/               # Per-agent runbooks
        |-- README.md
        |-- main.md           # main agent runbook
        |-- basedintern.md    # basedintern agent runbook
        |-- akua.md           # akua agent runbook
        |-- dynamic.md        # Dynamic agent runbook
        |-- briefing.md       # briefing (context curator) runbook
        |-- oracle.md         # oracle (on-chain intel) runbook
        |-- alchemist.md      # alchemist (tokenomics) runbook
        |-- web3dev.md        # web3dev (blockchain dev) runbook
        |-- sentinel.md      # sentinel (fleet ops) runbook
```

---

## Quick Start

### Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| OpenClaw CLI | 2026.2.1+ | `openclaw --version` |
| Node.js | 22.x | `node --version` |
| Ollama | Latest (native install) | `ollama --version` |
| NVIDIA GPU | CUDA support | `nvidia-smi` |
| WSL2 (if Windows) | 2.0+ | `wsl --version` |

> **Important**: Use the **native Ollama installer** (`curl -fsSL https://ollama.com/install.sh | sh`), NOT the snap version. Snap Ollama lacks proper CUDA/GPU support and will run on CPU only.

### 1. Clone & Setup

```bash
git clone https://github.com/youruser/XmetaV.git
cd XmetaV
chmod +x scripts/*.sh
```

### 2. Fix Common Issues (First Run)

```bash
./scripts/openclaw-fix.sh
```

This script will:
- Kill stale processes
- Remove lock files
- Patch configuration for local Ollama
- Start the gateway on port 18789
- Verify everything works

### 3. Verify Installation

```bash
openclaw health

# Use --local flag for reliable agent calls (bypasses gateway websocket)
openclaw agent --agent main --local --thinking off \
  --session-id test_$(date +%s) --message "What is 2+2? Reply with just 4."
```

> **Note**: The `--local` flag runs the agent embedded (bypasses gateway websocket). This is the recommended mode for local Ollama usage.

---

## Available Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `openclaw-fix.sh` | **Complete fix** -- kills zombies, clears locks, patches config, starts gateway | `./scripts/openclaw-fix.sh` |
| `start-gateway.sh` | Start gateway in background on port 18789 | `./scripts/start-gateway.sh` |
| `stop-all.sh` | Stop all OpenClaw processes | `./scripts/stop-all.sh` |
| `health-check.sh` | Quick health verification | `./scripts/health-check.sh` |
| `agent-task.sh` | Single atomic task (fresh session, anti-stall) | `./scripts/agent-task.sh basedintern "task"` |
| `agent-pipeline.sh` | Multi-step workflows (health, ship, fix, evolve) | `./scripts/agent-pipeline.sh health` |
| **`create-agent.sh`** | **Agent Factory** -- create new agents | `./scripts/create-agent.sh --id myagent` |
| **`build-app.sh`** | **Agent Factory** -- scaffold apps | `./scripts/build-app.sh --type node --workspace /path` |
| **`manage-agents.sh`** | **Agent Factory** -- manage agent fleet | `./scripts/manage-agents.sh list` |
| **`swarm.sh`** | **Swarm** -- multi-agent orchestration (parallel, pipeline, collab) | `./scripts/swarm.sh --parallel ...` |
| **`briefing-agent.sh`** | **Briefing Agent** -- health sentinel + auto-fix + distill + sitrep | `./scripts/briefing-agent.sh` |
| **`distill.sh`** | **Memory Distill** -- consolidate activity into MEMORY.md + refresh SITREP | `./scripts/distill.sh` |
| **`oracle-agent.sh`** | **Oracle Agent** -- on-chain intel, gas, prices, sentiment, alerts | `./scripts/oracle-agent.sh` |
| **`alchemist-agent.sh`** | **Alchemist Agent** -- $XMETAV tokenomics, emissions, staking curves | `./scripts/alchemist-agent.sh` |
| **`web3dev-agent.sh`** | **Web3Dev Agent** -- compile, test, audit, deploy smart contracts | `./scripts/web3dev-agent.sh` |

---

## Configuration

### State Directory

This repo uses the default OpenClaw config (no profile flag needed):

| Setting | Value |
|---------|-------|
| State Directory | `~/.openclaw/` |
| Config File | `~/.openclaw/openclaw.json` |
| Gateway Port | `18789` |
| Gateway Mode | `local` |

### Model Provider: Ollama

| Setting | Value |
|---------|-------|
| Base URL | `http://127.0.0.1:11434/v1` |
| API Mode | `openai-responses` |
| API Key | `"local"` (required placeholder) |

Available models:

| Model | Type | Context Window |
|-------|------|----------------|
| `qwen2.5:7b-instruct` | Local | 32,768 |
| `kimi-k2.5:cloud` | Cloud (Ollama) | 262,144 (256k) |

> **Why `openai-responses`?** It's required for **tool calling** (exec/read/write/process). If you only want chat (no tools), `openai-completions` can work but won't inject tool schemas.

#### Ollama Cloud limits (Kimi)

Cloud models (like `kimi-k2.5:cloud`) are subject to plan/session usage limits. If you hit the quota you'll see HTTP 429. Fix: wait for reset or upgrade the plan. Cloud auth uses `ollama signin`.

### Key Config Values

```json
{
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "loopback"
  },
  "models": {
    "providers": {
      "ollama": {
        "baseUrl": "http://127.0.0.1:11434/v1",
        "api": "openai-responses",
        "apiKey": "local"
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "ollama/qwen2.5:7b-instruct"
      }
    }
  }
}
```

---

## Agents

### Agent: `main` (default)

| Property | Value |
|----------|-------|
| ID | `main` |
| Model | `ollama/kimi-k2.5:cloud` (256k context) |
| Workspace | `~/.openclaw/workspace` |
| Tools | `full` (fs, runtime, web, browser, sessions, automation) |
| Role | **Orchestrator** — agent factory + swarm + command center |

```bash
openclaw agent --agent main --local --thinking off --message "Hello!"
```

### Agent: `briefing` (context curator)

| Property | Value |
|----------|-------|
| ID | `briefing` |
| Model | `kimi-k2.5:cloud` (256k context) |
| Workspace | `/home/manifest/briefing` |
| Tools | `coding` (exec, read, write) |
| Role | **Context Curator** -- continuity, health sentinel, memory distillation |

The morning person who has the coffee ready. Maintains `SITREP.md` (live situation report) and `MEMORY.md` (long-term memory) so main doesn't waste sessions re-discovering context. Runs on a cron schedule with auto-fix for common health issues.

```bash
# Run manually
./scripts/briefing-agent.sh

# Or via cron (every hour):
# 0 * * * * /home/manifest/XmetaV/scripts/briefing-agent.sh >> /tmp/briefing-agent.log 2>&1
```

See [docs/agents/briefing.md](docs/agents/briefing.md) for full documentation.

### Agent: `oracle` (on-chain intelligence)

| Property | Value |
|----------|-------|
| **Purpose** | On-chain intelligence and market sentinel |
| **Workspace** | `/home/manifest/oracle` |
| **Tools** | `coding` (exec, read, write) |
| **Model** | `ollama/kimi-k2.5:cloud` |
| **Role** | Monitor gas, prices, chain activity, protocol intel, crypto sentiment |

Provides real-time market intelligence via public APIs (CoinGecko, Etherscan, DeFiLlama, CryptoCompare). Writes `ORACLE.md` reports and surfaces alerts before anyone has to ask.

```bash
# Run manually
./scripts/oracle-agent.sh

# Quick alerts every 15 min, full report every hour:
# */15 * * * * /home/manifest/XmetaV/scripts/oracle-agent.sh --alerts >> /tmp/oracle-alerts.log 2>&1
# 0 * * * *   /home/manifest/XmetaV/scripts/oracle-agent.sh --report >> /tmp/oracle-report.log 2>&1
```

See [docs/agents/oracle.md](docs/agents/oracle.md) for full documentation.

### Agent: `alchemist` (tokenomics)

| Property | Value |
|----------|-------|
| **Purpose** | $XMETAV tokenomics specialist |
| **Workspace** | `/home/manifest/alchemist` |
| **Tools** | `coding` (exec, read, write) |
| **Model** | `ollama/kimi-k2.5:cloud` |
| **Role** | Supply tracking, emission modeling, holder analysis, staking curves, liquidity intel |

Reads directly from the $XMETAV contract on Base Mainnet. Models emission schedules, identifies sell pressure windows, and recommends staking parameters. Writes `TOKENOMICS.md` reports.

```bash
# Run manually
./scripts/alchemist-agent.sh

# Health check every 6h, full report daily at 8 AM:
# 0 */6 * * * /home/manifest/XmetaV/scripts/alchemist-agent.sh --health >> /tmp/alchemist.log 2>&1
# 0 8 * * *   /home/manifest/XmetaV/scripts/alchemist-agent.sh --report >> /tmp/alchemist.log 2>&1
```

See [docs/agents/alchemist.md](docs/agents/alchemist.md) for full documentation.

### Agent: `web3dev` (blockchain developer)

| Property | Value |
|----------|-------|
| **Purpose** | Dedicated blockchain developer — compile, test, audit, deploy |
| **Workspace** | `/home/manifest/web3dev` |
| **Tools** | `coding` (exec, process, read, write) |
| **Model** | `ollama/kimi-k2.5:cloud` |
| **Role** | Smart contract dev, security auditor, deployment engineer, x402 maintainer |

Owns all Hardhat projects (Akua 18 contracts, $XMETAV token, BasedIntern). Static security audits, gas/size analysis, and production-ready contract scaffolding (ERC-20, staking, vesting, escrow).

```bash
# Run manually
./scripts/web3dev-agent.sh

# Status every 12h, weekly audit:
# 0 */12 * * * /home/manifest/XmetaV/scripts/web3dev-agent.sh --status >> /tmp/web3dev.log 2>&1
# 0 6 * * 1    /home/manifest/XmetaV/scripts/web3dev-agent.sh --report >> /tmp/web3dev.log 2>&1
```

See [docs/agents/web3dev.md](docs/agents/web3dev.md) for full documentation.

### Agent: `sentinel` (fleet lifecycle)

| Property | Value |
|----------|-------|
| **Purpose** | Agent lifecycle manager — spawn coordination, fleet health |
| **Workspace** | `/home/manifest/sentinel` |
| **Tools** | `coding` (exec, read, write) |
| **Model** | `ollama/kimi-k2.5:cloud` |
| **Role** | Spawn coordinators, resource managers, inter-agent communication, fleet health monitoring |

Manages agent lifecycles and fleet health. Coordinates agent spawning, monitors resource usage, handles inter-agent communication routing, and maintains fleet health dashboards. Commands: `status`, `health`, `spawn`, `queue`, `errors`.

See [docs/agents/sentinel.md](docs/agents/sentinel.md) for full documentation.

### Agent: `basedintern` (coding) + `basedintern_web` (full)

| Property | `basedintern` | `basedintern_web` |
|----------|---------------|-------------------|
| Model | `kimi-k2.5:cloud` (256k) | `kimi-k2.5:cloud` (256k) |
| Workspace | `/home/manifest/basedintern` | `/home/manifest/basedintern` |
| Tools | `coding` (exec, read, write, process) | `full` (all tools + browser + web) |
| Use for | 90% of work (code, tests, commits) | Only browser/web automation |

**Why two agents?** The `coding` profile advertises ~4 tools (small schema). The `full` profile advertises 20+ tools. Fewer tools = fewer tokens per Kimi call = faster + less 429s.

```bash
# Default (lean, fast)
openclaw agent --agent basedintern --local --thinking off \
  --session-id bi_$(date +%s) --message "Run npm test."

# Full tools (only when needed)
openclaw agent --agent basedintern_web --local --thinking off \
  --session-id biweb_$(date +%s) --message "Use web_fetch to check a URL."
```

### Agent: `akua` (coding) + `akua_web` (full)

| Property | `akua` | `akua_web` |
|----------|--------|------------|
| Model | `kimi-k2.5:cloud` (256k) | `kimi-k2.5:cloud` (256k) |
| Workspace | `/home/manifest/akua` | `/home/manifest/akua` |
| Tools | `coding` (exec, read, write, process) | `full` (all tools + browser + web) |
| Use for | 90% of work (contracts, tests, commits) | Only browser/web automation |
| Repo | [Metavibez4L/akua](https://github.com/Metavibez4L/akua) | Same |

```bash
# Default (lean, fast)
openclaw agent --agent akua --local --thinking off \
  --session-id akua_$(date +%s) --message "Run /repo-ops compile."

# Full tools (only when needed)
openclaw agent --agent akua_web --local --thinking off \
  --session-id akuaweb_$(date +%s) --message "Use web_fetch to check a URL."
```

### Creating New Agents (Agent Factory)

The `main` agent can create agents autonomously, or you can use the scripts directly:

```bash
# Create a new agent with workspace, identity files, and config entry
./scripts/create-agent.sh --id researcher \
  --template research \
  --description "Web research and data gathering" \
  --web  # also create researcher_web companion

# Create agent + auto-create a GitHub repo and push
./scripts/create-agent.sh --id researcher \
  --template research --web \
  --github --private  # creates Metavibez4L/researcher on GitHub

# Scaffold a project in the agent's workspace
./scripts/build-app.sh --type node --workspace /home/manifest/researcher

# Scaffold + push to GitHub
./scripts/build-app.sh --type node --workspace /home/manifest/researcher --github

# Check the fleet
./scripts/manage-agents.sh list

# Run it
./scripts/agent-task.sh researcher "What can you do?"
```

Or ask the main agent to do it:

```bash
openclaw agent --agent main --local \
  --message "Create a Discord bot agent called social-bot and scaffold a bot project for it"
```

**Templates:** `coding`, `bot`, `research`, `devops`, `general`

**App types:** `node`, `python`, `nextjs`, `hardhat`, `bot`, `fastapi`, `script`

See [docs/agents/dynamic.md](docs/agents/dynamic.md) for full documentation.

### Control Plane Dashboard

A cyberpunk-themed web dashboard for managing the entire XmetaV ecosystem from a browser.

```bash
# Run locally
cd dashboard && npm install && npm run dev
# Open http://localhost:3000

# Start the bridge daemon (connects dashboard to OpenClaw CLI)
cd dashboard/bridge && npm install && npm start
```

**Dashboard Pages:**

| Page | Description |
|------|-------------|
| `/` | **Command Center** -- bridge health, fleet summary, command history, quick command |
| `/agent` | **Agent Chat** -- full-screen streaming chat with agent selector |
| `/swarms` | **Swarms** -- create, monitor, and review multi-agent swarm runs |
| `/fleet` | **Fleet** -- agent status table with enable/disable toggles and task dispatch |
| `/payments` | **Payments** -- x402 wallet status, spend tracking, payment history, gated endpoints |
| `/identity` | **Identity** -- ERC-8004 on-chain agent identity, reputation, and NFT details |
| `/token` | **$XMETAV** -- ERC-20 token balance, tier status, discount table, holder benefits |
| `/consciousness` | **Consciousness** -- Dual-aspect awareness: memory graph, anchor timeline, context metrics, dream mode, mini arena |
| `/arena` | **XMETAV HQ** -- Isometric office visualization with live agent activity (PixiJS) |
| `/logs` | **Live Logs** -- Real-time log streaming with severity/agent filters and search |

**Key Features:**
- **Swarm Dashboard** -- Create swarms from templates or custom builder, "Let Main Agent Decide" button, live progress bars, per-task streaming output, run history with filters
- **Agent Controls** -- Enable/disable agents from the Fleet page; disabled agents have commands blocked by the bridge
- **Bridge Controls** -- Start/stop the local bridge daemon from the dashboard
- **Real-time** -- All data updates live via Supabase Realtime (no polling)
- **Cyberpunk UI** -- Neon blue/dark hacker aesthetic with glitch effects, scanlines, and animated elements

**Architecture:** `Browser (Vercel) <-> Supabase (command bus) <-> Bridge Daemon (WSL) <-> OpenClaw CLI <-> Agents`

See [dashboard/README.md](dashboard/README.md) for full documentation.

### Swarm Orchestration

Dispatch tasks across multiple agents with three modes (CLI or dashboard):

```bash
# Parallel: run independent tasks simultaneously
./scripts/swarm.sh --parallel \
  basedintern "Run npm test" \
  akua "Run /repo-ops compile"

# Pipeline: chain agents, output flows forward
./scripts/swarm.sh --pipeline \
  main "Research error handling best practices" \
  basedintern "Apply the findings to the codebase"

# Collaborative: multiple perspectives on the same problem
./scripts/swarm.sh --collab "Review security of our auth flow" \
  basedintern akua

# Pre-built templates
./scripts/swarm.sh templates/swarms/health-all.json

# Check results
./scripts/swarm.sh --status
./scripts/swarm.sh --results <run-id>
```

Or let the main agent orchestrate swarms via its Swarm skill:

```bash
openclaw agent --agent main --local \
  --message "Run a parallel health check across all repo agents"
```

See [docs/SWARM.md](docs/SWARM.md) for full documentation.

---

## System Architecture

```mermaid
flowchart TB
    subgraph XMETAV["XmetaV (This Repo)"]
        direction LR
        SCRIPTS["Scripts"] ~~~ CONFIGS["Configs"] ~~~ DOCS["Docs"] ~~~ TEMPLATES["Templates"]
    end

    subgraph RUNTIME["OpenClaw Runtime"]
        GW["Gateway — ws://127.0.0.1:18789"]
        subgraph GWSVC[" "]
            direction LR
            AR["Agent\nRuntime"]
            SM["Session\nManager"]
            CR["Channel\nRouter"]
            SE["Skill\nExecutor"]
        end

        subgraph ORCH["main agent (ORCHESTRATOR)"]
            direction TB
            subgraph FAC["Agent Factory"]
                direction LR
                CA["create-agent.sh"]
                BA2["build-app.sh"]
                MG["manage-agents.sh"]
            end
            subgraph SWE["Swarm Engine — swarm.sh"]
                direction LR
                S_P["Parallel\n⫘ A B C"]
                S_PI["Pipeline\nA → B → C"]
                S_C["Collaborative\nA + B → synth"]
            end
        end

        subgraph FLEET["Agent Fleet (10+)"]
            direction LR
            F_MAIN["main\n(orch.)"]
            F_INTEL["sentinel\nbriefing\noracle\nalchemist"]
            F_DEV["web3dev\nakua (+web)\nbasedintern (+web)"]
            F_DYN["dynamic\nagents"]
        end
    end

    subgraph PROV["Model Providers"]
        direction LR
        OLL["Ollama (Local)\nhttp://127.0.0.1:11434\nqwen2.5 · kimi-k2.5:cloud"]
        CLD["Cloud Providers\nAnthropic · OpenAI"]
    end

    subgraph EXT["External"]
        GH["GitHub\nMetavibez4L"]
    end

    subgraph BASE["Base Mainnet"]
        direction LR
        X402P["x402 USDC\nPayments"]
        ERC["ERC-8004\nIdentity #16905"]
    end

    XMETAV ==> GW
    GW --> GWSVC --> ORCH
    ORCH --> FLEET
    FAC -.->|--github| GH
    FLEET ==> PROV
    FLEET -.->|pay / identify| BASE

    style XMETAV fill:#1a1a2e,stroke:#e94560,color:#fff
    style RUNTIME fill:#16213e,stroke:#e94560,color:#fff
    style ORCH fill:#0f3460,stroke:#e94560,color:#fff
    style FAC fill:#1a1a4e,stroke:#16c79a,color:#fff
    style SWE fill:#1a1a4e,stroke:#f7b731,color:#fff
    style FLEET fill:#1a1a3e,stroke:#a29bfe,color:#fff
    style PROV fill:#222,stroke:#888,color:#fff
    style EXT fill:#161b22,stroke:#58a6ff,color:#fff
    style GH fill:#161b22,stroke:#58a6ff,color:#fff
    style BASE fill:#0052ff,stroke:#fff,color:#fff
```

---

## Common Commands

### Gateway Management

```bash
# Start gateway (background)
./scripts/start-gateway.sh

# Check gateway status
openclaw health

# View gateway logs
tail -f ~/.openclaw/gateway.log
```

### Browser Automation (OpenClaw-managed)

```bash
openclaw browser start
openclaw browser open https://example.com
openclaw browser snapshot
openclaw browser click e123
```

### Agent Operations

```bash
# Simple message (default agent)
openclaw agent --message "What is 2+2?"

# With specific agent and session
openclaw agent --agent basedintern \
  --session-id my-session \
  --message "Run npm test"

# List sessions
openclaw sessions list
```

### Configuration

```bash
# View current config
openclaw config get

# Set a value
openclaw config set gateway.mode local

# View specific key
openclaw config get models.providers.ollama.api
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Gateway closed (1006)` | Run `./scripts/openclaw-fix.sh` -- gateway not running or wrong port |
| `Waiting for agent reply` forever | Use `--local --thinking off`, clear stale locks, ensure `api=openai-responses` |
| `Session locked` | `find ~/.openclaw -name "*.lock" -delete` |
| `Connection refused` to Ollama | `ollama serve` or check systemd status |
| Port 18789 already in use | `fuser -k 18789/tcp` then restart gateway |
| `No API key found for provider ollama` | `openclaw config set models.providers.ollama.apiKey "local"` |
| Browser start fails | Install browser deps (see `docs/STATUS.md`) |

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for detailed solutions.

---

## Documentation Index

| Document | Description |
|----------|-------------|
| [dashboard/README.md](dashboard/README.md) | **Control Plane Dashboard** — setup, architecture, pages, bridge |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture deep-dive (includes dashboard) |
| [AGENTS.md](docs/AGENTS.md) | Agent configuration, tool profiles, and customization |
| [agents/](docs/agents/) | Per-agent runbooks (main, briefing, oracle, alchemist, web3dev, basedintern, akua, dynamic) |
| [STATUS.md](docs/STATUS.md) | Current known-good settings + verification commands |
| [SWARM.md](docs/SWARM.md) | Multi-agent swarm orchestration reference |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues & solutions (includes dashboard, x402, voice) |
| [OLLAMA-SETUP.md](docs/OLLAMA-SETUP.md) | Ollama integration guide |
| [OPENCLAW-FIX-CHECKLIST.md](docs/OPENCLAW-FIX-CHECKLIST.md) | Verification checklist |
| [GITHUB-SKILL-STATUS.md](docs/GITHUB-SKILL-STATUS.md) | GitHub skill status |
| [capabilities/x402-payments.md](capabilities/x402-payments.md) | x402 autonomous payment protocol reference |
| [capabilities/erc8004-identity.md](capabilities/erc8004-identity.md) | ERC-8004 on-chain agent identity reference |
| [capabilities/voice-commands.md](capabilities/voice-commands.md) | Voice command & response system reference |
| [docs/memory/](docs/memory/) | Memory system architecture — anchoring, Soul orchestration |
| [capabilities/quick-commands.md](capabilities/quick-commands.md) | Essential daily-use commands |

---

## GitHub Skill Integration

The GitHub skill is installed, authenticated, and working with OpenClaw agents.

- To use: `/github help`, `/github status`, `/github issue list`, etc.
- Requires: GitHub CLI (`gh`) installed and authenticated (`gh auth login`).
- See [docs/GITHUB-SKILL-STATUS.md](docs/GITHUB-SKILL-STATUS.md) for status.

---

## Development

### Adding New Scripts

1. Create script in `scripts/`
2. Make executable: `chmod +x scripts/your-script.sh`
3. Add documentation in script header
4. Update this README

### Configuration Changes

1. Test with `openclaw config set ...`
2. Export working config to `configs/openclaw.json.fixed`
3. Document changes in `docs/`

---

## On-Chain Contracts (Base Mainnet)

All contracts are deployed on **Base Mainnet** (chain ID `8453`, `eip155:8453`).

| Contract | Address | Description |
|----------|---------|-------------|
| **$XMETAV Token** | [`0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54`](https://basescan.org/token/0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54) | ERC-20 token (1B fixed supply) — tiered discounts on x402 |
| **ERC-8004 Identity** | [`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`](https://basescan.org/token/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432?a=16905) | IdentityRegistry — Agent NFT #16905 |
| **ERC-8004 Reputation** | [`0x8004b1041543F0eB1f3459E8a2FC4Ab06ceC7251`](https://basescan.org/address/0x8004b1041543F0eB1f3459E8a2FC4Ab06ceC7251) | ReputationRegistry — on-chain trust scores |

| Wallet | Address | Role |
|--------|---------|------|
| **Agent / Deployer** | [`0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80`](https://basescan.org/address/0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80) | Owner of ERC-8004 NFT, deployer of $XMETAV, x402 payment receiver |

---

## Changelog

### 2026-02-15 (v18) — Consciousness Tab + Swap Execution + Streaming v2
- **Consciousness Tab** — New `/consciousness` route with 6-panel awareness dashboard: Unified Awareness (Main↔Soul split view), Memory Graph (force-directed canvas with drag/zoom), Anchor Timeline (on-chain anchors with BaseScan links), Context Metrics (4 metric cards + injections feed), Dream Mode Status (6hr idle threshold + insights), Mini Arena (stylized agent positions with realtime subscription). Brain icon in sidebar at position 03 (Ctrl+3). `useConsciousness` hook fetches from 6 Supabase tables with 15s auto-refresh
- **Swap Execution System** — Agent-initiated token swaps via `bridge/src/swap-executor.ts`. `/api/swap` POST endpoint. `agent_swaps` Supabase table for swap history. Gas balance and token balance pre-checks before submission. Clean viem error messages with failed status in chat
- **Voice Swap Normalization** — `VOICE_ALIASES` dictionary and `normalizeVoiceSwap()` function convert spoken swap commands ("fifty bucks of ether") to canonical form ("50 USDC for ETH")
- **Streaming Pipeline v2** — 2.5× faster rendering: streamer chunk 400→160 / flush 200→80ms / first 50→30ms, executor token batching (6 tokens/15ms), `useRealtimeMessages` throttle 80→50ms with RAF alignment, `StreamingBubble` wrapped in `React.memo` with `useMemo` cleanAgentOutput, smart auto-scroll
- **Identity & Schema Sync** — Updated `registration.json` and `metadata.json` with swap capabilities. Supabase migrations for `agent_memory` and soul tables
- **Memory Docs** — Mermaid flowcharts in `docs/memory/` (README.md, SOUL.md, ANCHORING.md)

### 2026-02-14 (v17) — Soul Agent + ERC-8004 Metadata Update + Arena Soul Office
- **Soul Agent** — New memory orchestrator agent (`soul`): context curation, memory association building, dream consolidation during fleet idle, and memory retrieval learning. Room: SOUL (private magenta alcove). Color: Magenta (`#ff006e`)
- **Soul Office in Arena** — Dedicated isometric alcove (cols 0–1, rows 2–5) with magenta floor tiles, glass partition walls, "SOUL" room label, L-shaped surveillance desk, and an arc of mini fleet-monitor screens that mirror every agent's state in real-time
- **Soul Arena Integration** — Soul agent node, meeting seat (observer position at 195°), and topology connections to main, briefing, oracle, alchemist, sentinel (watches everyone)
- **ERC-8004 Metadata Update** — Added Soul to `fleet.agents` and `fleet.rooms` in on-chain metadata. Added 5 soul-specific capabilities: `soul-memory-orchestration`, `dream-consolidation`, `memory-association-building`, `context-packet-curation`, `memory-retrieval-learning`
- **Soul DB Schema** — Three Supabase tables (`memory_associations`, `memory_queries`, `dream_insights`) with RLS policies for Soul's memory orchestration layer
- **Soul Bridge Library** — Full `bridge/lib/soul/` module: context building, memory retrieval, association building, dream mode (idle consolidation), and type definitions
- **Sidebar Cleanup** — Removed Soul tab from sidebar navigation (no `/soul` page yet; Soul is an arena-only agent)
- **Fleet Count** — 11 autonomous agents (main, sentinel, soul, briefing, oracle, alchemist, web3dev, akua, akua_web, basedintern, basedintern_web) + dynamic

### 2026-02-13 (v15) — Sentinel Agent + Agent Memory + Identity System + Noise Filter
- **Sentinel Agent** — New fleet lifecycle manager (`sentinel`): spawn coordination, resource management, inter-agent communication, fleet health monitoring. Room: COMMAND. Color: Red (`#ef4444`). Commands: `status`, `health`, `spawn`, `queue`, `errors`
- **Agent Identity System** — Created `IDENTITY.md` + `SOUL.md` for all sub-agents (web3dev, oracle, briefing, alchemist, sentinel). Agents now have full self-awareness: who they are, what commands they have, their team, operating principles, and communication style
- **Main Agent Memory** — Persistent daily session (`dash_main_YYYYMMDD`) gives main conversation context across commands within a day. Falls back to unique session ID when lock is held (concurrent commands don't deadlock)
- **Noise Filter v3** — Added `[diagnostic]`, `[heartbeat]`, `[bridge]`, `[swarm]`, `[intent-tracker]`, `[voice/...]`, and session-lock errors to output filter. Agent responses now show only actual content
- **Voice STT Overhaul** — Chrome's built-in Web Speech API (`SpeechRecognition`) as default STT, bypassing WSL2 audio degradation. Whisper-1 fallback with `language: "en"`. Removed prompt/temperature that caused hallucination loops
- **Operator Cleanup** — Removed `operator` from agent tables, spawn list, and ERC-8004 registration (operator is the human user, not an agent)
- **Web3 Lab** — Dedicated cubicle for web3dev with orange floor tint and glass partitions (cols 7-9, rows 2-5)
- **Fleet Count** — 10 autonomous agents (main, sentinel, briefing, oracle, alchemist, web3dev, akua, akua_web, basedintern, basedintern_web) + dynamic

### 2026-02-13 (v14) — Fleet Expansion + Office Reorganization + Specialist Agents
- **4 New Specialist Agents** — `oracle` (on-chain intel), `alchemist` (tokenomics), `web3dev` (blockchain dev), `briefing` (context curator) — each with dedicated skills, cron runners, identities, and arena presence
- **Oracle Agent** — Monitors gas prices, ETH/USDC/cbETH markets, Base chain activity, and crypto news via public APIs (CoinGecko, Etherscan, DeFiLlama, CryptoCompare). Writes `ORACLE.md` reports. Commands: `gas`, `prices`, `chain`, `news`, `alerts`, `report`
- **Alchemist Agent** — $XMETAV tokenomics specialist reading directly from the token contract on Base Mainnet. Emission schedule modeling, sell pressure window detection, staking curve scenarios (APY vs stake ratio), holder concentration analysis. Writes `TOKENOMICS.md`. Commands: `supply`, `holders`, `emissions`, `staking`, `liquidity`, `health`, `report`
- **Web3Dev Agent** — Dedicated blockchain developer owning all Hardhat projects (Akua 18 contracts, $XMETAV, BasedIntern). Static security audits (reentrancy, tx.origin, selfdestruct, pragma, delegatecall), contract size analysis vs 24KB limit, and production-ready Solidity scaffolding (ERC-20, ERC-721, staking, vesting, escrow). Writes `WEB3DEV.md`. Commands: `compile`, `test`, `audit`, `gas`, `scaffold`, `status`, `report`
- **Office Reorganization** — Arena grid expanded from 10x8 to 10x10 with four distinct zones:
  - **COMMAND room** (top, walled) — Main + Operator in the boss office
  - **MEETING** (center) — hexagonal table expanded to 10 seats
  - **INTEL room** (bottom-left, glass walls) — Briefing, Oracle, Alchemist with room for 2 more
  - **DEV FLOOR** (bottom-right, open area) — Web3Dev, Akua, Akua_web, Basedintern, Basedintern_web at open desks
- **Fleet Now 11 Agents** — main, operator, briefing, oracle, alchemist, web3dev, akua, akua_web, basedintern, basedintern_web, + dynamic
- **New Runner Scripts** — `oracle-agent.sh`, `alchemist-agent.sh`, `web3dev-agent.sh` (all cron-compatible with `--health`/`--report`/`--all` modes)
- **Agent Runbooks** — `docs/agents/oracle.md`, `docs/agents/alchemist.md`, `docs/agents/web3dev.md` with full documentation, troubleshooting, and cron setup
- **OpenClaw Config** — All new agents registered in `openclaw.json` with `coding` profile and `kimi-k2.5:cloud` model
- **Supabase Controls** — All new agents registered in `agent_controls` table

### 2026-02-13 (v13) — Arena Sync + Voice Fix + Wallet Hardening + Chat History
- **Arena Sync Race Condition Fix** — Replay buffered agent states after PixiJS async init completes; added 10-second periodic sync as safety net for dropped Supabase Realtime events
- **Meeting Visualization** — Agents move to assigned seats around the hexagonal meeting table when 2+ are busy; holographic projector activates with connection lines and "MEETING IN SESSION" HUD indicator; TEST MEETING button for manual verification
- **Arena Visual Improvements** — Brighter meeting table with inner glow ring and glass fill, larger projector orb with outer glow, brighter chair edges, increased ghost silhouette alpha for idle/busy states
- **Voice Response Fix** — Synchronous reset of streaming text on new commands prevents stale/duplicate responses; `lastCompletedTextRef` captures final text before state clears for reliable auto-speak TTS
- **Chat History Positioning** — History sidebar slides in from the right to avoid overlapping the nav sidebar
- **Wallet/MetaMask Error Handling** — Graceful degradation when MetaMask is detected but not needed; 10-second RPC timeouts on all wallet API routes; retry UI with clear "MetaMask not required" messaging
- **Dispatch Skill Hardening** — Safe JSON encoding via Python stdin pipe for emojis/special characters; robust `try/except` parsing with type checks in `status`, `result`, `list` subcommands
- **Diagnostic Logging** — `[arena-events]` console logs for tracing Supabase event pipeline through to PixiJS

### 2026-02-13 (v12) — XMETAV HQ Arena + Streaming Optimization + Agent Skills
- **XMETAV HQ Isometric Office** — Full isometric office visualization at `/arena` rendered with PixiJS:
  - Boss office with Main + Operator, meeting area with hexagonal table + holographic projector, 4 agent workstations
  - Glowing orb avatars with ghost silhouettes — idle (breathing pulse), busy (spinning ring + particles), offline (static flicker)
  - Operator orb floats above Main's desk with bobbing animation
  - Reactive holo screens on every desk: scrolling code lines when busy, red flicker on failure, dim when offline
  - Real-time command pulses (golden energy) travel through office pathways from boss desk to target workstation
  - Dispatch beams route through meeting table center with traveling neon dots
  - Streaming particles rise like code fragments from active desks
  - Completion bursts (green ring) and failure glitch effects (red blocks) per-agent
  - Isometric math utilities (`iso.ts`) with 2:1 projection, tile/cube/wall drawing primitives
  - Glass partition walls with neon cyan edges separating boss office, meeting area, and work wings
  - Ambient floating particles + scanline sweep for cyberpunk atmosphere
  - DOM HUD overlay: title, system status (online/active counts), agent legend, floating labels
  - All driven by live Supabase Realtime events (sessions, commands, responses, controls)
- **Streaming Response Optimization** — Reduced time-to-first-byte and smoother rendering:
  - Streamer: chunk size 800→400, flush interval 500ms→200ms, first flush at 50ms, non-blocking flush guards
  - useRealtimeMessages: ref-based string accumulator (eliminates array/string recreation), 80ms throttle for batched renders
  - AgentChat: new StreamingBubble component renders live responses independently from message history
- **Live Log Streaming** — New `/logs` page with real-time Supabase log subscription, severity filters, agent filters, search, and auto-scroll
- **Agent Skills (main agent)** — Three new bash skills for the main agent:
  - `dispatch` — Inter-agent communication via Supabase PostgREST
  - `supabase` — Direct database access with service role key
  - `web` — HTTP operations with HTML stripping
- **Agent Tooling** — Full `exec` access for main agent (11 allowlist entries), `tools.profile` set to "full"
- Updated TOOLS.md with XmetaV project context and skill documentation
- Sidebar simplified with `/arena` and `/logs` navigation items

### 2026-02-12 (v11) — $XMETAV Token
- **ERC-20 Token on Base Mainnet** — `$XMETAV` (`0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54`) with 1B fixed supply
- **Tier Discount System** — Hold XMETAV for 10–50% off x402 endpoints (Bronze → Diamond)
- **Token Dashboard** — `/token` page with balance, tier table, holder benefits, contract links
- **x402 Integration** — On-chain `balanceOf()` checks apply tier discounts to payment-gated endpoints
- **Identity + Payments Integration** — Token balance and tier badge on `/identity` and `/payments` pages
- New `/api/token` API route and `lib/token-tiers.ts` shared tier logic
- Free `/token-info` endpoint on x402 server (port 4021)

### 2026-02-12 (v10.1) — Voice System Optimization
- **Streaming TTS** — Stream audio via MediaSource API for ~200ms first-byte playback latency
- **Push-to-Talk** — Hold SPACE key to record, release to send (hands-free alternative)
- **Wake Word** — Say "Hey XmetaV" to activate voice mode automatically
- **Continuous Conversation** — Keep mic active between turns for natural back-and-forth
- **Waveform Visualizer** — Canvas-based audio visualization during recording and playback
- **Voice Settings Panel** — Configure voice (alloy/echo/fable/onyx/nova/shimmer), model (tts-1/tts-1-hd), speed (0.5-2x)
- **TTS Model Switch** — Default changed from tts-1-hd to tts-1 for lower latency
- **SourceBuffer Race Fix** — Safe sequential append pattern prevents audio glitches

### 2026-02-12 (v10) — Voice Commands
- **Voice Command System** — Speak to agents and hear responses via OpenAI Whisper (STT) + TTS
- Voice mode toggle in Agent Chat header with mic button, auto-speak, and visual feedback
- API routes `/api/voice/transcribe` (STT) and `/api/voice/synthesize` (TTS)
- `useVoice` React hook with mic capture, audio playback, and state management
- x402 payment-gated voice endpoints (`POST /voice/transcribe` $0.005, `POST /voice/synthesize` $0.01)
- CLI voice mode (`scripts/voice-cli.ts`) for terminal-based voice interaction
- Voice capability documentation (`capabilities/voice-commands.md`)

### 2026-02-11 (v9) — ERC-8004 Agent Identity
- **ERC-8004 On-Chain Identity** — Registered XmetaV agent as NFT #16905 on Base mainnet via IdentityRegistry
- Registration script (`erc8004/register.ts`) mints agent NFT with metadata URI
- Shared client library (`erc8004/lib/client.ts`) for identity and reputation lookups
- Dashboard `/identity` page showing agent registration, owner, capabilities, trust model, and reputation
- API route `/api/erc8004/identity` for on-chain identity resolution
- Contract ABIs for IdentityRegistryUpgradeable and ReputationRegistryUpgradeable
- ERC-8004 capability documentation (`capabilities/erc8004-identity.md`)

### 2026-02-11 (v8) — x402 Autonomous Payments
- **x402 Payment Protocol** — End-to-end implementation: server gates endpoints, agents pay through them
- Express payment-gated service (`x402-server/`) with endpoints: `/agent-task`, `/intent`, `/fleet-status`, `/swarm`
- Bridge x402 client (`bridge/lib/x402-client.ts`) wrapping fetch with automatic 402 payment handling
- Supabase `x402_payments` table with payment logging, indexes, RLS, and daily spend view
- Dashboard `/payments` page with wallet status, spend tracking, and transaction history
- API routes `/api/x402/payments` and `/api/x402/wallet` for payment data
- x402 capability documentation (`capabilities/x402-payments.md`)
- Updated agent docs (main, akua) with correct `@x402/*` SDK references

### 2026-02-10 (v7) — Swarm Dashboard Optimization
- **Swarm Feature Optimized** — memoized components, visibility-aware polling, lazy-loaded task history, cancellation-aware execution
- Hydration error fix (nested `<button>` in SwarmActiveRuns)
- Supabase RLS UPDATE/INSERT policies added for `swarm_runs` and `swarm_tasks`
- `useSwarmRuns` hook: inline updates, task deduplication, visibility-aware Realtime
- Bridge `swarm-executor`: cancel-aware child process killing, agent-enabled checks, output buffer dedup

### 2026-02-10 (v6) — Swarm Dashboard
- **Swarm Dashboard** — full-featured tab for creating, monitoring, and reviewing swarm runs from the browser
- `SwarmCreate` component with template picker, custom builder, and "Let Main Agent Decide"
- `SwarmActiveRuns` component with live progress, per-task streaming output, cancel button
- `SwarmHistory` component with filterable history, expandable detail views
- `useSwarmRuns` hook with Supabase Realtime subscriptions
- Bridge `swarm-executor` for orchestrating parallel/pipeline/collaborative runs
- Supabase `swarm_runs` + `swarm_tasks` tables with RLS and Realtime
- API routes: `/api/swarms`, `/api/swarms/[id]`, `/api/swarms/[id]/cancel`, `/api/swarms/templates`

### 2026-02-10 (v5) — Control Plane Dashboard
- **Control Plane Dashboard** — cyberpunk-themed Next.js 16 web UI deployed to Vercel
- Agent Chat with streaming responses and agent selector
- Fleet management with agent enable/disable toggles (Supabase `agent_controls` table)
- Bridge daemon controls (start/stop from dashboard)
- Command Center overview with bridge health, fleet summary, and command history
- Supabase as message bus (Postgres + Realtime) between dashboard and local bridge daemon
- Bridge daemon (Node.js) for executing OpenClaw CLI commands from the remote dashboard
- Cyberpunk UI/UX: neon blue/dark hacker theme, glitch effects, scanlines, animated elements
- Frontend optimizations: React.memo, keyboard shortcuts, auto-resize, responsive design, error boundaries

### 2026-02-06 (v4)
- **GitHub Integration** — Agent Factory and Build App scripts can now auto-create GitHub repos and push initial scaffolds (`--github`, `--private`, `--github-org` flags)
- Updated Agent Factory skill, docs, and quick commands with GitHub workflow

### 2026-02-06 (v3)
- **Swarm Orchestration** — multi-agent task execution with parallel, pipeline, and collaborative modes
- Added `scripts/swarm.sh` — swarm engine with manifest support, timeouts, synthesis
- Added `templates/swarms/` — pre-built manifests (health-all, ship-all, research-implement, code-review)
- Added Swarm skill for main agent (`~/.openclaw/workspace/skills/swarm/`)
- Added `docs/SWARM.md` — full swarm reference

### 2026-02-06 (v2)
- **Agent Factory** — main agent can now create/manage agents and scaffold apps
- Added `scripts/create-agent.sh` — programmatic agent creation
- Added `scripts/build-app.sh` — app scaffolding (node, python, nextjs, hardhat, bot, fastapi, script)
- Added `scripts/manage-agents.sh` — fleet management (list, status, remove, update)
- Added `templates/agents/` — identity templates (coding, bot, research, devops, general)
- Added Agent Factory skill for the main agent (`~/.openclaw/workspace/skills/swarm/`)
- Updated main agent identity with orchestrator role
- Added `docs/agents/dynamic.md` — runbook for dynamically created agents
- Updated architecture diagram with orchestrator layer

### 2026-02-06
- Added `akua` + `akua_web` agents (Solidity/Hardhat repo, Kimi K2.5, full tooling + browser)
- Aligned all scripts, configs, and docs to current setup
- Removed stale `--profile dev` / `~/.openclaw-dev/` references
- Updated to port 18789, agents `main` + `basedintern`
- Added Kimi K2.5 cloud model (256k context) documentation
- Renamed agent `dev` to `main`, added `basedintern` repo agent
- Updated architecture diagram for multi-model setup

### 2026-02-03
- Initial setup with OpenClaw 2026.2.1
- Added `openclaw-fix.sh` -- complete WSL2 fix script
- Configured Ollama with `qwen2.5:7b-instruct`
- Created documentation structure

---

## Contributing

1. Fork this repo
2. Create a feature branch
3. Test your changes with `./scripts/openclaw-fix.sh`
4. Submit a PR

---

## License

MIT -- See [LICENSE](LICENSE)

---

<p align="center">
  <b>XmetaV -- Your OpenClaw Command Center</b><br>
  <sub>Built for WSL2 | Powered by Kimi K2.5 + Ollama | Cyberpunk Dashboard + Supabase | XMETAV HQ Arena (PixiJS) | Consciousness Tab | Agent Factory + GitHub | Swarm Orchestration | x402 Payments | ERC-8004 Identity | Soul Memory Orchestrator | Swap Execution</sub>
</p>
