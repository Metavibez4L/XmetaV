# XmetaV Cheatsheet

One-page quick reference.

## 🚀 Daily Commands

```bash
ocm "message"           # Quick question (alias)
oca                     # Interactive chat (alias)
./scripts/health-check.sh   # Verify everything works
```

## 📝 Full Commands

```bash
# One-shot
openclaw --profile dev agent --agent dev --local --message "Question"

# Interactive
openclaw --profile dev agent --agent dev --local

# With thinking
openclaw --profile dev agent --agent dev --local --thinking high
```

## 🔧 Management

| Action | Command |
|--------|---------|
| Start gateway | `./scripts/start-gateway.sh` |
| Stop all | `./scripts/stop-all.sh` |
| Full reset | `./scripts/openclaw-fix.sh` |
| Doctor | `openclaw --profile dev doctor` |
| Config | `nano ~/.openclaw-dev/openclaw.json` |

## 💬 Chat Commands (interactive mode)

| Command | Action |
|---------|--------|
| `/new` | Reset session |
| `/status` | Token count |
| `/think high` | Extended thinking |
| `/compact` | Summarize context |

## 🖥️ System Checks

```bash
# Gateway up?
nc -z 127.0.0.1 19001 && echo "OK"

# Ollama running?
curl -s localhost:11434/api/tags | jq '.models[].name'

# GPU status
nvidia-smi --query-gpu=memory.used --format=csv,noheader
```

## 📦 Add Models

```bash
ollama pull llama3:8b
ollama pull codellama:7b
ollama pull mistral:7b
```

## 🔑 Key Paths

| Path | Purpose |
|------|---------|
| `~/.openclaw-dev/openclaw.json` | Config |
| `~/.openclaw-dev/workspace/` | Agent files |
| `~/.openclaw-dev/logs/` | Logs |
| `/home/manifest/projects/XmetaV/` | Command center |

## ⚡ Recommended Aliases

```bash
# Add to ~/.bashrc
alias oc='openclaw --profile dev'
alias oca='openclaw --profile dev agent --agent dev --local'
alias ocm='openclaw --profile dev agent --agent dev --local --message'
```

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| Gateway stuck | `./scripts/stop-all.sh && rm ~/.openclaw-dev/*.lock` |
| Slow responses | Check `nvidia-smi` - ensure GPU active |
| Agent hangs | Use `--local` flag |
| Config error | Run `openclaw --profile dev doctor` |

## 📊 Your Setup

```
Profile:  dev
Gateway:  127.0.0.1:19001
Model:    qwen2.5:7b-instruct
GPU:      RTX 4070 (8GB)
Speed:    42-54 tok/s
```
