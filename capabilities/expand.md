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

# Larger models (may need quantization)
ollama pull qwen2.5:14b               # Better reasoning
ollama pull codellama:13b             # Better code
```

### Switch Models in Config

Edit `~/.openclaw-dev/openclaw.json`:

```json5
{
  models: {
    ollama: {
      api: "openai-completions",
      baseUrl: "http://127.0.0.1:11434/v1",
      models: {
        "ollama/qwen2.5:7b-instruct": {},
        "ollama/llama3:8b": {},
        "ollama/codellama:7b": {}
      }
    }
  },
  agent: {
    model: "ollama/qwen2.5:7b-instruct"  // Change this
  }
}
```

### Cloud Models (API keys required)

```json5
{
  models: {
    anthropic: {
      // Uses ANTHROPIC_API_KEY env var
      models: {
        "anthropic/claude-opus-4-5": {}
      }
    },
    openai: {
      // Uses OPENAI_API_KEY env var
      models: {
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

Create `~/.openclaw-dev/workspace/skills/my-skill/SKILL.md`:

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

```json5
// In openclaw.json
{
  channels: {
    telegram: {
      botToken: "YOUR_BOT_TOKEN"  // From @BotFather
    }
  }
}
```

### Discord

```json5
{
  channels: {
    discord: {
      token: "YOUR_BOT_TOKEN"
    }
  }
}
```

### Slack

```json5
{
  channels: {
    slack: {
      botToken: "xoxb-...",
      appToken: "xapp-..."
    }
  }
}
```

### WhatsApp

```bash
# Login via QR code
openclaw channels login whatsapp
```

> ⚠️ **Note**: Channels require gateway mode (not `--local`). You may need to investigate the websocket hang issue for full channel support.

## Creating Custom Agents

Edit `~/.openclaw-dev/workspace/AGENTS.md`:

```markdown
# My Custom Agent

## Personality
You are a helpful coding assistant specialized in Python.

## Rules
- Always include docstrings
- Prefer type hints
- Follow PEP 8

## Knowledge
- Expert in FastAPI, Django, Flask
- Familiar with data science libraries
```

## Adding Tools

Tools are defined in skills or the agent workspace:

```markdown
## Tools

### web_search
Search the web for information.

### file_read
Read contents of a file.

### bash
Execute shell commands.
```
