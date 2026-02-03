# Management Commands

System administration and configuration.

## Configuration

```bash
# View current config
openclaw --profile dev config get

# Edit config directly
nano ~/.openclaw-dev/openclaw.json

# Validate config
openclaw --profile dev doctor
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
```

## Gateway Control

```bash
# Start gateway (foreground, verbose)
openclaw --profile dev gateway --verbose

# Start gateway (background)
openclaw --profile dev gateway &

# Check gateway health
curl -s http://127.0.0.1:19001/health | jq

# View gateway logs
tail -f ~/.openclaw-dev/logs/gateway.log
```

## Process Management

```bash
# Find OpenClaw processes
pgrep -af openclaw

# Kill all OpenClaw
pkill -f "openclaw.*gateway"

# Check port usage
lsof -i :19001
ss -tlnp | grep 19001
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
rm -f ~/.openclaw-dev/*.lock

# Clear session cache
rm -rf ~/.openclaw-dev/sessions/*

# Reset to clean state
./scripts/stop-all.sh
rm -f ~/.openclaw-dev/*.lock
./scripts/start-gateway.sh
```

## Profile Management

```bash
# Using dev profile (your setup)
openclaw --profile dev <command>

# Default profile (if configured)
openclaw <command>

# List profiles
ls ~/.openclaw*/openclaw.json
```

## Diagnostics

```bash
# Full system check
openclaw --profile dev doctor

# Test Ollama connection
curl http://127.0.0.1:11434/api/generate -d '{
  "model": "qwen2.5:7b-instruct",
  "prompt": "Hi",
  "stream": false
}' | jq '.response'

# Check VRAM usage
nvidia-smi --query-gpu=memory.used,memory.total --format=csv
```
