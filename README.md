# XmetaV -- OpenClaw Command Center

> **Your central hub for managing OpenClaw agents, gateways, and infrastructure on WSL2/Linux**

[![OpenClaw](https://img.shields.io/badge/OpenClaw-2026.2.1-red?style=flat-square)](https://openclaw.dev)
[![Platform](https://img.shields.io/badge/Platform-WSL2%20%7C%20Linux-blue?style=flat-square)](https://docs.microsoft.com/en-us/windows/wsl/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

```
XmetaV Command Center -- Automation Infrastructure Management
```

---

## Features

- Multi-agent management (`main` + `basedintern`)
- Multi-model support (local qwen2.5 + cloud kimi-k2.5)
- One-command setup and troubleshooting scripts
- Ollama integration for local LLMs with GPU acceleration
- Full tool calling (exec, read, write, process, browser, web)
- OpenClaw-managed browser automation
- GitHub skill integration for repo operations
- WSL2/Linux optimized workflows

---

## What is XmetaV?

**XmetaV** is your operational command center for managing [OpenClaw](https://openclaw.dev) -- an AI agent automation platform. This repository contains:

- **Setup & Fix Scripts** -- Automated solutions for common issues
- **Configuration Templates** -- Battle-tested configs for Ollama + local LLMs
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
|   +-- health-check.sh       # Quick system health verification
|
|-- configs/                  # Configuration files & templates
|   +-- openclaw.json.fixed   # Known-good config for WSL2 + Ollama
|
|-- capabilities/             # Quick-reference command guides
|   |-- README.md             # Capabilities overview
|   |-- quick-commands.md     # Essential daily-use commands
|   |-- agent-tasks.md        # AI agent usage examples
|   |-- cheatsheet.md         # One-page reference card
|   |-- management.md         # System administration commands
|   +-- expand.md             # How to add models, skills, channels
|
+-- docs/                     # Documentation & runbooks
    |-- ARCHITECTURE.md       # System architecture overview
    |-- AGENTS.md             # Agent configuration guide
    |-- STATUS.md             # Current known-good settings + checks
    |-- TROUBLESHOOTING.md    # Common issues & solutions
    |-- OLLAMA-SETUP.md       # Ollama integration guide
    |-- OPENCLAW-FIX-CHECKLIST.md  # Verification checklist
    |-- GITHUB-SKILL-STATUS.md     # GitHub skill status
    +-- agents/               # Per-agent runbooks
        |-- README.md
        |-- main.md           # main agent runbook
        +-- basedintern.md    # basedintern agent runbook
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
| Model | `ollama/qwen2.5:7b-instruct` |
| Workspace | `~/.openclaw/workspace` |
| Tools | `coding` profile (exec, read, write, process) |

```bash
openclaw agent --agent main --local --thinking off --message "Hello!"
```

### Agent: `basedintern`

| Property | Value |
|----------|-------|
| ID | `basedintern` |
| Model | `ollama/kimi-k2.5:cloud` (256k context) |
| Workspace | `/home/manifest/basedintern` |
| Tools | `full` profile (fs, runtime, web, browser, automation) |
| Elevated | Yes |

```bash
openclaw agent --agent basedintern --local --thinking off \
  --message "Summarize this repo and run npm test."
```

### Creating New Agents

Add an agent to `~/.openclaw/openclaw.json` under `agents.list`:

```json
{
  "id": "my-agent",
  "workspace": "/path/to/workspace",
  "model": {
    "primary": "ollama/qwen2.5:7b-instruct"
  }
}
```

Then verify:

```bash
openclaw agents list
openclaw agent --agent my-agent --local --message "Hello"
```

---

## System Architecture

```
+-------------------------------------------------------------------------+
|                          XmetaV (This Repo)                             |
|  +-----------+  +-----------+  +-----------+  +-----------+             |
|  |  Scripts  |  |  Configs  |  |   Docs    |  |  Agents   |             |
|  +-----+-----+  +-----+-----+  +-----------+  +-----------+             |
+---------+------------+-------------------------------------------------+
          |            |
          v            v
+-------------------------------------------------------------------------+
|                       OpenClaw Runtime                                   |
|  +-------------------------------------------------------------------+  |
|  |                  Gateway (ws://127.0.0.1:18789)                    |  |
|  |  +-----------+  +-----------+  +-----------+  +-----------+       |  |
|  |  |  Agent    |  |  Session  |  |  Channel  |  |   Skill   |       |  |
|  |  |  Runtime  |  |  Manager  |  |  Router   |  |  Executor |       |  |
|  |  +-----+-----+  +-----------+  +-----------+  +-----------+       |  |
|  +--------+----------------------------------------------------------+  |
+-----------|-------------------------------------------------------------+
            |
            v
+-------------------------------------------------------------------------+
|                       Model Providers                                    |
|  +---------------------------+  +---------------------------+           |
|  |    Ollama (Local Host)    |  |   Cloud Providers         |           |
|  |  http://127.0.0.1:11434  |  |   (Anthropic, OpenAI)     |           |
|  |  +- qwen2.5:7b-instruct  |  |                           |           |
|  |  +- kimi-k2.5:cloud      |  |                           |           |
|  |     (Ollama Cloud, 256k) |  |                           |           |
|  +---------------------------+  +---------------------------+           |
+-------------------------------------------------------------------------+
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
| [agents/](docs/agents/) | Per-agent runbooks (main, basedintern) |
| [STATUS.md](docs/STATUS.md) | Current known-good settings + verification commands |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues & solutions |
| [OLLAMA-SETUP.md](docs/OLLAMA-SETUP.md) | Ollama integration guide |
| [OPENCLAW-FIX-CHECKLIST.md](docs/OPENCLAW-FIX-CHECKLIST.md) | Verification checklist |
| [GITHUB-SKILL-STATUS.md](docs/GITHUB-SKILL-STATUS.md) | GitHub skill status |

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

### 2026-02-06
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
  <sub>Built for WSL2 | Powered by Ollama | Multi-agent | Multi-model</sub>
</p>
