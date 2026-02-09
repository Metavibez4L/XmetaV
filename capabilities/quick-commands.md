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

## Agent Factory Commands

```bash
# Create a new agent
./scripts/create-agent.sh --id myagent --template coding --description "My agent" --web

# Create agent with a GitHub repo (auto-creates + pushes)
./scripts/create-agent.sh --id myagent --template coding --github --private --web

# Scaffold an app in agent workspace
./scripts/build-app.sh --type node --workspace /home/manifest/myagent

# Scaffold + push to GitHub
./scripts/build-app.sh --type node --workspace /home/manifest/myagent --github --private

# List all agents
./scripts/manage-agents.sh list

# Health check all agents
./scripts/manage-agents.sh status

# Get info on one agent
./scripts/manage-agents.sh info myagent

# Update agent model
./scripts/manage-agents.sh update myagent --model ollama/qwen2.5:7b-instruct

# Remove agent (keeps workspace)
./scripts/manage-agents.sh remove myagent

# Or let main agent do it
ocm "Create a Discord bot agent called social-bot"
```

## Swarm Commands

```bash
# Parallel: run tasks on multiple agents simultaneously
./scripts/swarm.sh --parallel \
  basedintern "Run npm test" \
  akua "Run /repo-ops compile"

# Pipeline: sequential chain, output flows forward
./scripts/swarm.sh --pipeline \
  main "Research best practices for X" \
  basedintern "Apply the findings"

# Collaborative: same task, multiple agents, then synthesize
./scripts/swarm.sh --collab "Review security" basedintern akua

# Use a pre-built template
./scripts/swarm.sh templates/swarms/health-all.json
./scripts/swarm.sh templates/swarms/code-review.json

# From a manifest file
./scripts/swarm.sh /path/to/manifest.json

# List past swarm runs
./scripts/swarm.sh --status

# Read results from a run
./scripts/swarm.sh --results <run-id>

# Or let main agent swarm via skill
ocm "Run a parallel health check across all repo agents"
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
alias ocakua='openclaw agent --agent akua --local --message'
alias ocakuaweb='openclaw agent --agent akua_web --local --message'

# Agent task wrappers (recommended for basedintern)
alias agtask='./scripts/agent-task.sh'
alias agpipe='./scripts/agent-pipeline.sh'

# Swarm orchestration
alias swarm='./scripts/swarm.sh'
alias swarm-p='./scripts/swarm.sh --parallel'
alias swarm-pipe='./scripts/swarm.sh --pipeline'
alias swarm-c='./scripts/swarm.sh --collab'

# Usage: ocm "What is the capital of France?"
# Usage: ocbi "Run /repo-health"
# Usage: ocakua "Run /repo-ops compile"
# Usage: agtask basedintern "Run /repo-ops typecheck"
# Usage: agtask akua "Run /repo-ops compile"
# Usage: agpipe ship "feat: add LP support"
```
