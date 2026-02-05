# Agent: `basedintern`

## Purpose

`basedintern` is a **repo agent** whose workspace is the `basedintern` repository checkout. Use it for:

- Repo overview + architecture mapping
- Documentation and code changes *inside that repo*
- Running repo commands (`npm test`, `npm run build`, `npm run typecheck`, etc.)
- Git tasks scoped to that repo (add/commit/push) when explicitly requested

## Identity and workspace

- **Agent ID**: `basedintern`
- **Workspace**: `~/basedintern/based-intern`
- **Agent dir**: `~/.openclaw-dev/agents/basedintern/agent/`

Verify:

```bash
openclaw --profile dev agents list
```

## Model

By default this setup uses the same model as `dev` unless overridden:

```bash
openclaw --profile dev agents get basedintern 2>/dev/null || true
openclaw --profile dev config get agents.defaults.model.primary
```

Typical value:

- `ollama/qwen2.5:7b-instruct`

## Tools

This agent is intended to run with **coding automation** enabled:

- `exec` — run shell commands in the repo workspace
- `read` / `write` — inspect and edit repo files
- `process` — manage longer-running commands (tests, dev servers)
- Optional: `browser` — OpenClaw-managed browser (best driven via CLI)

Verify current tool config:

```bash
openclaw --profile dev config get tools
```

## Skills

This command center loads extra skills from the repo workspace skills directory:

- `~/basedintern/based-intern/skills`

You can see what’s ready/missing:

```bash
openclaw --profile dev skills list
```

## How to run (recommended)

Run it in local embedded mode for stability:

```bash
openclaw --profile dev agent --agent basedintern --local --thinking off \
  --session-id basedintern_$(date +%s) \
  --message "Summarize this repo and identify key entrypoints."
```

## Repo workflows (copy/paste)

### Run tests

```bash
openclaw --profile dev agent --agent basedintern --local --thinking off \
  --message "Use exec to run: npm test"
```

### Build + typecheck

```bash
openclaw --profile dev agent --agent basedintern --local --thinking off \
  --message "Use exec to run: npm run build && npm run typecheck"
```

### Make a docs change safely

```bash
openclaw --profile dev agent --agent basedintern --local --thinking off \
  --message "Read docs/ then propose a small docs improvement in one file."
```

## Web access: two modes

### 1) Reliable: `exec` + `curl`

For “fetch a page/API and summarize”, the most reliable approach with small local models is:

```bash
openclaw --profile dev agent --agent basedintern --local --thinking off \
  --message "Use exec to run: curl -sL https://example.com | head -80"
```

### 2) Interactive: OpenClaw-managed browser (CLI)

If browser automation is set up (see `docs/STATUS.md`), you can do:

```bash
openclaw --profile dev browser start
openclaw --profile dev browser open https://base.org
openclaw --profile dev browser snapshot
openclaw --profile dev browser click e123
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
find ~/.openclaw-dev -name "*.lock" -type f -delete
```

### Kill stuck processes

```bash
pkill -9 -f "openclaw.*gateway" 2>/dev/null || true
pkill -9 -f "node.*openclaw" 2>/dev/null || true
```

