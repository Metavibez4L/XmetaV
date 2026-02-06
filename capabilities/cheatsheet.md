# XmetaV Cheatsheet

One-page quick reference.

## Daily Commands

```bash
ocm "message"           # Quick question (alias)
oca                     # Interactive chat (alias)
ocbi "message"          # Basedintern repo agent (alias)
./scripts/health-check.sh   # Verify everything works
```

## Full Commands

```bash
# One-shot (main agent)
openclaw agent --agent main --local --message "Question"

# One-shot (basedintern agent)
openclaw agent --agent basedintern --local --message "Run npm test"

# Interactive
openclaw agent --agent main --local

# With thinking
openclaw agent --agent main --local --thinking high
```

## Management

| Action | Command |
|--------|---------|
| Start gateway | `./scripts/start-gateway.sh` |
| Stop all | `./scripts/stop-all.sh` |
| Full reset | `./scripts/openclaw-fix.sh` |
| Doctor | `openclaw doctor` |
| Config | `nano ~/.openclaw/openclaw.json` |

## Chat Commands (interactive mode)

| Command | Action |
|---------|--------|
| `/new` | Reset session |
| `/status` | Token count |
| `/think high` | Extended thinking |
| `/compact` | Summarize context |

## System Checks

```bash
# Gateway up?
nc -z 127.0.0.1 18789 && echo "OK"

# Ollama running?
curl -s localhost:11434/api/tags | jq '.models[].name'

# GPU status
nvidia-smi --query-gpu=memory.used --format=csv,noheader
```

## Add Models

```bash
ollama pull qwen2.5:7b-instruct  # Local (default)
ollama pull kimi-k2.5:cloud      # Cloud (requires ollama signin)
ollama pull llama3:8b             # Alternative
ollama pull codellama:7b          # Code-focused
```

## Key Paths

| Path | Purpose |
|------|---------|
| `~/.openclaw/openclaw.json` | Config |
| `~/.openclaw/workspace/` | Main agent files |
| `~/.openclaw/gateway.log` | Gateway logs |
| `/home/manifest/basedintern/` | Basedintern agent workspace |
| `/home/manifest/XmetaV/` | Command center |

## Recommended Aliases

```bash
# Add to ~/.bashrc
alias oc='openclaw'
alias oca='openclaw agent --agent main --local'
alias ocm='openclaw agent --agent main --local --message'
alias ocbi='openclaw agent --agent basedintern --local --message'
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Gateway stuck | `./scripts/stop-all.sh && find ~/.openclaw -name "*.lock" -delete` |
| Slow responses | Check `nvidia-smi` - ensure GPU active |
| Agent hangs | Use `--local` flag |
| Config error | Run `openclaw doctor` |
| API key error | `openclaw config set models.providers.ollama.apiKey "local"` |

## Your Setup

```
Config:   ~/.openclaw/openclaw.json
Gateway:  127.0.0.1:18789
Agents:   main (qwen2.5:7b), basedintern (kimi-k2.5:cloud)
GPU:      RTX 4070 (8GB)
Speed:    42-54 tok/s
```
