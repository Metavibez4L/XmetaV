# Status — XmetaV / OpenClaw (local config)
Last verified: 2026-02-12

This file captures the **known-good** runtime settings for this machine/profile and the quickest commands to verify everything is healthy.

## Versions

- OpenClaw: `openclaw --version` (expected: 2026.2.1)
- Node: `node --version` (expected: 22.x)
- Ollama: `ollama --version` (native install recommended; snap often breaks CUDA)

## Active profile and paths

- Profile: (none; using default `~/.openclaw/` config)
- State dir: `~/.openclaw/`
- Config file: `~/.openclaw/openclaw.json`
- Workspace(s): per-agent (`openclaw agents list`)
- Gateway: local (`gateway.mode: local`)
- Ollama OpenAI-compat base: `http://127.0.0.1:11434/v1`

## Configured agents (this machine)

This command center is set up for **multiple isolated agents**, all powered by **Kimi K2.5** (256k context):

| Agent | Model | Workspace | Tools | Role |
|-------|-------|-----------|-------|------|
| `main` * | `kimi-k2.5:cloud` | `~/.openclaw/workspace` | **full** | **Orchestrator** — agent factory + swarm |
| `basedintern` | `kimi-k2.5:cloud` | `/home/manifest/basedintern` | coding | TypeScript/Node.js repo agent |
| `basedintern_web` | `kimi-k2.5:cloud` | `/home/manifest/basedintern` | full | Same repo — browser/web only |
| `akua` | `kimi-k2.5:cloud` | `/home/manifest/akua` | coding | Solidity/Hardhat repo agent |
| `akua_web` | `kimi-k2.5:cloud` | `/home/manifest/akua` | full | Same repo — browser/web only |
| _(dynamic)_ | `kimi-k2.5:cloud` | _(per-agent)_ | _(varies)_ | Created on-demand by Agent Factory |

\* = default agent

Detailed agent runbooks:
- `docs/agents/main.md`
- `docs/agents/basedintern.md`
- `docs/agents/akua.md`
- `docs/agents/dynamic.md`

List agents:

```bash
openclaw agents list
# or
./scripts/manage-agents.sh list
```

Run the repo agent:

```bash
openclaw agent --agent basedintern --local --thinking off \
  --message "Summarize this repo and run npm test."
```

## Orchestrator capabilities (main agent)

The `main` agent has two power skills installed:

### Agent Factory

Create agents, scaffold apps, manage the fleet, and create GitHub repos:

```bash
# Create a new agent
./scripts/create-agent.sh --id researcher --template research --web

# Create agent + GitHub repo (auto-creates + pushes)
./scripts/create-agent.sh --id researcher --template research --web --github --private

# Scaffold an app
./scripts/build-app.sh --type node --workspace /home/manifest/researcher

# Scaffold an app + push to GitHub
./scripts/build-app.sh --type node --workspace /home/manifest/researcher --github

# Fleet status
./scripts/manage-agents.sh list
./scripts/manage-agents.sh status
```

### Swarm (multi-agent orchestration)

Dispatch tasks across multiple agents with three execution modes:

| Mode | Command | Description |
|------|---------|-------------|
| Parallel | `./scripts/swarm.sh --parallel` | Run tasks simultaneously across agents |
| Pipeline | `./scripts/swarm.sh --pipeline` | Chain agents, output flows to next step |
| Collaborative | `./scripts/swarm.sh --collab` | Same task to multiple agents, then synthesize |

```bash
# Parallel health check across all repos
./scripts/swarm.sh --parallel \
  basedintern "Run /repo-health" \
  akua "Run /repo-health"

# Pipeline: research then implement
./scripts/swarm.sh --pipeline \
  main "Research best practices for X" \
  basedintern "Apply the findings"

# Collaborative code review
./scripts/swarm.sh --collab \
  "Review the last commit for bugs" \
  basedintern akua

# Pre-built templates
./scripts/swarm.sh templates/swarms/health-all.json

# Check past runs and results
./scripts/swarm.sh --status
./scripts/swarm.sh --results <run-id>
```

