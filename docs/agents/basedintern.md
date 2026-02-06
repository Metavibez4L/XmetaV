# Agent: `basedintern`

## Purpose

`basedintern` is a **repo agent** whose workspace is the `basedintern` repository checkout. Use it for:

- Repo overview + architecture mapping
- Documentation and code changes *inside that repo*
- Running repo commands (`npm test`, `npm run build`, `npm run typecheck`, etc.)
- Git tasks scoped to that repo (add/commit/push) when explicitly requested

## Identity and workspace

- **Agent ID**: `basedintern`
- **Workspace**: `/home/manifest/basedintern` (repo root)
- **Agent dir**: `~/.openclaw/agents/basedintern/agent/`

Verify:

```bash
openclaw agents list
```

## Model

In this command center, `basedintern` is pinned to a cloud model (override of defaults):

```bash
openclaw agents list --json
openclaw config get agents.list
```

Typical value:

- `ollama/kimi-k2.5:cloud` (cloud; 256k context)

### Cloud quota note (HTTP 429 “session usage limit”)

Ollama cloud models can return HTTP 429 if you exceed the current plan/session quota.

Diagnose quickly:

```bash
curl -i -sS http://127.0.0.1:11434/api/chat \
  -d '{"model":"kimi-k2.5:cloud","messages":[{"role":"user","content":"OK"}],"stream":false}' | sed -n '1,80p'
```

Fix:
- Wait for the limit window to reset, or upgrade your Ollama plan.

## Tools

This agent is intended to run with **full repo automation** enabled:

- `exec` — run shell commands in the repo workspace
- `read` / `write` — inspect and edit repo files
- `process` — manage longer-running commands (tests, dev servers)
- `web_fetch` / `web_search` — fetch pages + research
- `browser` — OpenClaw-managed browser automation (UI tool)

Verify current tool config:

```bash
openclaw config get agents.list
```

## Skills

This command center uses bundled skills (including `github`), and can also load repo-local skills.

You can see what’s ready/missing:

```bash
openclaw skills list
```

## How to run (recommended)

Run it in local embedded mode for stability:

```bash
openclaw agent --agent basedintern --local --thinking off \
  --session-id basedintern_$(date +%s) \
  --message "Summarize this repo and identify key entrypoints."
```

## Repo workflows (copy/paste)

### Run tests

```bash
openclaw agent --agent basedintern --local --thinking off \
  --message "Use exec to run: cd based-intern && npm test"
```

### Build + typecheck

```bash
openclaw agent --agent basedintern --local --thinking off \
  --message "Use exec to run: cd based-intern && npm run build && npx tsc --noEmit"
```

### Make a docs change safely

```bash
openclaw agent --agent basedintern --local --thinking off \
  --message "Read docs/ then propose a small docs improvement in one file."
```

## Web access: two modes

### 1) Reliable: `web_fetch` / `web_search` (preferred)

With Kimi, tool selection is reliable. Use `web_fetch` when you just need the page content:

```bash
openclaw agent --agent basedintern --local --thinking off \
  --message "Use web_fetch to fetch https://example.com and summarize the key points."
```

### 2) Interactive: browser automation (agent tool)

Ask the agent to use `browser` directly:

```bash
openclaw agent --agent basedintern --local --thinking off \
  --message "Use the browser tool to open https://base.org, take a snapshot, then report the page title."
```

## Known limitations (small local models)

With `qwen2.5:7b-instruct`, the agent may sometimes:

- ignore the `browser` tool and fall back to `exec`/shell approaches
- “narrate” steps instead of selecting the correct tool

Workarounds:

- Use deterministic CLI browser commands (`openclaw browser ...`) when you need interactive automation.
- Keep prompts **atomic** (one tool action per message) when reliability matters.
- Prefer `exec` + `curl` for web fetch tasks.

## Maintenance / recovery (repo agent)

### Clear stale locks

```bash
find ~/.openclaw -name "*.lock" -type f -delete
```

### Kill stuck processes

```bash
pkill -9 -f "openclaw.*gateway" 2>/dev/null || true
pkill -9 -f "node.*openclaw" 2>/dev/null || true
```

