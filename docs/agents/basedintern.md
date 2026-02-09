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

- `ollama/kimi-k2.5:cloud` (cloud; 256k context, maxTokens capped at 8192)

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

Installed skills in the basedintern workspace (`/home/manifest/basedintern/.openclaw/skills/`):

| Skill | Description |
|-------|-------------|
| `github` | GitHub CLI (`gh`) for issues, PRs, CI runs |
| `self-edit` | Edit skill files |
| `self-evolve` | Self-modification with backup/restore |
| `repo-ops` | Atomic repo operations (typecheck, test, commit, push) |
| `repo-health` | Full health check returning structured JSON |

```bash
openclaw skills list
```

### repo-ops (most useful)

Single-command repo operations — eliminates multi-step exec chaining:

```bash
# Typecheck
/repo-ops typecheck

# Run tests
/repo-ops test

# Full check (typecheck + test)
/repo-ops check

# Git status
/repo-ops status

# Commit + push
/repo-ops commit "feat: add new feature"
/repo-ops push
```

### repo-health

One-shot health check that returns structured JSON:

```bash
/repo-health
```

Output:
```json
{
  "tsc": "pass",
  "tsc_errors": 0,
  "tests": "pass",
  "tests_total": 217,
  "tests_passed": 217,
  "tests_failed": 0,
  "git": "clean",
  "git_branch": "main",
  "git_changed_files": 0
}
```

## How to run (recommended)

### Option 1: agent-task.sh wrapper (best for reliability)

Use the XmetaV wrapper script that bakes in all anti-stall best practices:

```bash
# Single atomic task
./scripts/agent-task.sh basedintern "Run /repo-health and report results"

# Chain tasks (stops on first failure)
./scripts/agent-task.sh basedintern "Run /repo-ops typecheck" && \
./scripts/agent-task.sh basedintern "Run /repo-ops test"
```

### Option 2: agent-pipeline.sh (multi-step workflows)

```bash
# Health check
./scripts/agent-pipeline.sh health

# Ship (typecheck + test + commit + push)
./scripts/agent-pipeline.sh ship "feat: add LP support"

# Evolve (health + implement + health)
./scripts/agent-pipeline.sh evolve "add retry logic to moltbook posting"
```

### Option 3: Direct openclaw (manual control)

```bash
# Default (coding tools — fast, lean)
openclaw agent --agent basedintern --local --thinking off \
  --session-id bi_$(date +%s) \
  --message "Run /repo-health"

# Full tools (only when needed)
openclaw agent --agent basedintern_web --local --thinking off \
  --session-id biweb_$(date +%s) \
  --message "Use web_fetch to check https://example.com"
```

## Anti-stall best practices

The agent stalls on complex multi-step prompts. Avoid this by:

1. **One task per message** — never combine "typecheck AND fix AND commit" in one prompt
2. **Use skills** — `/repo-ops typecheck` is one tool call; "run npx tsc --noEmit" requires reasoning about cd, exec, etc.
3. **Fresh session per task** — `--session-id bi_$(date +%s)` prevents context pollution
4. **Use `--thinking off`** — reduces token waste on Kimi K2.5
5. **Use `--local`** — avoids gateway websocket hangs on WSL2
6. **Use the wrapper scripts** — `agent-task.sh` and `agent-pipeline.sh` enforce all of the above

## Repo workflows (copy/paste)

### Quick health check

```bash
./scripts/agent-task.sh basedintern "Run /repo-health"
```

### Run tests only

```bash
./scripts/agent-task.sh basedintern "Run /repo-ops test"
```

### Ship changes

```bash
./scripts/agent-pipeline.sh ship "feat: add new feature"
```

### Implement + verify

```bash
./scripts/agent-pipeline.sh evolve "add error handling to the LP manager"
```

### Web access (use basedintern_web)

```bash
./scripts/agent-task.sh basedintern_web "Use web_fetch to fetch https://example.com and summarize"
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
