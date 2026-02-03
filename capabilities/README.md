# XmetaV Capabilities

Quick reference for everything you can do with your OpenClaw setup.

## Directory Contents

| File | Description |
|------|-------------|
| [quick-commands.md](quick-commands.md) | Essential daily-use commands |
| [agent-tasks.md](agent-tasks.md) | AI agent usage examples |
| [management.md](management.md) | System administration commands |
| [expand.md](expand.md) | How to add models, skills, channels |
| [cheatsheet.md](cheatsheet.md) | One-page reference card |

## Your Setup at a Glance

```
┌─────────────────────────────────────────┐
│              XmetaV Stack               │
├─────────────────────────────────────────┤
│  Profile:  dev                          │
│  Config:   ~/.openclaw-dev/openclaw.json│
│  Gateway:  127.0.0.1:19001              │
│  Mode:     --local (recommended)        │
├─────────────────────────────────────────┤
│  Model:    qwen2.5:7b-instruct          │
│  Provider: Ollama (native + CUDA)       │
│  GPU:      RTX 4070 (42-54 tok/s)       │
└─────────────────────────────────────────┘
```

## Quick Start

```bash
# Talk to your AI
openclaw --profile dev agent --agent dev --local --message "Hello!"

# Or start interactive session
openclaw --profile dev agent --agent dev --local
```
