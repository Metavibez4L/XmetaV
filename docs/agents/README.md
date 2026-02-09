# Agents (Detailed)

This directory contains **agent-by-agent runbooks** for the OpenClaw agents configured on this machine.

> Note: These docs intentionally avoid including any secrets (gateway tokens, API keys). Use `openclaw config get ...` locally when you need exact values.

## Static Agents

- [`main`](./main.md) — **orchestrator** (agent factory + swarm + command center)
- [`basedintern`](./basedintern.md) — repo agent (coding tools, lean) pinned to `/home/manifest/basedintern`
- [`basedintern_web`](./basedintern.md) — same repo, full tools (browser/web) — use sparingly to save Kimi quota
- [`akua`](./akua.md) — repo agent (coding tools, lean) pinned to `/home/manifest/akua`
- [`akua_web`](./akua.md) — same repo, full tools (browser/web) — use sparingly to save Kimi quota

All agents use **Kimi K2.5** (256k context) via Ollama.

## Dynamic Agents

- [`dynamic`](./dynamic.md) — runbook for agents created at runtime by the Agent Factory

Dynamic agents are created by the `main` agent using the Agent Factory skill. Each gets its own runbook auto-generated at `docs/agents/<agent-id>.md`. Agents can also be created with a **GitHub repo** (`--github` flag) — the repo is auto-created under `Metavibez4L` and the initial scaffold is pushed.

## Swarm Orchestration

The `main` agent can coordinate multi-agent operations via the Swarm skill:

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

See [`../SWARM.md`](../SWARM.md) for the full reference.

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
```

## Tooling baseline

This command center uses:

- **Ollama** OpenAI-compatible API at `http://127.0.0.1:11434/v1`
- **API mode**: `openai-responses` (required for tool calling)
- **API key**: `"local"` (required placeholder for OpenClaw auth checks)
- **Tools profile**: `full` for `main`, `coding` for repo agents, `full` for `_web` companions

Quick sanity checks:

```bash
openclaw config get models.providers.ollama.baseUrl
openclaw config get models.providers.ollama.api
openclaw config get tools
```
