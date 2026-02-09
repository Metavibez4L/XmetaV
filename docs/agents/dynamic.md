# Dynamic Agents — Created by Agent Factory

> Runbook for agents created at runtime by the `main` agent's Agent Factory skill.

## How Dynamic Agents Work

The `main` agent can create new OpenClaw agents on the fly using the Agent Factory skill. Each new agent gets:

1. **Config entry** in `~/.openclaw/openclaw.json` (under `agents.list`)
2. **Workspace directory** (default: `/home/manifest/<agent-id>/`)
3. **Identity files** (`AGENTS.md` + `SOUL.md`) seeded from templates
4. **Optional app scaffold** (Node.js, Python, bot, etc.)
5. **Optional `_web` companion** agent with full tools (matching the basedintern/akua pattern)
6. **Optional GitHub repo** — auto-created and pushed via `gh` CLI (`--github` flag)
7. **Agent runbook** auto-generated at `docs/agents/<agent-id>.md`

## Creating Agents

### Via the main agent (recommended)

Ask the main agent directly:

```bash
openclaw agent --agent main --local --message "Create a research agent for web scraping"
```

The main agent will use its Agent Factory skill to:
- Choose the right template
- Create the agent and workspace
- Scaffold an app if needed
- Report back with usage instructions

### Via scripts (manual)

```bash
# Create agent
./scripts/create-agent.sh --id researcher \
  --template research \
  --description "Web research and data gathering" \
  --web

# Create agent + GitHub repo (auto-creates Metavibez4L/researcher and pushes)
./scripts/create-agent.sh --id researcher \
  --template research \
  --description "Web research and data gathering" \
  --web --github --private

# Scaffold an app
./scripts/build-app.sh --type node --workspace /home/manifest/researcher

# Scaffold an app + push to GitHub
./scripts/build-app.sh --type node --workspace /home/manifest/researcher --github
```

## Managing Dynamic Agents

```bash
# List all agents
./scripts/manage-agents.sh list

# Health check
./scripts/manage-agents.sh status

# Get details on one agent
./scripts/manage-agents.sh info researcher

# Update agent config
./scripts/manage-agents.sh update researcher --model ollama/qwen2.5:7b-instruct

# Remove agent (preserves workspace)
./scripts/manage-agents.sh remove researcher
```

## Agent Templates

Templates live in `XmetaV/templates/agents/` and contain pre-written identity content.

| Template | Best for | Default tools |
|----------|----------|---------------|
| `coding` | Repo work, code, tests | coding (exec, read, write, process) |
| `bot` | Discord, Telegram bots | coding |
| `research` | Web research, data gathering | full (includes web tools) |
| `devops` | Infrastructure, deployment | coding |
| `general` | Everything else | coding |

## App Types

The `build-app.sh` script can scaffold these project types:

| Type | What you get |
|------|-------------|
| `node` | TypeScript project (package.json, tsconfig, src/index.ts) |
| `python` | Python project (requirements.txt, pyproject.toml, src/main.py, venv) |
| `nextjs` | Full Next.js app (via create-next-app with TypeScript + Tailwind) |
| `hardhat` | Solidity project (Hardhat config, contracts/, tests) |
| `bot` | Discord bot (discord.js, event handlers, .env template) |
| `fastapi` | FastAPI server (uvicorn, Pydantic models, health endpoint) |
| `script` | Task scripts (bash + Node.js task runners) |

Each scaffold also creates a tailored `repo-ops` skill.

## Safety Limits

- **Max agents**: 10 by default (set `MAX_AGENTS` env var to change)
- **Naming**: Agent IDs must be lowercase alphanumeric + hyphens
- **Idempotent**: Creating an agent with an existing ID updates it (no duplicates)
- **No overwrites**: Existing AGENTS.md/SOUL.md are never overwritten
- **Workspace preserved on remove**: `manage-agents.sh remove` only removes the config entry

## Self-Spawn Behavior

The `main` agent can autonomously create agents when it identifies the need. It will:
1. Verify no existing agent covers the task
2. Check the agent count limit
3. Choose the appropriate template
4. Create the agent and explain why

Self-spawn is governed by rules in the Agent Factory skill — see `~/.openclaw/workspace/skills/agent-factory/SKILL.md`.

## Running Dynamic Agents

```bash
# Using the task wrapper (recommended)
./scripts/agent-task.sh <agent-id> "Your task here"

# Direct openclaw
openclaw agent --agent <agent-id> --local --thinking off \
  --session-id <agent-id>_$(date +%s) \
  --message "Your task here"

# If a _web companion exists
openclaw agent --agent <agent-id>_web --local --thinking off \
  --session-id <agent-id>web_$(date +%s) \
  --message "Web task here"
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Agent not found after creation | Check `openclaw agents list` — config may need gateway restart |
| Workspace missing | Re-run `create-agent.sh` with same ID (idempotent) |
| App scaffold incomplete | Re-run `build-app.sh` — it skips existing files |
| Agent limit reached | Increase `MAX_AGENTS` or remove unused agents |
| Identity files empty | Delete them and re-run `create-agent.sh` to re-seed |
