# Agent: `main`

## Purpose

`main` is the **primary command-center agent** for this machine. Use it for:

- OpenClaw configuration and operations (gateway, models, tools)
- Local system automation via tools (`exec`, `read`, `write`, `process`)
- "Glue" tasks: quick diagnostics, log inspection, scripted fixes, doc updates

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
