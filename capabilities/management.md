# Management Commands

System administration and configuration.

## Configuration

```bash
# View current config
openclaw config get

# Edit config directly
nano ~/.openclaw/openclaw.json

# Validate config
openclaw doctor
```

## Model Management

```bash
# List available models (in Ollama)
ollama list

# Pull new model
ollama pull llama3:8b

# Remove model
ollama rm model-name

# Model info
ollama show qwen2.5:7b-instruct

# Sign in for cloud models
ollama signin
```

## Agent Management

```bash
# List configured agents
openclaw agents list

# Run specific agent
openclaw agent --agent main --local --message "Hello"
openclaw agent --agent basedintern --local --message "Run tests"

# View agent config
openclaw config get agents.list
```

## Gateway Control

```bash
# Start gateway (background)
./scripts/start-gateway.sh

# Start gateway (foreground, verbose)
openclaw gateway --port 18789 --verbose

# Check gateway health
openclaw health

# View gateway logs
tail -f ~/.openclaw/gateway.log
```

## Process Management

```bash
# Find OpenClaw processes
pgrep -af openclaw

# Kill all OpenClaw
pkill -f "openclaw.*gateway"

# Check port usage
lsof -i :18789
ss -tlnp | grep 18789
```

## Ollama Management

```bash
# Check Ollama status
systemctl status ollama

# Restart Ollama
sudo systemctl restart ollama

# View Ollama logs
journalctl -u ollama -f

# Check GPU usage
nvidia-smi -l 1
```

## Lock Files & Cleanup

```bash
# Remove stale locks
find ~/.openclaw -name "*.lock" -type f -delete

# Clear session cache (careful — removes history)
rm -rf ~/.openclaw/agents/*/sessions/*

# Reset to clean state
./scripts/stop-all.sh
find ~/.openclaw -name "*.lock" -delete
./scripts/start-gateway.sh
```

## Diagnostics

```bash
# Full system check
openclaw doctor

# Test Ollama connection
curl http://127.0.0.1:11434/api/generate -d '{
  "model": "qwen2.5:7b-instruct",
  "prompt": "Hi",
  "stream": false
}' | jq '.response'

# Check VRAM usage
nvidia-smi --query-gpu=memory.used,memory.total --format=csv
```
