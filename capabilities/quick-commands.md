# Quick Commands

Essential commands for daily use.

## Agent Commands

```bash
# One-shot message
openclaw --profile dev agent --agent dev --local --message "Your question here"

# Interactive chat session
openclaw --profile dev agent --agent dev --local

# With extended thinking (for complex tasks)
openclaw --profile dev agent --agent dev --local --thinking high --message "Complex task..."
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
nc -z 127.0.0.1 19001 && echo "Gateway up"

# Check Ollama
curl -s http://127.0.0.1:11434/api/tags | jq '.models[].name'

# GPU status
nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv

# OpenClaw doctor
openclaw --profile dev doctor
```

## Quick Aliases

Add to your `~/.bashrc`:

```bash
# XmetaV shortcuts
alias oc='openclaw --profile dev'
alias oca='openclaw --profile dev agent --agent dev --local'
alias ocm='openclaw --profile dev agent --agent dev --local --message'

# Usage: ocm "What is the capital of France?"
```