Results stored in: `~/.openclaw/swarm/<run-id>/`

Verify skills are installed:

```bash
ls ~/.openclaw/workspace/skills/
# Expected: agent-factory/ swarm/ (plus any others)
```

Full reference: `docs/SWARM.md`

## Known-good config (sanity checks)

These should match (do not paste tokens publicly):

```bash
openclaw config get agents.list
openclaw config get models.providers.ollama.baseUrl
openclaw config get models.providers.ollama.api
openclaw config get models.providers.ollama.apiKey
```

Expected values (high level):
- `models.providers.ollama.baseUrl`: `http://127.0.0.1:11434/v1`
- `models.providers.ollama.api`: `openai-responses` (required for tool calling!)
- `models.providers.ollama.apiKey`: set to a non-secret placeholder (e.g. `"local"`) to satisfy OpenClaw auth checks for local Ollama

## Standard way to run the agent (stable)

Use embedded mode + disable thinking for “simple chat” reliability on small local models:

```bash
openclaw agent \
  --agent main \
  --local \
  --thinking off \
  --session-id smoke_$(date +%s) \
  --message "What is 2+2?"
```

## Cloud model: `kimi-k2.5:cloud` (256k context)

This environment is configured with the Ollama cloud model:

- Model id: `kimi-k2.5:cloud`
- Expected context window: `262144` (256k)
- Auth: via `ollama signin` (no API key required for local `http://127.0.0.1:11434` calls)

Verify config:

```bash
openclaw config get agents.list
openclaw config get models.providers.ollama.models
```

## Known behavior: Ollama Cloud “session usage limit” (HTTP 429)

If you exceed your Ollama Cloud quota/limits, calls to a cloud model can fail with:

```json
{"StatusCode":429,"Status":"429 Too Many Requests","error":"you've reached your session usage limit, please wait or upgrade to continue"}
```

Reproduce / diagnose (direct to local Ollama):

```bash
curl -i -sS http://127.0.0.1:11434/api/chat \
  -d '{"model":"kimi-k2.5:cloud","messages":[{"role":"user","content":"OK"}],"stream":false}'
```

Fix:
- Wait for the limit to reset, or upgrade your Ollama plan.

## Health checks

```bash
# Gateway should be reachable
openclaw health

# Ollama should list models
curl -s http://127.0.0.1:11434/api/tags

# GPU should be in use when model is loaded (size_vram > 0)
curl -s http://127.0.0.1:11434/api/ps
```

## End-to-end smoke test (repo agent)

This is the “we can ship” verification for `basedintern`:

```bash
openclaw agent --agent basedintern --local --thinking off --session-id bi_smoke_$(date +%s) --message "\
In /home/manifest/basedintern/based-intern, use exec to run:\n\
1) git pull --ff-only\n\
2) npx tsc --noEmit\n\
3) npm test\n\
Paste raw stdout/stderr and exit codes."
```

## If it hangs (fast recovery)

```bash
# Clear stale session locks
find ~/.openclaw -name "*.lock" -type f -delete

# Stop anything stuck
pkill -9 -f "openclaw.*gateway" 2>/dev/null || true
pkill -9 -f "node.*openclaw" 2>/dev/null || true
fuser -k 18789/tcp 2>/dev/null || true

# Re-apply the golden-path fix
./scripts/openclaw-fix.sh
```

## Tool Calling (System Automation)

With `tools.profile=coding` (or `full` for `basedintern`) and `api=openai-responses`, the agent can:
- Execute shell commands via `exec` tool
- Read/write files via `read`/`write` tools
- Manage background processes via `process` tool
- Browse the web via `browser` tool (full profile)
- Fetch web pages via `web_fetch` / `web_search` tools (full profile)

Test:
```bash
openclaw agent --agent main --local --thinking off \
  --message "Call the exec tool with command: whoami"
```

