# Agent: `akua` (+ `akua_web`)

## Purpose

`akua` is a **repo agent** whose workspace is the [akua](https://github.com/Metavibez4L/akua) repository checkout. Use it for:

- Smart contract development & compilation (Solidity/Hardhat/Foundry)
- Frontend development (Next.js/React)
- Running tests, linting, and deployments
- Ops-agent management (Go-based CRE flows)
- Documentation and code changes *inside that repo*
- Git tasks scoped to that repo (add/commit/push) when explicitly requested

## Agent split (Kimi optimization)

To reduce Kimi cloud token usage and avoid 429s, this agent is split into two:

| Agent ID | Tools | When to use |
|----------|-------|-------------|
| `akua` | **coding** (exec, read, write, process) | 90% of work: code changes, tests, commits |
| `akua_web` | **full** (fs, runtime, web, browser, automation) | Only when you need browser/web automation |

Both share the same workspace (`/home/manifest/akua`) and model (`kimi-k2.5:cloud`).

**Why the split matters**: The `coding` profile advertises ~4 tools to the model. The `full` profile advertises 20+ tools. Fewer tools = smaller tool schema per turn = fewer tokens per Kimi call = faster + less likely to hit 429.

## Identity and workspace

- **Agent ID**: `akua` (coding) / `akua_web` (full)
- **Workspace**: `/home/manifest/akua` (repo root, shared)
- **Repo**: `https://github.com/Metavibez4L/akua`
- **Agent dir**: `~/.openclaw/agents/akua/agent/`

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

## Tools

### `akua` (default — use this)

Lean tool set for maximum speed and minimum token usage:

- `exec` — run shell commands in the repo workspace
- `read` / `write` — inspect and edit repo files
- `process` — manage longer-running commands (tests, dev servers)

### `akua_web` (full — use sparingly)

All tools, for when you actually need web automation:

- Everything in `akua` plus:
- `web_fetch` / `web_search` — fetch pages + research
- `browser` — OpenClaw-managed browser automation (UI tool)
- `sessions` — inspect agent sessions

## Skills

Installed skills in the akua workspace (`/home/manifest/akua/.openclaw/skills/`):

| Skill | Description |
|-------|-------------|
| `github` | GitHub CLI (`gh`) for issues, PRs, CI runs |
| `self-edit` | Edit skill files |
| `self-evolve` | Self-modification with backup/restore |
| `repo-ops` | Atomic repo operations (compile, test, lint, frontend, commit, push) |
| `repo-health` | Full health check returning structured JSON |

```bash
openclaw skills list
```

### repo-ops (most useful)

Single-command repo operations — eliminates multi-step exec chaining:

```bash
# Compile Solidity contracts
/repo-ops compile

# Run Hardhat tests
/repo-ops test

# Lint
/repo-ops lint

# Typecheck frontend (Next.js)
/repo-ops frontend

# Full check (compile + test)
/repo-ops check

# Git status
/repo-ops status

# Commit + push
/repo-ops commit "feat: add new escrow logic"
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
  "compile": "pass",
  "compile_errors": 0,
  "tests": "pass",
  "tests_total": 42,
  "tests_passed": 42,
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
./scripts/agent-task.sh akua "Run /repo-health and report results"

# Chain tasks (stops on first failure)
./scripts/agent-task.sh akua "Run /repo-ops compile" && \
./scripts/agent-task.sh akua "Run /repo-ops test"
```

### Option 2: Direct openclaw (manual control)

```bash
# Default (coding tools — fast, lean)
openclaw agent --agent akua --local --thinking off \
  --session-id akua_$(date +%s) \
  --message "Run /repo-health"

# Full tools (only when needed)
openclaw agent --agent akua_web --local --thinking off \
  --session-id akuaweb_$(date +%s) \
  --message "Use web_fetch to check https://example.com"
```

## Repo tech stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity (Hardhat + Foundry) |
| Contract Testing | Hardhat (JS/TS) + Foundry (Solidity) |
| Frontend | Next.js / React / TypeScript |
| Backend | Supabase (Edge Functions) |
| Ops Agent | Go (CRE flows: DTA + Escrow) |
| Oracles | Chainlink (Price, Automation, CCIP) |
| Deployment | Arbitrum Sepolia |

## CRE troubleshooting: “Trigger Success” but Execution Failure

### Symptom (CRE dashboard)

- Execution shows **trigger: Success** but overall **Status: Failure**
- Downstream compute/consensus steps may be missing
- Yet you still see rows in Supabase (e.g. `cre_events`) because at least one DON node delivered the webhook

### Root cause (common)

CRE DON nodes call the webhook independently and reach consensus on the HTTP result. If the webhook response body differs across nodes (non-deterministic), **HTTP consensus fails**.

We hit this when the Supabase Edge Function returned:

- `eventId = <db uuid>` on first insert
- `eventId = <dedupeKey>` on duplicate calls (`ignoreDuplicates`)

Different JSON ⇒ consensus fails ⇒ CRE UI shows Failure.

### Fix (required pattern)

Webhook responses **must be deterministic** for the same request payload. For Supabase ingest endpoints, always return a stable identifier (e.g. `dedupeKey`) rather than a DB-generated UUID.

In the akua repo this was fixed by always returning `eventId = dedupeKey` in:

- `supabase/functions/cre-webhook-ingest`
- `supabase/functions/dta-webhook-ingest`

### Deploy (Supabase Edge Functions)

Deploying functions requires a **Supabase Personal Access Token** (`sbp_*`) — not the anon key or service role key.

```bash
# From /home/manifest/akua
export PATH="/home/manifest/.nvm/versions/node/v22.22.0/bin:$PATH"
export SUPABASE_ACCESS_TOKEN="sbp_..."

npx supabase functions deploy cre-webhook-ingest --project-ref uisdairqmxtgpeymkvxt --no-verify-jwt
npx supabase functions deploy dta-webhook-ingest --project-ref uisdairqmxtgpeymkvxt --no-verify-jwt
```

### Verify (determinism check)

Call the same webhook payload multiple times and confirm the JSON responses are identical (especially `eventId`).

## Anti-stall best practices

The agent stalls on complex multi-step prompts. Avoid this by:

1. **One task per message** — never combine "compile AND fix AND commit" in one prompt
2. **Use skills** — `/repo-ops compile` is one tool call; "run npx hardhat compile" requires reasoning
3. **Fresh session per task** — `--session-id akua_$(date +%s)` prevents context pollution
4. **Use `--thinking off`** — reduces token waste on Kimi K2.5
5. **Use `--local`** — avoids gateway websocket hangs on WSL2
6. **Use the wrapper scripts** — `agent-task.sh` enforces all of the above

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
