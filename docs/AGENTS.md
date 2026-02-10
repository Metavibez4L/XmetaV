# Agents — Operating Guide

This doc covers how to manage OpenClaw agents on this system.

For per-agent runbooks, see `docs/agents/`:

- `docs/agents/README.md`
- `docs/agents/main.md`
- `docs/agents/basedintern.md`
- `docs/agents/akua.md`

## Quick reference

- List agents: `openclaw agents list` or `./scripts/manage-agents.sh list`
- Run default agent: `openclaw agent --message "Hello"`
- Run specific agent: `openclaw agent --agent basedintern --message "Hello"`
- Use a stable session id: `openclaw agent --session-id my_session --message "..."`
- Browser automation (CLI): `openclaw browser open https://example.com`
- **Create agent**: `./scripts/create-agent.sh --id myagent --template coding --web`
- **Create agent + GitHub**: `./scripts/create-agent.sh --id myagent --template coding --github --private --web`
- **Build app**: `./scripts/build-app.sh --type node --workspace /home/manifest/myagent`
- **Build app + GitHub**: `./scripts/build-app.sh --type node --workspace /home/manifest/myagent --github`
- **Fleet status**: `./scripts/manage-agents.sh status`
- **Swarm parallel**: `./scripts/swarm.sh --parallel basedintern "task1" akua "task2"`
- **Swarm pipeline**: `./scripts/swarm.sh --pipeline agent1 "step1" agent2 "step2"`
- **Swarm collab**: `./scripts/swarm.sh --collab "review task" basedintern akua`
- **Swarm status**: `./scripts/swarm.sh --status`
- **Dashboard**: `cd dashboard && npm run dev` → http://localhost:3000
- **Bridge daemon**: `cd dashboard/bridge && npm start`
- **Dashboard swarms**: http://localhost:3000/swarms (create, monitor, cancel)
- **Dashboard fleet**: http://localhost:3000/fleet (enable/disable agents)

## How agent routing works

OpenClaw's agent command sends a turn through the Gateway.

- Gateway must be reachable (default: `ws://127.0.0.1:18789`).
- Model provider must be configured correctly (this setup uses Ollama via OpenAI-compatible `/v1`).

## Agent workspace

Your config uses **per-agent workspaces** (see `openclaw agents list`).

This is where agent tools and working files may be created during runs.

## Sessions and lock files

OpenClaw persists sessions as JSONL files and uses lock files to protect writes.

- Session files: under `~/.openclaw/agents/<agent>/sessions/`
- Lock files: `*.jsonl.lock`

### Why locks cause hangs
If OpenClaw crashes mid-write, the lock file may remain. Future runs can block waiting on the lock.

### Safe lock cleanup
This repo's scripts only delete `*.lock` files, not the session history.

Manual cleanup:
```bash
find ~/.openclaw -name "*.lock" -type f -delete
```

## Deterministic smoke tests

Use a new session id each time to avoid ambiguous session state:
```bash
openclaw agent \
  --agent main \
  --session-id fresh_ok_$(date +%s) \
  --local \
  --thinking off \
  --message "Say OK and print provider+model"
```

If output is slow/hanging:
- Confirm `models.providers.ollama.api` is `openai-responses` (required for tool calling).
- Confirm `models.providers.ollama.baseUrl` is `http://127.0.0.1:11434/v1`.
- If you only need chat (no tools), you can use `openai-completions`—but tools will not execute.
- If the model loops calling tools (commonly `tts`), deny `tts` and temporarily reduce tool surface area.
- Clear stale locks.

## Browser automation notes

OpenClaw supports a dedicated managed browser (`openclaw browser ...`). On smaller local models, agents may be inconsistent at invoking the `browser` tool; for reliable results prefer the CLI commands in `docs/STATUS.md`.

## Cloud models (Ollama)

If you pin an agent to an Ollama cloud model (e.g. `kimi-k2.5:cloud`), note:

- Auth is via `ollama signin` (no API key needed for local `http://127.0.0.1:11434` calls).
- Cloud models can hit plan/session limits and return HTTP 429 ("session usage limit").
- Keep a local fallback model configured for when cloud quota is exhausted.

## Concurrency notes

Config fields that influence concurrency:
- `agents.defaults.maxConcurrent`
- `agents.defaults.subagents.maxConcurrent`

If you see lock contention or long waits, reduce concurrency temporarily and re-test.

## Repo agents (example: `basedintern`)

You can create a dedicated agent whose workspace is a specific repo checkout. This is useful for focused repo analysis, code changes, running tests, and keeping session state separate.

Example (`basedintern`):

```bash
# Coding tasks (lean tools — fast, saves Kimi quota)
openclaw agent --agent basedintern --local --thinking off \
  --session-id bi_$(date +%s) \
  --message "Run npm test and summarize any failures."

# Web/browser tasks (full tools — use sparingly)
openclaw agent --agent basedintern_web --local --thinking off \
  --session-id biweb_$(date +%s) \
  --message "Use web_fetch to check https://example.com"
```

The repo agents are configured in `~/.openclaw/openclaw.json`:

