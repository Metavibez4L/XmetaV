# Agent: `basedintern` (+ `basedintern_web`)

## Purpose

`basedintern` is a **repo agent** whose workspace is the `basedintern` repository checkout. Use it for:

- Repo overview + architecture mapping
- Documentation and code changes *inside that repo*
- Running repo commands (`npm test`, `npm run build`, `npm run typecheck`, etc.)
- Git tasks scoped to that repo (add/commit/push) when explicitly requested

## Agent split (Kimi optimization)

To reduce Kimi cloud token usage and avoid 429s, this agent is split into two:

| Agent ID | Tools | When to use |
|----------|-------|-------------|
| `basedintern` | **coding** (exec, read, write, process) | 90% of work: code changes, tests, commits |
| `basedintern_web` | **full** (fs, runtime, web, browser, automation) | Only when you need browser/web automation |

Both share the same workspace (`/home/manifest/basedintern`) and model (`kimi-k2.5:cloud`).

**Why the split matters**: The `coding` profile advertises ~4 tools to the model. The `full` profile advertises 20+ tools. Fewer tools = smaller tool schema per turn = fewer tokens per Kimi call = faster + less likely to hit 429.

## Identity and workspace

- **Agent ID**: `basedintern` (coding) / `basedintern_web` (full)
- **Workspace**: `/home/manifest/basedintern` (repo root, shared)
- **Agent dir**: `~/.openclaw/agents/basedintern/agent/`

Verify:

```bash
openclaw agents list
```

## Model

Both agents are pinned to a cloud model:

- `ollama/kimi-k2.5:cloud` (cloud; 256k context, maxTokens capped at 4096)

### Cloud quota note (HTTP 429 "session usage limit")

Ollama cloud models can return HTTP 429 if you exceed the current plan/session quota.

Diagnose quickly:

```bash
curl -i -sS http://127.0.0.1:11434/api/chat \
  -d '{"model":"kimi-k2.5:cloud","messages":[{"role":"user","content":"OK"}],"stream":false}' | sed -n '1,80p'
```

Fix:
- Wait for the limit window to reset, or upgrade your Ollama plan.

### Optimization tips (avoid 429)

1. **Use fresh session IDs** per task: `--session-id bi_$(date +%s)`
2. **Keep prompts atomic** (one task per turn)
3. **Don't paste big logs** — ask for exit codes + summary instead
4. **Use `basedintern`** (coding profile) for 90% of work
5. **Use `basedintern_web`** only when browser/web tools are needed

## Tools

### `basedintern` (default — use this)

Lean tool set for maximum speed and minimum token usage:

- `exec` — run shell commands in the repo workspace
- `read` / `write` — inspect and edit repo files
- `process` — manage longer-running commands (tests, dev servers)

### `basedintern_web` (full — use sparingly)

All tools, for when you actually need web automation:

- Everything in `basedintern` plus:
- `web_fetch` / `web_search` — fetch pages + research
- `browser` — OpenClaw-managed browser automation (UI tool)
- `sessions` — inspect agent sessions

## Skills

This command center uses bundled skills (including `github`), and can also load repo-local skills.

```bash
openclaw skills list
```

## How to run (recommended)

Run in local embedded mode for stability:

```bash
# Default (coding tools — fast, lean)
openclaw agent --agent basedintern --local --thinking off \
  --session-id bi_$(date +%s) \
  --message "Summarize this repo and identify key entrypoints."

# Full tools (only when needed)
openclaw agent --agent basedintern_web --local --thinking off \
  --session-id biweb_$(date +%s) \
  --message "Use web_fetch to check https://example.com"
```

## Repo workflows (copy/paste)

### Run tests

```bash
openclaw agent --agent basedintern --local --thinking off \
  --session-id bi_test_$(date +%s) \
  --message "Use exec to run: cd based-intern && npm test"
```

### Build + typecheck

```bash
openclaw agent --agent basedintern --local --thinking off \
  --session-id bi_build_$(date +%s) \
  --message "Use exec to run: cd based-intern && npm run build && npx tsc --noEmit"
```

### Make a docs change safely

```bash
openclaw agent --agent basedintern --local --thinking off \
  --session-id bi_docs_$(date +%s) \
  --message "Read docs/ then propose a small docs improvement in one file."
```

### Web access (use basedintern_web)

```bash
openclaw agent --agent basedintern_web --local --thinking off \
  --session-id biweb_$(date +%s) \
  --message "Use web_fetch to fetch https://example.com and summarize the key points."
```

## Maintenance / recovery

### Clear stale locks

```bash
find ~/.openclaw -name "*.lock" -type f -delete
```

### Kill stuck processes

```bash
pkill -9 -f "openclaw.*gateway" 2>/dev/null || true
pkill -9 -f "node.*openclaw" 2>/dev/null || true
```
