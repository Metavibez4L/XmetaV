# Agents — Operating Guide

This doc covers how to manage OpenClaw agents on this system using the `dev` profile.

For per-agent runbooks, see `docs/agents/`:

- `docs/agents/README.md`
- `docs/agents/dev.md`
- `docs/agents/basedintern.md`

## Quick reference

- List agents: `openclaw --profile dev agents list`
- Run default agent: `openclaw --profile dev agent --message "Hello"`
- Run specific agent: `openclaw --profile dev agent --agent dev --message "Hello"`
- Use a stable session id: `openclaw --profile dev agent --session-id my_session --message "..."`
- Browser automation (CLI): `openclaw --profile dev browser open https://example.com`

## How agent routing works

OpenClaw’s agent command sends a turn through the Gateway.

- Gateway must be reachable (default dev: `ws://127.0.0.1:19001`).
- Model provider must be configured correctly (this setup uses Ollama via OpenAI-compatible `/v1`).

## Agent workspace

Your config currently points the default agent workspace to:
- `~/.openclaw/workspace-dev`

This is where agent tools and working files may be created during runs.

## Sessions and lock files

OpenClaw persists sessions as JSONL files and uses lock files to protect writes.

- Session files: under `~/.openclaw-dev/agents/<agent>/sessions/`
- Lock files: `*.jsonl.lock`

### Why locks cause hangs
If OpenClaw crashes mid-write, the lock file may remain. Future runs can block waiting on the lock.

### Safe lock cleanup
This repo’s scripts only delete `*.lock` files, not the session history.

Manual cleanup:
```bash
find ~/.openclaw-dev -name "*.lock" -type f -delete
```

## Deterministic smoke tests

Use a new session id each time to avoid ambiguous session state:
```bash
openclaw --profile dev agent \
  --agent dev \
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

## Concurrency notes

Config fields that influence concurrency:
- `agents.defaults.maxConcurrent`
- `agents.defaults.subagents.maxConcurrent`

If you see lock contention or long waits, reduce concurrency temporarily and re-test.

## Repo agents (example: `basedintern`)

You can create a dedicated agent whose workspace is a specific repo checkout. This is useful for focused repo analysis, code changes, running tests, and keeping session state separate.

Example (`basedintern`):

```bash
# Add the repo agent
openclaw --profile dev agents add basedintern \
  --workspace "$HOME/basedintern/based-intern" \
  --non-interactive

# Optional identity (nice in logs + agent lists)
openclaw --profile dev agents set-identity --agent basedintern --name "BasedIntern" --emoji "🤖"

# Run it
openclaw --profile dev agent --agent basedintern --local --thinking off \
  --message "Run npm test and summarize any failures."
```
