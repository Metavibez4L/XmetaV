# Agents — Operating Guide

This doc covers how to manage OpenClaw agents on this system using the `dev` profile.

## Quick reference

- List agents: `openclaw --profile dev agents list`
- Run default agent: `openclaw --profile dev agent --message "Hello"`
- Run specific agent: `openclaw --profile dev agent --agent dev --message "Hello"`
- Use a stable session id: `openclaw --profile dev agent --session-id my_session --message "..."`

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
- Confirm `models.providers.ollama.api` is `openai-completions`.
- Confirm `models.providers.ollama.baseUrl` is `http://127.0.0.1:11434/v1`.
- If the model loops calling tools (commonly `tts`), set `tools.profile` to `minimal` and deny `tts` (see `docs/TROUBLESHOOTING.md`).
- Clear stale locks.

## Concurrency notes

Config fields that influence concurrency:
- `agents.defaults.maxConcurrent`
- `agents.defaults.subagents.maxConcurrent`

If you see lock contention or long waits, reduce concurrency temporarily and re-test.
