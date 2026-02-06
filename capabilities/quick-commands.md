# Quick Commands

Essential commands for daily use.

## Agent Commands

```bash
# One-shot message (default agent: main)
openclaw agent --agent main --local --message "Your question here"

# Run basedintern repo agent (using skills — preferred)
openclaw agent --agent basedintern --local --message "Run /repo-health"

# Interactive chat session
openclaw agent --agent main --local

# With extended thinking (for complex tasks)
openclaw agent --agent main --local --thinking high --message "Complex task..."
```

## Agent Task Wrappers (anti-stall)

```bash
# Single atomic task (fresh session, --local, --thinking off)
./scripts/agent-task.sh basedintern "Run /repo-health"
./scripts/agent-task.sh basedintern "Run /repo-ops typecheck"

# Multi-step pipelines (each step = separate agent run)
./scripts/agent-pipeline.sh health                          # typecheck + test + report
./scripts/agent-pipeline.sh ship "feat: add new feature"    # typecheck + test + commit + push
./scripts/agent-pipeline.sh fix                             # typecheck + report errors
./scripts/agent-pipeline.sh evolve "add retry logic"        # health + implement + health

# Use a different agent
AGENT=basedintern_web ./scripts/agent-pipeline.sh health
```

## Gateway Management

```bash
# Start gateway
./scripts/start-gateway.sh

# Stop all services
./scripts/stop-all.sh

# Health check
./scripts/health-check.sh

# Full fix/reset
./scripts/openclaw-fix.sh
```

## Status Checks

```bash
# Check if gateway is running
nc -z 127.0.0.1 18789 && echo "Gateway up"

# Check Ollama
curl -s http://127.0.0.1:11434/api/tags | jq '.models[].name'

# GPU status
nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv

# OpenClaw doctor
openclaw doctor
```

## Quick Aliases

Add to your `~/.bashrc`:

```bash
# XmetaV shortcuts
alias oc='openclaw'
alias oca='openclaw agent --agent main --local'
alias ocm='openclaw agent --agent main --local --message'
alias ocbi='openclaw agent --agent basedintern --local --message'
alias ocbiweb='openclaw agent --agent basedintern_web --local --message'

# Agent task wrappers (recommended for basedintern)
alias agtask='./scripts/agent-task.sh'
alias agpipe='./scripts/agent-pipeline.sh'

# Usage: ocm "What is the capital of France?"
# Usage: ocbi "Run /repo-health"
# Usage: agtask basedintern "Run /repo-ops typecheck"
# Usage: agpipe ship "feat: add LP support"
```