Notes:
- If you see loops calling tools (especially `tts`), deny `tts`.
- For channels (Telegram/Slack/etc), you may need gateway mode rather than `--local`.
- The `openai-responses` API mode is required for tool schemas to be passed to the model.

## Control Plane Dashboard

The XmetaV Control Plane Dashboard is a cyberpunk-themed Next.js 16 web application providing remote agent management, swarm orchestration, and fleet controls via a browser.

### Dashboard status

| Component | Status | Notes |
|-----------|--------|-------|
| Dashboard (Next.js) | Active | `cd dashboard && npm run dev` (localhost:3000) |
| Bridge Daemon | Active when running | `cd dashboard/bridge && npm start` |
| Supabase | Active | Project: `ptlneqcjsnrxxruutsxm` |

### Supabase tables

| Table | Purpose | RLS |
|-------|---------|-----|
| `agent_commands` | Command bus (dashboard -> bridge) | Authenticated: SELECT, INSERT |
| `agent_responses` | Response bus (bridge -> dashboard) | Authenticated: SELECT, INSERT |
| `agent_sessions` | Agent session tracking | Authenticated: SELECT, INSERT |
| `agent_controls` | Agent enable/disable state | Authenticated: SELECT, INSERT, UPDATE |
| `swarm_runs` | Swarm run metadata and status | Authenticated: SELECT, INSERT, UPDATE |
| `swarm_tasks` | Per-task status and output | Authenticated: SELECT, INSERT, UPDATE |
| `x402_payments` | x402 payment transaction log | Authenticated: SELECT, INSERT |
| `intent_sessions` | Intent resolution sessions | Authenticated: SELECT, INSERT |

All tables have Realtime enabled for live updates.

View: `x402_daily_spend` — aggregates daily payment totals from `x402_payments`.

### Dashboard pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Command Center | Bridge health, fleet summary, recent commands, quick command |
| `/agent` | Agent Chat | Streaming chat with agent selector |
| `/swarms` | Swarms | Create (templates/custom), active runs (live), history (filterable) |
| `/fleet` | Fleet | Agent table with enable/disable toggles |
| `/payments` | Payments | x402 wallet status, daily spend, payment history, gated endpoints |
| `/identity` | Identity | ERC-8004 on-chain agent NFT, reputation, and capabilities |

### Dashboard health checks

```bash
# Verify dashboard is running
curl -s http://localhost:3000 | head -1

# Verify bridge daemon is running
curl -s http://localhost:3000/api/bridge/status

# Verify Supabase connection
cd dashboard && npx tsx -e "
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  sb.from('agent_commands').select('count').then(r => console.log('OK:', r));
"
```

### Dashboard environment

Required environment variables (in `dashboard/.env.local`):

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |

### Swarm runs (dashboard)

The dashboard can create, monitor, and cancel swarm runs:

```bash
# Swarm runs are stored in Supabase swarm_runs table
# The bridge daemon picks up pending runs and orchestrates execution
# Live output is streamed via Supabase Realtime to the browser
```

Swarm modes: **parallel**, **pipeline**, **collaborative**

Templates are loaded from `XmetaV/templates/swarms/*.json`.

---

## x402 Payments (Base network)

XmetaV gates agent API endpoints with USDC micro-payments via the x402 protocol (Coinbase).

| Component | Status | Notes |
|-----------|--------|-------|
| x402 Express Server | Ready | `cd dashboard/x402-server && npm start` |
| Bridge x402 Client | Ready | Auto-pays 402 responses when `EVM_PRIVATE_KEY` is set |
| Supabase `x402_payments` table | Active | Payment logging with daily spend view |
| Dashboard `/payments` page | Active | Wallet status, history, gated endpoint list |

