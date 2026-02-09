# Agent: `main`

## Purpose

`main` is the **orchestrator and primary command-center agent** for this machine. Use it for:

- **Agent Factory** — creating new agents, scaffolding apps, managing the fleet
- OpenClaw configuration and operations (gateway, models, tools)
- Local system automation via tools (`exec`, `read`, `write`, `process`)
- "Glue" tasks: quick diagnostics, log inspection, scripted fixes, doc updates
- Delegating specialized work to purpose-built agents

## Identity and workspace

- **Agent ID**: `main` (default)
- **Workspace**: `~/.openclaw/workspace`
- **Agent dir**: `~/.openclaw/agents/main/agent/`

Verify:

```bash
openclaw agents list
```

## Model

Default model is configured at:

```bash
openclaw config get agents.defaults.model.primary
```

Typical value in this setup:

- `ollama/kimi-k2.5:cloud` (256k context)

## Tools

`main` inherits the profile-level tool configuration (see `docs/STATUS.md`).

Typical baseline:

- **Tools profile**: `coding`
- **Allowed**: `exec`, `process`, `read`, `write` (plus `browser` if enabled)
- **Denied**: `tts` (prevents small-model tool-loop failure modes)
- **Exec host**: `gateway` (runs shell commands on the machine via the gateway)

Verify:

```bash
openclaw config get tools
```

## How to run (recommended)

Use local embedded mode for stability on WSL2 + small local models:

```bash
openclaw agent --agent main --local --thinking off \
  --session-id main_$(date +%s) \
  --message "Call exec with: uname -a"
```

## Useful "ops" prompts (copy/paste)

### Quick environment status

```bash
openclaw agent --agent main --local --thinking off \
  --message "Use exec to run: openclaw health"
```

### Confirm tool calling actually executes

```bash
openclaw agent --agent main --local --thinking off \
  --message "Call the exec tool with command: date +%Y-%m-%d"
```

## Agent Factory (orchestrator)

The main agent has the **Agent Factory** skill installed. It can:

- Create new agents: `/spawn-agent <id> --template <type>`
- Scaffold apps: `/build-app <type> <workspace>`
- List agents: `/list-agents`
- Health check: `/agent-status`

### Create an agent via prompt

```bash
openclaw agent --agent main --local --thinking off \
  --message "Create a research agent and scaffold a Node.js project for it"
```

### Create an agent via script

```bash
/home/manifest/XmetaV/scripts/create-agent.sh --id researcher --template research --web
/home/manifest/XmetaV/scripts/build-app.sh --type node --workspace /home/manifest/researcher
```

### Manage the fleet

```bash
/home/manifest/XmetaV/scripts/manage-agents.sh list
/home/manifest/XmetaV/scripts/manage-agents.sh status
```

## Swarm Orchestration

The main agent has the **Swarm** skill installed. It can orchestrate multi-agent operations across the fleet.

### Three modes

| Mode | How it works | Best for |
|------|-------------|----------|
| **Parallel** | All tasks run simultaneously | Independent tasks, health checks, audits |
| **Pipeline** | Sequential chain, output flows forward | Research -> implement, analyze -> fix |
| **Collaborative** | Same task to multiple agents, then synthesize | Code review, security audit |

### Swarm via prompt

```bash
openclaw agent --agent main --local --thinking off \
  --message "Run a parallel health check on basedintern and akua"
```

### Swarm via script

```bash
# Parallel
/home/manifest/XmetaV/scripts/swarm.sh --parallel \
  basedintern "Run /repo-health" \
  akua "Run /repo-health"

# Pipeline
/home/manifest/XmetaV/scripts/swarm.sh --pipeline \
  main "Research TypeScript error handling best practices" \
  basedintern "Apply the findings to the codebase"

# Collaborative
/home/manifest/XmetaV/scripts/swarm.sh --collab \
  "Review the last commit for bugs and security issues" \
  basedintern akua

# Pre-built templates
/home/manifest/XmetaV/scripts/swarm.sh templates/swarms/health-all.json
/home/manifest/XmetaV/scripts/swarm.sh templates/swarms/code-review.json
```

### Check results

```bash
/home/manifest/XmetaV/scripts/swarm.sh --status
/home/manifest/XmetaV/scripts/swarm.sh --results <run-id>
```

Results are stored in `~/.openclaw/swarm/<run-id>/` with per-task outputs and a `summary.md`.

See `docs/SWARM.md` for the full reference.

## Browser automation (optional)

Browser automation is primarily operated via the deterministic CLI:

```bash
openclaw browser start
openclaw browser open https://example.com
openclaw browser snapshot
```

If you want the agent to drive the browser tool directly, note that smaller local models may be inconsistent. Prefer the CLI for reliable browser runs.

## Maintenance / recovery

### Stale lock cleanup (safe)

```bash
find ~/.openclaw -name "*.lock" -type f -delete
```

### Kill stuck processes (last resort)

```bash
pkill -9 -f "openclaw.*gateway" 2>/dev/null || true
pkill -9 -f "node.*openclaw" 2>/dev/null || true
```
