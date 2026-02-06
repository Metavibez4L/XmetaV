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
│  Config:   ~/.openclaw/openclaw.json    │
│  Gateway:  127.0.0.1:18789             │
│  Mode:     --local (recommended)        │
├─────────────────────────────────────────┤
│  Agents:                                │
│    main         qwen2.5:7b-instruct     │
│    basedintern  kimi-k2.5:cloud (256k)  │
├─────────────────────────────────────────┤
│  Provider: Ollama (native + CUDA)       │
│  GPU:      RTX 4070 (42-54 tok/s)       │
└─────────────────────────────────────────┘
```

## Quick Start

```bash
# Talk to your AI (default agent: main)
openclaw agent --agent main --local --message "Hello!"

# Run the basedintern repo agent
openclaw agent --agent basedintern --local --message "Summarize this repo."

# Or start interactive session
openclaw agent --agent main --local
```
