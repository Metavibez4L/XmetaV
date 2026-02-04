# 🦞 XmetaV — OpenClaw Command Center

> **Your central hub for managing OpenClaw agents, gateways, and infrastructure on WSL2/Linux**

[![OpenClaw](https://img.shields.io/badge/OpenClaw-2026.2.1-red?style=flat-square)](https://openclaw.dev)
[![Platform](https://img.shields.io/badge/Platform-WSL2%20%7C%20Linux-blue?style=flat-square)](https://docs.microsoft.com/en-us/windows/wsl/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║  __  __                _        __     __                                     ║
║  \ \/ / _ __ ___   ___| |_ __ _ \ \   / /                                     ║
║   \  / | '_ ` _ \ / _ \ __/ _` | \ \ / /                                      ║
║   /  \ | | | | | |  __/ || (_| |  \ V /                                       ║
║  /_/\_\|_| |_| |_|\___|\__\__,_|   \_/                                        ║
║                                                                               ║
║  XmetaV Command Center — Automation Infrastructure Management                  ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

---

## 🚀 Features

- Automated agent and gateway management
- One-command setup and troubleshooting scripts
- Ollama integration for local LLMs
- Customizable agent profiles and workspaces
- Skill system for extensible automation
- GitHub skill integration for repo operations
- Self-evolve skill for self-modifying automation
- WSL2/Linux optimized workflows

---

## 🎯 What is XmetaV?

**XmetaV** is your operational command center for managing [OpenClaw](https://openclaw.dev) — an AI agent automation platform. This repository contains:

- 🔧 **Setup & Fix Scripts** — Automated solutions for common issues
- ⚙️ **Configuration Templates** — Battle-tested configs for Ollama + local LLMs
- 📚 **Documentation** — Runbooks, checklists, and troubleshooting guides
- 🤖 **Agent Definitions** — Custom agent profiles and workspaces
- 🔐 **Infrastructure as Code** — Reproducible OpenClaw deployments

---

## 📁 Repository Structure

```
XmetaV/
├── README.md                 # You are here
├── LICENSE                   # MIT License
│
├── scripts/                  # Executable automation scripts
│   ├── openclaw-fix.sh       # 🔧 Main fix script (gateway + ollama + locks)
│   ├── start-gateway.sh      # Start gateway in background
│   ├── stop-all.sh           # Stop processes + clear stale locks
│   └── health-check.sh       # Quick system health verification
│
├── configs/                  # Configuration files & templates
│   ├── openclaw.json.fixed   # ✅ Known-good config for WSL2 + Ollama
│
└── docs/                     # Documentation & runbooks
    ├── OPENCLAW-FIX-CHECKLIST.md   # Verification checklist
    ├── ARCHITECTURE.md             # System architecture overview
    ├── AGENTS.md                   # Agent configuration guide
    ├── TROUBLESHOOTING.md          # Common issues & solutions
    └── OLLAMA-SETUP.md             # Ollama integration guide
```

---

## 🚀 Quick Start

### Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| OpenClaw CLI | 2026.2.1+ | `openclaw --version` |
| Node.js | 22.x | `node --version` |
| Ollama | Latest (native install) | `ollama --version` |
| NVIDIA GPU | CUDA support | `nvidia-smi` |
| WSL2 (if Windows) | 2.0+ | `wsl --version` |

> ⚠️ **Important**: Use the **native Ollama installer** (`curl -fsSL https://ollama.com/install.sh | sh`), NOT the snap version. Snap Ollama lacks proper CUDA/GPU support and will run on CPU only.

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
- ✅ Kill stale processes
- ✅ Remove lock files
- ✅ Patch configuration for local Ollama
- ✅ Start the gateway
- ✅ Verify everything works

### 3. Verify Installation

```bash
openclaw --profile dev health

# Use --local flag for reliable agent calls (bypasses gateway websocket)
openclaw --profile dev agent --agent dev --local --session-id test --message "Say hello"
```

> **Note**: The `--local` flag runs the agent embedded (bypasses gateway websocket). This is the recommended mode for local Ollama usage.

---

## 🔧 Available Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `openclaw-fix.sh` | **Complete fix** — kills zombies, clears locks, patches config, starts gateway | `./scripts/openclaw-fix.sh` |
| `start-gateway.sh` | Start gateway in background on port 19001 | `./scripts/start-gateway.sh` |
| `stop-all.sh` | Stop all OpenClaw processes | `./scripts/stop-all.sh` |
| `health-check.sh` | Quick health verification | `./scripts/health-check.sh` |

---

## ⚙️ Configuration

### Profile: `dev`

This repo is configured for the **dev** profile:

| Setting | Value |
|---------|-------|
| State Directory | `~/.openclaw-dev/` |
| Config File | `~/.openclaw-dev/openclaw.json` |
| Gateway Port | `19001` |
| Gateway Mode | `local` |
| Default Agent | `dev` |

### Model Provider: Ollama

| Setting | Value |
|---------|-------|
| Base URL | `http://127.0.0.1:11434/v1` |
| API Mode | `openai-completions` |
| Primary Model | `qwen2.5:7b-instruct` |
| Context Window | 32768 tokens |

### Key Config Values

```json
{
  "gateway": {
    "mode": "local",
    "bind": "loopback"
  },
  "models": {
    "providers": {
      "ollama": {
        "baseUrl": "http://127.0.0.1:11434/v1",
        "api": "openai-completions"
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

## 🤖 Agents

### Default Agent: `dev`

| Property | Value |
|----------|-------|
| ID | `dev` |
| Name | C3-PO |
| Theme | Protocol Droid |
| Emoji | 🤖 |
| Workspace | `~/.openclaw/workspace-dev` |

### Creating New Agents

```bash
# List existing agents
openclaw --profile dev agents list

# Create a new agent
openclaw --profile dev agents create --id myagent --name "My Agent"

# Run with specific agent
openclaw --profile dev agent --agent myagent --message "Hello"
```

---

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              XmetaV (This Repo)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Scripts   │  │   Configs   │  │    Docs     │  │   Agents    │    │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘  └─────────────┘    │
└─────────┼────────────────┼──────────────────────────────────────────────┘
          │                │
          ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         OpenClaw Runtime                                │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Gateway (ws://127.0.0.1:19001)                │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │   │
│  │  │  Agent    │  │  Session  │  │  Channel  │  │   Skill   │    │   │
│  │  │  Runtime  │  │  Manager  │  │  Router   │  │  Executor │    │   │
│  │  └─────┬─────┘  └───────────┘  └───────────┘  └───────────┘    │   │
│  └────────┼────────────────────────────────────────────────────────┘   │
└───────────┼─────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Model Providers                                 │
│  ┌─────────────────────────┐  ┌─────────────────────────┐              │
│  │   Ollama (Local)        │  │   Cloud Providers       │              │
│  │   http://127.0.0.1:11434│  │   (Anthropic, OpenAI)   │              │
│  │   ├─ qwen2.5:7b-instruct│  │                         │              │
│  │   └─ qwen2.5vl:7b       │  │                         │              │
│  └─────────────────────────┘  └─────────────────────────┘              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔍 Common Commands

### Gateway Management

```bash
# Start gateway (foreground)
openclaw --profile dev gateway --port 19001

# Start gateway (background with force)
openclaw --profile dev gateway --port 19001 --force &

# Check gateway status
openclaw --profile dev gateway status

# View gateway health
openclaw --profile dev health

# View logs
openclaw --profile dev logs --tail 50
```

### Agent Operations

```bash
# Simple message
openclaw --profile dev agent --message "What is 2+2?"

# With specific agent and session
openclaw --profile dev agent \
  --agent dev \
  --session-id my-session \
  --message "Summarize this conversation"

# List sessions
openclaw --profile dev sessions list
```

### Configuration

```bash
# View current config
openclaw --profile dev config get

# Set a value
openclaw --profile dev config set gateway.mode local

# View specific key
openclaw --profile dev config get models.providers.ollama.api
```

### Models

```bash
# List configured models
openclaw --profile dev models list

# Test model connectivity
curl http://127.0.0.1:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen2.5:7b-instruct","messages":[{"role":"user","content":"hi"}]}'
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| `Gateway closed (1006)` | Run `./scripts/openclaw-fix.sh` — gateway not running or wrong port |
| `Waiting for agent reply…` forever | Check `api: openai-chat-completions` in config |
| `Session locked` | `find ~/.openclaw-dev -name "*.lock" -delete` |
| `Connection refused` to Ollama | `ollama serve` or `snap start ollama` |
| Port 19001 already in use | `fuser -k 19001/tcp` then restart gateway |

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for detailed solutions.

---

## 📚 Documentation Index

| Document | Description |
|----------|-------------|
| [OPENCLAW-FIX-CHECKLIST.md](docs/OPENCLAW-FIX-CHECKLIST.md) | Step-by-step verification checklist |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture deep-dive |
| [AGENTS.md](docs/AGENTS.md) | Agent configuration & customization |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues & solutions |
| [OLLAMA-SETUP.md](docs/OLLAMA-SETUP.md) | Ollama integration guide |

---

## 🐙 GitHub Skill Integration

The GitHub skill is now installed, authenticated, and working with OpenClaw agents.

- To use: `/github help`, `/github status`, `/github issue list`, etc.
- Requires: GitHub CLI (`gh`) installed and authenticated (`gh auth login`).
- If agent output is empty, check authentication and repo context.
- See [docs/GITHUB-SKILL-STATUS.md](docs/GITHUB-SKILL-STATUS.md) for troubleshooting and status.

---

## 🛠️ Development

### Adding New Scripts

1. Create script in `scripts/`
2. Make executable: `chmod +x scripts/your-script.sh`
3. Add documentation in script header
4. Update this README

### Configuration Changes

1. Test with `openclaw --profile dev config set ...`
2. Export working config: `cat ~/.openclaw-dev/openclaw.json > configs/openclaw.json.template`
3. Document changes in `docs/`

---

## 📝 Changelog

### 2026-02-03
- Initial setup with OpenClaw 2026.2.1
- Added `openclaw-fix.sh` — complete WSL2 fix script
- Configured Ollama with `qwen2.5:7b-instruct`
- Created documentation structure

---

## 🤝 Contributing

1. Fork this repo
2. Create a feature branch
3. Test your changes with `./scripts/openclaw-fix.sh`
4. Submit a PR

---

## 📄 License

MIT — See [LICENSE](LICENSE)

---

<p align="center">
  <b>🦞 XmetaV — Your OpenClaw Command Center</b><br>
  <sub>Built for WSL2 • Powered by Ollama • Managed with ❤️</sub>
</p>
