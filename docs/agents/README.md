# Agents (Detailed)

This directory contains **agent-by-agent runbooks** for the OpenClaw agents configured on this machine.

> Note: These docs intentionally avoid including any secrets (gateway tokens, API keys). Use `openclaw config get ...` locally when you need exact values.

## Core Fleet (11 agents)

- [`main`](./main.md) — **orchestrator** (agent factory + swarm + command center)
- [`sentinel`](./sentinel.md) — **fleet ops** (lifecycle manager, spawn coordination, health monitoring)
- [`soul`](./soul.md) — **memory orchestrator** (context curation, dream consolidation, association building, memory retrieval learning)
- [`briefing`](./briefing.md) — **context curator** (continuity, health sentinel, memory distillation)
- [`oracle`](./oracle.md) — **on-chain intel** (gas, prices, chain activity, crypto sentiment)
- [`alchemist`](./alchemist.md) — **tokenomics** (supply, emissions, staking curves, liquidity)
- [`web3dev`](./web3dev.md) — **blockchain dev** (compile, test, audit, deploy smart contracts)
- [`basedintern`](./basedintern.md) — repo agent (coding tools, lean) pinned to `/home/manifest/basedintern`
- [`basedintern_web`](./basedintern.md) — same repo, full tools (browser/web) — use sparingly to save Kimi quota
- [`akua`](./akua.md) — repo agent (coding tools, lean) pinned to `/home/manifest/akua`
- [`akua_web`](./akua.md) — same repo, full tools (browser/web) — use sparingly to save Kimi quota

All agents use **Kimi K2.5** (256k context) via Ollama. All sub-agents have `IDENTITY.md` + `SOUL.md` files defining their purpose, commands, team awareness, and operating principles.

## Dynamic Agents

- [`dynamic`](./dynamic.md) — runbook for agents created at runtime by the Agent Factory

Dynamic agents are created by the `main` agent using the Agent Factory skill. Each gets its own runbook auto-generated at `docs/agents/<agent-id>.md`. Agents can also be created with a **GitHub repo** (`--github` flag) — the repo is auto-created under `Metavibez4L` and the initial scaffold is pushed.

## Dashboard Fleet Management

All agents can be managed from the **Control Plane Dashboard** at http://localhost:3000.

### Fleet Page (`/fleet`)

- View all agents with their status, workspace, model, and tools profile
- **Enable/Disable toggle** — flip agents on/off; the bridge daemon enforces this by blocking commands to disabled agents
- **Send Task** — dispatch a one-off task to any agent directly from the browser

### Agent Chat (`/agent`)

- Full-screen streaming chat with an agent selector dropdown
- Commands are routed through Supabase to the bridge daemon and back
- Real-time response streaming

### Swarms Page (`/swarms`)

- Create swarm runs from templates or a custom builder
- "Let Main Agent Decide" — the main agent autonomously creates a swarm
- Live monitoring of active runs with per-task streaming output
- Cancel running swarms with one click
- Filterable history of past runs

### Payments Page (`/payments`)

- x402 wallet address and connection status
- Total and daily USDC spend tracking on Base
- Payment history table with BaseScan transaction links
- List of x402-gated API endpoints with pricing
- $XMETAV token tier card with current discount

### Identity Page (`/identity`)

- ERC-8004 on-chain agent identity (NFT #16905 on Base mainnet)
- Registration status, owner, and wallet details
- Agent capabilities, services, and trust model from metadata
- Contract addresses with BaseScan links
- Agent ID lookup for inspecting other registered agents
- $XMETAV token balance and tier badge

### Token Page (`/token`)

- $XMETAV ERC-20 token overview (contract `0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54`)
- Agent wallet balance and current tier (None / Bronze / Silver / Gold / Diamond)
- Tier table with thresholds, discount %, and daily spend limits
- Holder benefits and contract links to BaseScan

See the [dashboard README](../../dashboard/README.md) for setup and full documentation.

## Swarm Orchestration (CLI)

The `main` agent can also coordinate multi-agent operations via the CLI Swarm skill:

| Mode | What it does |
|------|-------------|
| **Parallel** | Run tasks simultaneously across agents |
| **Pipeline** | Chain agents — output from one feeds into the next |
| **Collaborative** | Same task to multiple agents, then synthesize |

```bash
# Quick parallel
./scripts/swarm.sh --parallel basedintern "Run tests" akua "Compile contracts"

# Quick pipeline
./scripts/swarm.sh --pipeline main "Research X" basedintern "Implement findings"

# Quick collaborative
./scripts/swarm.sh --collab "Review security" basedintern akua
```

See [`../SWARM.md`](../SWARM.md) for the full CLI reference.

## Common commands (applies to all agents)

```bash
# List agents + their workspaces/models
openclaw agents list

# Run an agent in stable local mode (recommended for Ollama)
openclaw agent --agent main --local --thinking off \
  --session-id smoke_$(date +%s) \
  --message "What is 2+2? Reply with just 4."

# Clear stale session locks (safe)
find ~/.openclaw -name "*.lock" -type f -delete

# Start the dashboard (browser-based management)
cd dashboard && npm run dev

# Start the bridge daemon (dashboard <-> OpenClaw)
cd dashboard/bridge && npm run dev  # local watch
# or: npm start  # one-shot
```

## Tooling baseline

This command center uses:

- **Ollama** OpenAI-compatible API at `http://127.0.0.1:11434/v1`
- **API mode**: `openai-responses` (required for tool calling)
- **API key**: `"local"` (required placeholder for OpenClaw auth checks)
- **Tools profile**: `full` for `main`, `coding` for repo agents, `full` for `_web` companions
- **Dashboard**: Next.js 16 + Supabase (Realtime + Postgres)
- **Bridge Daemon**: Node.js process bridging dashboard to OpenClaw CLI

Quick sanity checks:

```bash
openclaw config get models.providers.ollama.baseUrl
openclaw config get models.providers.ollama.api
openclaw config get tools
```
