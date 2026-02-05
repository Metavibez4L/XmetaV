# Agents (Detailed)

This directory contains **agent-by-agent runbooks** for the OpenClaw agents configured under the `dev` profile on this machine.

> Note: These docs intentionally avoid including any secrets (gateway tokens, API keys). Use `openclaw --profile dev config get ...` locally when you need exact values.

## Agents

- [`dev`](./dev.md) — primary command-center agent (general ops)
- [`basedintern`](./basedintern.md) — repo agent pinned to `~/basedintern/based-intern`

## Common commands (applies to all agents)

```bash
# List agents + their workspaces/models
openclaw --profile dev agents list

# Run an agent in stable local mode (recommended for Ollama)
openclaw --profile dev agent --agent dev --local --thinking off \
  --session-id smoke_$(date +%s) \
  --message "What is 2+2? Reply with just 4."

# Clear stale session locks (safe)
find ~/.openclaw-dev -name "*.lock" -type f -delete
```

## Tooling baseline

This command center uses:

- **Ollama** OpenAI-compatible API at `http://127.0.0.1:11434/v1`
- **API mode**: `openai-responses` (required for tool calling)
- **Tools profile**: typically `coding` (exec/read/write/process) + optional `browser`

Quick sanity checks:

```bash
openclaw --profile dev config get models.providers.ollama.baseUrl
openclaw --profile dev config get models.providers.ollama.api
openclaw --profile dev config get tools
```

