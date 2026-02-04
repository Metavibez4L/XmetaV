# Status — XmetaV / OpenClaw (dev profile)
Last verified: 2026-02-04

This file captures the **known-good** runtime settings for this machine/profile and the quickest commands to verify everything is healthy.

## Versions

- OpenClaw: `openclaw --version` (expected: 2026.2.1)
- Node: `node --version` (expected: 22.x)
- Ollama: `ollama --version` (native install recommended; snap often breaks CUDA)

## Active profile and paths

- Profile: `dev`
- State dir: `~/.openclaw-dev/`
- Config file: `~/.openclaw-dev/openclaw.json`
- Workspace: `~/.openclaw/workspace-dev`
- Gateway: `ws://127.0.0.1:19001`
- Ollama OpenAI-compat base: `http://127.0.0.1:11434/v1`

## Configured agents (this machine)

This command center is set up for **multiple isolated agents**:

- **`dev`**: general-purpose command-center agent
  - Workspace: `~/.openclaw/workspace-dev`
- **`basedintern`**: repo agent for the local checkout at `~/basedintern/based-intern`
  - Workspace: `~/basedintern/based-intern`
  - Intended use: repo analysis + code/docs changes + running tests (`npm test`)

List agents:

```bash
openclaw --profile dev agents list
```

Run the repo agent:

```bash
openclaw --profile dev agent --agent basedintern --local --thinking off \
  --message "Summarize this repo and run npm test."
```

## Known-good config (sanity checks)

These should match (do not paste tokens publicly):

```bash
openclaw --profile dev config get agents.defaults.model.primary
openclaw --profile dev config get models.providers.ollama.baseUrl
openclaw --profile dev config get models.providers.ollama.api
openclaw --profile dev config get tools
openclaw --profile dev config get messages.tts
```

Expected values (high level):
- `models.providers.ollama.baseUrl`: `http://127.0.0.1:11434/v1`
- `models.providers.ollama.api`: `openai-responses` (required for tool calling!)
- `tools.profile`: `coding` (enables read, write, exec, process tools)
- `tools.deny`: includes `tts`
- `messages.tts.auto`: `off`
- `messages.tts.edge.enabled`: `false`
- `messages.tts.modelOverrides.enabled`: `false`

## Standard way to run the agent (stable)

Use embedded mode + disable thinking for “simple chat” reliability on small local models:

```bash
openclaw --profile dev agent \
  --agent dev \
  --local \
  --thinking off \
  --session-id smoke_$(date +%s) \
  --message "What is 2+2?"
```

## Health checks

```bash
# Gateway should be reachable
openclaw --profile dev health

# Ollama should list models
curl -s http://127.0.0.1:11434/api/tags

# GPU should be in use when model is loaded (size_vram > 0)
curl -s http://127.0.0.1:11434/api/ps
```

## If it hangs (fast recovery)

```bash
# Clear stale session locks
find ~/.openclaw-dev -name "*.lock" -type f -delete

# Stop anything stuck
pkill -9 -f "openclaw.*gateway" 2>/dev/null || true
pkill -9 -f "node.*openclaw" 2>/dev/null || true
fuser -k 19001/tcp 2>/dev/null || true

# Re-apply the golden-path fix
./scripts/openclaw-fix.sh
```

## Tool Calling (System Automation)

With `tools.profile=coding` and `api=openai-responses`, the agent can:
- Execute shell commands via `exec` tool
- Read/write files via `read`/`write` tools
- Manage background processes via `process` tool

Test:
```bash
openclaw --profile dev agent --agent dev --local --thinking off \
  --message "Call the exec tool with command: whoami"
```

Notes:
- If you see loops calling tools (especially `tts`), deny `tts`.
- For channels (Telegram/Slack/etc), you may need gateway mode rather than `--local`.
- The `openai-responses` API mode is required for tool schemas to be passed to the model.

