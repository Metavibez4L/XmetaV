# XmetaV -- OpenClaw Command Center

> **Your central hub for managing OpenClaw agents, gateways, and infrastructure on WSL2/Linux**

[![OpenClaw](https://img.shields.io/badge/OpenClaw-2026.2.1-red?style=flat-square)](https://openclaw.dev)
[![Platform](https://img.shields.io/badge/Platform-WSL2%20%7C%20Linux-blue?style=flat-square)](https://docs.microsoft.com/en-us/windows/wsl/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

```
 ___   ___                    __           ___   ___
 \  \ /  / _ __ ___    ___  _/  |_  __ _   \  \ /  /
  \  V  / | '_ ` _ \  / _ \ \   __\/ _` |   \  V  /
  /  X  \ | | | | | ||  __/  |  | | (_| |   /     \
 /__/ \__\|_| |_| |_| \___|  |__|  \__,_|  /__/ \__\

      [ COMMAND CENTER : AGENT ORCHESTRATION ]
  _______________________________________________
 |                                               |
 |   agents:  main | basedintern | akua          |
 |   swarm:   parallel | pipeline | collab       |
 |   models:  kimi-k2.5:cloud (256k, all agents) |
 |   gateway: ws://127.0.0.1:18789              |
 |   engine:  Ollama + CUDA  |  RTX 4070        |
 |_______________________________________________|
```

---

## Features

- **Agent Factory** — main agent can create new agents, scaffold apps, create GitHub repos, and manage the fleet
- **Swarm Orchestration** — parallel, pipeline, and collaborative multi-agent task execution
- Multi-agent management (`main` + `basedintern` + `akua` + dynamic agents)
- Multi-model support (local qwen2.5 + cloud kimi-k2.5)
- App scaffolding (Node.js, Python, Next.js, Hardhat, bots, FastAPI)
- One-command setup and troubleshooting scripts
- Ollama integration for local LLMs with GPU acceleration
- Full tool calling (exec, read, write, process, browser, web)
- OpenClaw-managed browser automation
- GitHub skill integration for repo operations
- WSL2/Linux optimized workflows

---

## What is XmetaV?

**XmetaV** is your operational command center for managing [OpenClaw](https://openclaw.dev) -- an AI agent automation platform. This repository contains:

- **Agent Factory** -- Create agents on the fly, scaffold apps, create GitHub repos, manage the fleet
- **Swarm Engine** -- Orchestrate multi-agent tasks (parallel, pipeline, collaborative)
- **Setup & Fix Scripts** -- Automated solutions for common issues
- **Configuration Templates** -- Battle-tested configs for Ollama + Kimi K2.5
- **Documentation** -- Runbooks, checklists, and troubleshooting guides
- **Agent Definitions** -- Multi-agent profiles and workspaces
- **Infrastructure as Code** -- Reproducible OpenClaw deployments

---

## Repository Structure

```
XmetaV/
|-- README.md                 # You are here
|-- LICENSE                   # MIT License
|
|-- scripts/                  # Executable automation scripts
|   |-- openclaw-fix.sh       # Main fix script (gateway + ollama + locks)
|   |-- start-gateway.sh      # Start gateway in background
|   |-- stop-all.sh           # Stop processes + clear stale locks
|   |-- health-check.sh       # Quick system health verification
|   |-- agent-task.sh         # Single atomic task wrapper
|   |-- agent-pipeline.sh     # Multi-step pipeline workflows
|   |-- create-agent.sh       # [NEW] Agent Factory — create agents
|   |-- build-app.sh          # [NEW] Agent Factory — scaffold apps
|   |-- manage-agents.sh      # [NEW] Agent Factory — manage fleet
|   +-- swarm.sh              # [NEW] Swarm — multi-agent orchestration
|
|-- configs/                  # Configuration files & templates
|   +-- openclaw.json.fixed   # Known-good config for WSL2 + Ollama
|
|-- templates/                # [NEW] Agent identity & swarm templates
|   |-- agents/               # Per-template identity files
|   |   |-- general.md        # Generic agent template
|   |   |-- coding.md         # Software development agent
|   |   |-- bot.md            # Discord/Telegram bot agent
|   |   |-- research.md       # Web research agent
|   |   +-- devops.md         # Infrastructure/ops agent
|   +-- swarms/               # [NEW] Pre-built swarm manifests
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
|   +-- expand.md             # How to add models, skills, channels, agents
|
+-- docs/                     # Documentation & runbooks
    |-- ARCHITECTURE.md       # System architecture overview
    |-- AGENTS.md             # Agent configuration guide
    |-- STATUS.md             # Current known-good settings + checks
    |-- TROUBLESHOOTING.md    # Common issues & solutions
    |-- OLLAMA-SETUP.md       # Ollama integration guide
    |-- OPENCLAW-FIX-CHECKLIST.md  # Verification checklist
    |-- GITHUB-SKILL-STATUS.md     # GitHub skill status
    |-- SWARM.md              # [NEW] Multi-agent swarm reference
    +-- agents/               # Per-agent runbooks
        |-- README.md
        |-- main.md           # main agent runbook
        |-- basedintern.md    # basedintern agent runbook
        |-- akua.md           # akua agent runbook
        +-- dynamic.md        # [NEW] Dynamic agent runbook
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

### Swarm Orchestration

Dispatch tasks across multiple agents with three modes:

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

```
+=========================================================================+
|                          XmetaV (This Repo)                             |
|  +-----------+  +-----------+  +-----------+  +-----------+             |
|  |  Scripts  |  |  Configs  |  |   Docs    |  | Templates |             |
|  +-----+-----+  +-----+-----+  +-----------+  +-----------+             |
+---------+------------+-------------------------------------------------+
          |            |
          v            v
+=========================================================================+
|                       OpenClaw Runtime                                   |
|  +-------------------------------------------------------------------+  |
|  |                  Gateway (ws://127.0.0.1:18789)                    |  |
|  |  +-----------+  +-----------+  +-----------+  +-----------+       |  |
|  |  |  Agent    |  |  Session  |  |  Channel  |  |   Skill   |       |  |
|  |  |  Runtime  |  |  Manager  |  |  Router   |  |  Executor |       |  |
|  |  +-----+-----+  +-----------+  +-----------+  +-----------+       |  |
|  +--------+----------------------------------------------------------+  |
|            |                                                             |
|  +--------v----------------------------------------------------------+  |
|  |             main agent (ORCHESTRATOR)                              |  |
|  |                                                                    |  |
|  |  +------------------+  +---------------+  +------------------+    |  |
|  |  | Agent Factory    |  | Build App     |  | Manage Agents    |    |  |
|  |  | (create-agent.sh)|  | (build-app.sh)|  | (manage-agents)  |    |  |
|  |  +--------+---------+  +-------+-------+  +--------+---------+    |  |
|  |           |                    |                    |              |  |
|  |           v                    v                    v              |  |
|  |     openclaw.json        workspaces/          fleet health        |  |
|  |                                                                    |  |
|  |  +-------- SWARM ENGINE (swarm.sh) ----------------------------+  |  |
|  |  |                                                              |  |  |
|  |  |  PARALLEL         PIPELINE          COLLABORATIVE           |  |  |
|  |  |  ┌──┬──┐         A -> B -> C       ┌──┬──┐                 |  |  |
|  |  |  A  B  C                            A  B  |                 |  |  |
|  |  |  └──┴──┘                            └──┴──> synthesize      |  |  |
|  |  |         \             |             /                       |  |  |
|  |  |          v            v            v                        |  |  |
|  |  |       ~/.openclaw/swarm/<run-id>/                           |  |  |
|  |  |         manifest.json | *.out | summary.md                  |  |  |
|  |  +----------------------------------------------------------+  |  |
|  +-------------------------------------------------------------------+  |
|            |                                                             |
|  +---------v---------------------------------------------------------+  |
|  |                      Agent Fleet                                   |  |
|  |  +----------+  +-----------+  +------+  +--------+  +--------+   |  |
|  |  |   main   |  |basedintern|  | akua |  |  akua  |  |dynamic |   |  |
|  |  | (orch.)  |  |  + _web   |  |+ _web|  |        |  | agents |   |  |
|  |  +----------+  +-----------+  +------+  +--------+  +--------+   |  |
|  +-------------------------------------------------------------------+  |
+---------|---------------------------------------------------------------+
          |
          v
+=========================================================================+
|                       Model Providers                                    |
|  +---------------------------+  +---------------------------+           |
|  |    Ollama (Local Host)    |  |   Cloud Providers         |           |
|  |  http://127.0.0.1:11434  |  |   (Anthropic, OpenAI)     |           |
|  |  +- qwen2.5:7b-instruct  |  |                           |           |
|  |  +- kimi-k2.5:cloud      |  |                           |           |
|  |     (Ollama Cloud, 256k) |  |                           |           |
|  +---------------------------+  +---------------------------+           |
+=========================================================================+
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
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture deep-dive |
| [AGENTS.md](docs/AGENTS.md) | Agent configuration & customization |
| [agents/](docs/agents/) | Per-agent runbooks (main, basedintern, akua) |
| [STATUS.md](docs/STATUS.md) | Current known-good settings + verification commands |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues & solutions |
| [OLLAMA-SETUP.md](docs/OLLAMA-SETUP.md) | Ollama integration guide |
| [OPENCLAW-FIX-CHECKLIST.md](docs/OPENCLAW-FIX-CHECKLIST.md) | Verification checklist |
| [GITHUB-SKILL-STATUS.md](docs/GITHUB-SKILL-STATUS.md) | GitHub skill status |
| [SWARM.md](docs/SWARM.md) | Multi-agent swarm orchestration reference |

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

## Changelog

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
- Added Agent Factory skill for the main agent (`~/.openclaw/workspace/skills/agent-factory/`)
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
  <sub>Built for WSL2 | Powered by Kimi K2.5 + Ollama | Agent Factory + GitHub | Swarm Orchestration</sub>
</p>
