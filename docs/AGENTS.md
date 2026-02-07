# Agents — Operating Guide

This doc covers how to manage OpenClaw agents on this system.

For per-agent runbooks, see `docs/agents/`:

- `docs/agents/README.md`
- `docs/agents/main.md`
- `docs/agents/basedintern.md`
- `docs/agents/akua.md`

## Quick reference

- List agents: `openclaw agents list`
- Run default agent: `openclaw agent --message "Hello"`
- Run specific agent: `openclaw agent --agent basedintern --message "Hello"`
- Use a stable session id: `openclaw agent --session-id my_session --message "..."`
- Browser automation (CLI): `openclaw browser open https://example.com`

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