| Agent | Tools | Workspace | Purpose |
|-------|-------|-----------|---------|
| `basedintern` | `coding` (exec, read, write, process) | `/home/manifest/basedintern` | 90% of work |
| `basedintern_web` | `full` (all tools + browser + web) | `/home/manifest/basedintern` | Web automation only |
| `akua` | `coding` (exec, read, write, process) | `/home/manifest/akua` | 90% of work |
| `akua_web` | `full` (all tools + browser + web) | `/home/manifest/akua` | Web automation only |

All repo agents use model `ollama/kimi-k2.5:cloud` (256k context, maxTokens 8192).

## Dynamic Agents (Agent Factory)

The `main` agent can create new agents at runtime via the Agent Factory skill. This includes:

- Workspace creation and identity seeding (AGENTS.md + SOUL.md)
- Config injection into `~/.openclaw/openclaw.json`
- Optional `_web` companion agents
- App scaffolding (Node.js, Python, bots, FastAPI, Hardhat, etc.)
- **GitHub integration** — auto-create repos and push initial scaffolds (`--github` flag)

For full details, see `docs/agents/dynamic.md`.

### Creating agents manually

```bash
# Create a research agent with web companion
./scripts/create-agent.sh --id researcher --template research --web \
  --description "Web research and data gathering"

# Create with GitHub repo (auto-creates Metavibez4L/researcher on GitHub)
./scripts/create-agent.sh --id researcher --template research --web --github --private \
  --description "Web research and data gathering"

# Scaffold a Node.js app in its workspace
./scripts/build-app.sh --type node --workspace /home/manifest/researcher

# Scaffold + push to GitHub
./scripts/build-app.sh --type node --workspace /home/manifest/researcher --github

# Check the fleet
./scripts/manage-agents.sh list
```

### Templates

| Template | Best for |
|----------|----------|
| `coding` | Repo work, code, tests |
| `bot` | Discord, Telegram bots |
| `research` | Web research, data gathering |
| `devops` | Infrastructure, deployment |
| `general` | Everything else |

## Dashboard Fleet Controls

The Control Plane Dashboard provides a browser-based interface for managing agents:

### Agent Enable/Disable

Agents can be toggled on/off from the **Fleet** page (`/fleet`):

- **UI**: Toggle switch on each agent row in the Fleet table
- **Storage**: `agent_controls` table in Supabase (keyed by agent ID)
- **Enforcement**: The bridge daemon checks `agent_controls` before executing any command. Disabled agents have their commands rejected with a "disabled" response.
- **Main agent**: The `main` agent is notified when agents are toggled, so it can adjust its orchestration accordingly.

### Dashboard Agent Chat

The **Agent Chat** page (`/agent`) provides a full-screen streaming chat interface:

- Agent selector dropdown (main, basedintern, akua, etc.)
- Commands are sent via Supabase and executed by the bridge daemon
- Responses stream in real-time via Supabase Realtime
- Full message history per session

### Dashboard Swarm Management

The **Swarms** page (`/swarms`) provides a complete interface for swarm orchestration:

- **Create tab**: Pick from pre-built templates, build custom swarms, or "Let Main Agent Decide"
- **Active tab**: Live progress bars, per-task streaming output, cancel button
- **History tab**: Filterable past runs with expandable detail views

Swarm runs created from the dashboard are stored in Supabase (`swarm_runs` + `swarm_tasks`) and executed by the bridge daemon's swarm executor.

## Swarm Orchestration (CLI + Dashboard)

The `main` agent can coordinate multi-agent operations using the Swarm skill, `swarm.sh` engine, or the dashboard.

### Modes

| Mode | Command | Description |
|------|---------|-------------|
| **Parallel** | `./scripts/swarm.sh --parallel` | Run tasks simultaneously across agents |
| **Pipeline** | `./scripts/swarm.sh --pipeline` | Chain agents — each gets prior output as context |
| **Collaborative** | `./scripts/swarm.sh --collab` | Same task to multiple agents, then synthesize |

### Examples

```bash
# Health check all repos in parallel
./scripts/swarm.sh --parallel \
  basedintern "Run /repo-health" \
  akua "Run /repo-health"

# Research then implement (pipeline)
./scripts/swarm.sh --pipeline \
  main "Research best practices for X" \
  basedintern "Apply the findings to the codebase"

# Multi-agent code review (collaborative)
./scripts/swarm.sh --collab \
  "Review the last commit for bugs and security issues" \
  basedintern akua

# Use a pre-built template
./scripts/swarm.sh templates/swarms/health-all.json
./scripts/swarm.sh templates/swarms/code-review.json
```

### Results

All swarm output is stored in `~/.openclaw/swarm/<run-id>/`:
- `manifest.json` — the manifest that was executed
- `<task-id>.out` — per-task output
- `synthesis.out` — synthesis (if requested)
- `summary.md` — human-readable summary

```bash
./scripts/swarm.sh --status          # list past runs
./scripts/swarm.sh --results <id>    # read a run's results
```

For the full swarm reference, see `docs/SWARM.md`.
