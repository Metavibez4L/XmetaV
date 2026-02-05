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
- OpenClaw-managed browser automation (`openclaw browser ...` snapshots/click/type)
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
    ├── STATUS.md                   # Current known-good settings + checks
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
openclaw --profile dev agent --agent dev --local --thinking off --session-id test_$(date +%s) --message "What is 2+2? Reply with just 4."
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
| API Mode | `openai-responses` |
| Primary Model | `qwen2.5:7b-instruct` (local) or `kimi-k2.5:cloud` (cloud) |
| Context Window | 32768 tokens (qwen) / 262144 tokens (kimi cloud) |

> **Why `openai-responses`?** It’s required for **tool calling** (exec/read/write/process). If you only want chat (no tools), `openai-completions` can work but won’t inject tool schemas.

#### Ollama Cloud limits (Kimi)

Cloud models (like `kimi-k2.5:cloud`) are subject to plan/session usage limits. If you hit the quota you’ll see HTTP 429:

```bash
curl -i -sS http://127.0.0.1:11434/api/chat \
  -d '{"model":"kimi-k2.5:cloud","messages":[{"role":"user","content":"OK"}],"stream":false}' | sed -n '1,40p'
```

Fix: wait for reset or upgrade the plan. Cloud auth uses `ollama signin`.

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
        "api": "openai-responses"
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

### Browser automation (optional, WSL2/Linux)

If you want interactive browser automation (tabs/snapshots/click/type) via `openclaw browser ...`, you need a Chromium binary + system deps.

```bash
# 1) System deps (requires sudo)
sudo apt-get update && sudo apt-get install -y \
  ca-certificates fonts-liberation wget xdg-utils \
  libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 \
  libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libgbm1 libglib2.0-0 \
  libgtk-3-0 libpango-1.0-0 libudev1 libvulkan1 \
  libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 \
  libxkbcommon0 libasound2

# 2) Install Chromium via Playwright (no sudo)
npx playwright install chromium

# 3) Configure OpenClaw to use it (example path)
openclaw --profile dev config set browser.enabled true
openclaw --profile dev config set browser.defaultProfile openclaw
openclaw --profile dev config set browser.executablePath "$HOME/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome"

# 4) Smoke test
./scripts/start-gateway.sh
openclaw --profile dev browser start
openclaw --profile dev browser open https://example.com
openclaw --profile dev browser snapshot
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

### Repo Agent: `basedintern` (example)

This command center can host multiple isolated agents. For example, you can run a dedicated agent whose workspace is the `basedintern` repo checkout:

- **Agent ID**: `basedintern`
- **Workspace**: `~/basedintern/based-intern`
- **Model**: `ollama/kimi-k2.5:cloud` (cloud; 256k context)
- **Tooling**: `tools.profile=coding` (enables `read`, `write`, `exec`, `process`)
- **Skills** (from that workspace): `based-intern-ops`, `based-intern-railway-control`

Run it:

```bash
openclaw --profile dev agent --agent basedintern --local --thinking off \
  --message "Summarize the architecture of this repo and point to key entrypoints."
```

### Creating New Agents

```bash
# List existing agents
openclaw --profile dev agents list

# Add a new isolated agent (requires workspace)
openclaw --profile dev agents add myagent \
  --workspace "$HOME/myagent-workspace" \
  --non-interactive

# Optional: set identity
openclaw --profile dev agents set-identity --agent myagent --name "My Agent" --emoji "🤖"

# Run with specific agent
openclaw --profile dev agent --agent myagent --local --thinking off --message "Hello"
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
│  │   Ollama (Local Host)   │  │   Cloud Providers       │              │
│  │   http://127.0.0.1:11434│  │   (Anthropic, OpenAI)   │              │
│  │   ├─ qwen2.5:7b-instruct│  │                         │              │
│  │   ├─ qwen2.5vl:7b       │  │                         │              │
│  │   └─ kimi-k2.5:cloud    │  │                         │              │
│  │      (Ollama Cloud)     │  │                         │              │
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

### Browser automation (OpenClaw-managed)

```bash
openclaw --profile dev browser status
openclaw --profile dev browser start
openclaw --profile dev browser open https://base.org
openclaw --profile dev browser snapshot
openclaw --profile dev browser click e123
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
| `Waiting for agent reply…` forever | Use `--local --thinking off`, clear stale locks, and ensure `models.providers.ollama.api=openai-responses` (see `docs/TROUBLESHOOTING.md`) |
| `Session locked` | `find ~/.openclaw-dev -name "*.lock" -delete` |
| `Connection refused` to Ollama | `ollama serve` or `snap start ollama` |
| Port 19001 already in use | `fuser -k 19001/tcp` then restart gateway |
| Browser start fails (`libnspr4.so` missing) | Install browser deps (see `docs/STATUS.md`), then `openclaw --profile dev browser start` |

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for detailed solutions.

---

## 📚 Documentation Index

| Document | Description |
|----------|-------------|
| [OPENCLAW-FIX-CHECKLIST.md](docs/OPENCLAW-FIX-CHECKLIST.md) | Step-by-step verification checklist |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture deep-dive |
| [AGENTS.md](docs/AGENTS.md) | Agent configuration & customization |
| [agents/](docs/agents/) | Per-agent runbooks (dev, basedintern) |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues & solutions |
| [STATUS.md](docs/STATUS.md) | Current known-good settings + verification commands |
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
