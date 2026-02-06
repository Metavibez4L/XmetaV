# Quick Commands

Essential commands for daily use.

## Agent Commands

```bash
# One-shot message (default agent: main)
openclaw agent --agent main --local --message "Your question here"

# Run basedintern repo agent
openclaw agent --agent basedintern --local --message "Run npm test."

# Interactive chat session
openclaw agent --agent main --local

# With extended thinking (for complex tasks)
openclaw agent --agent main --local --thinking high --message "Complex task..."
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

# Usage: ocm "What is the capital of France?"
# Usage: ocbi "Run npm test and report failures."
```