### Gated endpoints (x402-server)

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /agent-task` | $0.01 | Queue a task for any agent |
| `POST /intent` | $0.005 | Create an intent resolution session |
| `GET /fleet-status` | $0.001 | Get fleet status summary |
| `POST /swarm` | $0.02 | Launch a multi-agent swarm |

### Environment variables

| Variable | Location | Description |
|----------|----------|-------------|
| `EVM_PRIVATE_KEY` | `bridge/.env` | Agent wallet private key (Base) |
| `EVM_ADDRESS` | `x402-server/.env` | Address receiving payments |
| `FACILITATOR_URL` | `x402-server/.env` | Coinbase x402 facilitator |
| `X402_BUDGET_LIMIT` | `bridge/.env` | Max payment per request in USD |

---

## ERC-8004 Agent Identity (Base mainnet)

The XmetaV main agent is registered on-chain as an ERC-8004 identity NFT.

| Property | Value |
|----------|-------|
| Agent ID | `16905` |
| Contract | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (IdentityRegistry) |
| Network | Base Mainnet |
| Owner | `0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80` |
| NFT | [BaseScan](https://basescan.org/token/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432?a=16905) |
| Tx | [BaseScan](https://basescan.org/tx/0xee8da73203e1a6ce48560f66731a02fb4a74c346d6f1a02bd4cf94d7e05adb3b) |

### Dashboard `/identity` page

Shows agent registration status, owner, wallet, capabilities, services, trust model, and contract addresses. Supports lookup by agent ID.

### Environment

| Variable | Location | Description |
|----------|----------|-------------|
| `ERC8004_AGENT_ID` | `bridge/.env` | On-chain agent ID (16905) |
| `EVM_PRIVATE_KEY` | `bridge/.env` | Wallet key (shared with x402) |

Full reference: `capabilities/erc8004-identity.md`

---

## Voice Commands (OpenAI Whisper + TTS)

Voice command and response system using OpenAI Whisper (STT) and TTS HD.

| Component | Status | Notes |
|-----------|--------|-------|
| Dashboard voice mode | Ready | Toggle in Agent Chat header; requires `OPENAI_API_KEY` |
| STT (Whisper) | Ready | `/api/voice/transcribe` — audio in, text out |
| TTS (OpenAI HD) | Ready | `/api/voice/synthesize` — text in, audio out |
| x402 voice endpoints | Ready | `POST /voice/transcribe` ($0.005), `POST /voice/synthesize` ($0.01) |
| CLI voice mode | Ready | `npx tsx scripts/voice-cli.ts` (requires `sox`) |

### Environment

| Variable | Location | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | `dashboard/.env.local` | OpenAI API key for Whisper + TTS |
| `OPENAI_API_KEY` | `x402-server/.env` | Same key for x402-gated voice |

Full reference: `capabilities/voice-commands.md`

---

## Browser Automation (OpenClaw-managed browser)

This setup supports OpenClaw’s dedicated browser automation via the `openclaw browser ...` CLI (open tabs, snapshot, click/type).

### Prereqs (WSL2/Linux)

1) Install system dependencies (requires `sudo`):

```bash
sudo apt-get update && sudo apt-get install -y \
  ca-certificates fonts-liberation wget xdg-utils \
  libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 \
  libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libgbm1 libglib2.0-0 \
  libgtk-3-0 libpango-1.0-0 libudev1 libvulkan1 \
  libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 \
  libxkbcommon0 libasound2
```

2) Install a Chromium binary via Playwright (no sudo):

```bash
npx playwright install chromium
```

3) Point OpenClaw at that Chromium (example path shown; adjust if your version differs):

```bash
openclaw config set browser.enabled true
openclaw config set browser.defaultProfile openclaw
openclaw config set browser.executablePath "$HOME/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome"
```

### Smoke test (CLI)

```bash
# Start gateway (if not already running)
./scripts/start-gateway.sh

openclaw browser start
openclaw browser open https://example.com
openclaw browser snapshot
```

### Known limitation (small local models)

With smaller local models (e.g. `qwen2.5:7b-instruct`), the agent may sometimes ignore the `browser` tool and fall back to shell-based approaches.

Workarounds:
- Use the deterministic `openclaw browser ...` CLI for browser automation.
- Or use `exec` + `curl -sL ...` for “web fetch + summarize” workflows.

