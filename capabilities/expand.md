# Expanding Capabilities

How to add models, skills, and channels.

## Adding Models

### Ollama Models

```bash
# Recommended models for your RTX 4070 (8GB VRAM)
ollama pull qwen2.5:7b-instruct      # Current (balanced)
ollama pull llama3:8b                 # General purpose
ollama pull codellama:7b              # Code-focused
ollama pull mistral:7b                # Fast, efficient
ollama pull deepseek-coder:6.7b       # Coding specialist

# Cloud models (require ollama signin)
ollama pull kimi-k2.5:cloud           # 256k context, multimodal

# Larger models (may need quantization)
ollama pull qwen2.5:14b               # Better reasoning
ollama pull codellama:13b             # Better code
```

### Register Models in Config

Edit `~/.openclaw/openclaw.json`:

```json
{
  "models": {
    "providers": {
      "ollama": {
        "baseUrl": "http://127.0.0.1:11434/v1",
        "apiKey": "local",
        "api": "openai-responses",
        "models": [
          { "id": "qwen2.5:7b-instruct", "name": "qwen2.5:7b-instruct" },
          { "id": "kimi-k2.5:cloud", "name": "kimi-k2.5:cloud" },
          { "id": "llama3:8b", "name": "llama3:8b" }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": { "primary": "ollama/qwen2.5:7b-instruct" }
    }
  }
}
```

### Cloud Models (API keys required)

```json
{
  "models": {
    "anthropic": {
      "models": {
        "anthropic/claude-opus-4-5": {}
      }
    },
    "openai": {
      "models": {
        "openai/gpt-4o": {}
      }
    }
  }
}
```

## Adding Skills

### From ClawHub

```bash
# Search for skills
openclaw skills search "web scraper"
openclaw skills search "file manager"

# Install a skill
openclaw skills install @openclaw/skill-web
openclaw skills install @openclaw/skill-github

# List installed
openclaw skills list
```

### Custom Skills

Create `~/.openclaw/workspace/skills/my-skill/SKILL.md`:

```markdown
# My Custom Skill

## Description
A custom skill that does X.

## Commands
- `/mycommand` - Does something useful

## Instructions
When the user asks about X, do Y.
```

## Connecting Channels

### Telegram

```json
{
  "channels": {
    "telegram": {
      "botToken": "YOUR_BOT_TOKEN"
    }
  }
}
```

### Discord

```json
{
  "channels": {
    "discord": {
      "token": "YOUR_BOT_TOKEN"
    }
  }
}
```

### Slack

```json
{
  "channels": {
    "slack": {
      "botToken": "xoxb-...",
      "appToken": "xapp-..."
    }
  }
}
```

### WhatsApp

```bash
# Login via QR code
openclaw channels login whatsapp
```

> **Note**: Channels require gateway mode (not `--local`). You may need to investigate the websocket hang issue for full channel support.

## Creating Custom Agents

Add an agent to `~/.openclaw/openclaw.json` under `agents.list`:

```json
{
  "id": "my-agent",
  "workspace": "/path/to/workspace",
  "model": {
    "primary": "ollama/qwen2.5:7b-instruct"
  }
}
```

Optionally, create agent personality files in the workspace:
- `AGENTS.md` — identity, capabilities, rules
- `SOUL.md` — personality and operating principles
- `TOOLS.md` — local setup notes

## Adding Tools

Tools are controlled via the `tools` section in `openclaw.json`:

```json
{
  "tools": {
    "profile": "coding",
    "allow": ["exec", "process", "read", "write"],
    "deny": ["tts"]
  }
}
```

For full tool access (like `basedintern`):

```json
{
  "tools": {
    "profile": "full",
    "allow": ["group:fs", "group:runtime", "group:ui", "group:web", "group:sessions", "group:automation"],
    "elevated": {
      "enabled": true
    }
  }
}
```
