# Troubleshooting — OpenClaw Command Center (WSL2/Linux)

This guide targets OpenClaw 2026.2.1 on WSL2 without systemd.

## Golden-path baseline

- Profile: `dev`
- Gateway: local, loopback, port 19001
- Ollama: `http://127.0.0.1:11434` (native install, NOT snap)
- Provider API: `openai-completions`
- Agent mode: `--local` (recommended for reliability)

### Performance expectations (with GPU)
| Metric | Expected |
|--------|----------|
| Agent response time | 2-4 seconds |
| Token generation | 40-55 tokens/sec |
| Prompt eval | 800+ tokens/sec |
| VRAM usage | ~4.9 GB |

Run the full repair + verify:
```bash
./scripts/openclaw-fix.sh
```

## Problem: "gateway closed (1006)" / tries ws://127.0.0.1:19001

### Symptoms
- `openclaw` connects to `ws://127.0.0.1:19001` and immediately fails.
- Or the CLI tries an unexpected port (e.g. remote url), and fails.

### Causes
- No gateway is running.
- Port conflict.
- Config mismatch between `gateway.mode` and `gateway.remote.url`.

### Fix
1. Make gateway local:
   ```bash
   openclaw --profile dev config set gateway.mode local
   ```
2. Start/restart gateway:
   ```bash
   ./scripts/start-gateway.sh
   ```
3. Check health:
   ```bash
   openclaw --profile dev health
   ```

## Problem: Agent hangs ("Waiting for agent reply…")

### Cause 1: Gateway websocket connection issue
The gateway websocket can hang on WSL2. **Use `--local` mode** to bypass:
```bash
openclaw --profile dev agent --agent dev --local --message "Hi"
```

### Cause 2: Ollama running on CPU (snap version)
If using snap Ollama, it lacks CUDA support. Check with:
```bash
curl -s http://127.0.0.1:11434/api/ps | grep size_vram
# If size_vram: 0, GPU is not being used
```

**Fix**: Install native Ollama with CUDA:
```bash
sudo snap disable ollama 2>/dev/null
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:7b-instruct
```

Verify GPU is working (should show ~4-5GB VRAM usage):
```bash
nvidia-smi
```

### Cause 3: Wrong API mode
OpenClaw 2026.2.1 requires `openai-completions` (NOT `openai-chat-completions`):
```bash
openclaw --profile dev config set models.providers.ollama.api openai-completions
openclaw --profile dev config set models.providers.ollama.baseUrl http://127.0.0.1:11434/v1
```

### Verify Ollama chat endpoint works
```bash
curl -s http://127.0.0.1:11434/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"qwen2.5:7b-instruct","messages":[{"role":"user","content":"Say OK"}]}'
```
Expected: Response in <1 second with GPU, 10+ seconds on CPU.

## Problem: Session lock hangs / stale .jsonl.lock

### Symptoms
- Agent runs never complete.
- You find files like `sessions/<id>.jsonl.lock`.

### Fix (safe)
This deletes only lock files:
```bash
find ~/.openclaw-dev -name "*.lock" -type f -delete
```

Then rerun:
```bash
openclaw --profile dev agent --agent dev --session-id fresh_ok --message "Say OK"
```

## Problem: Port already in use

### Symptoms
- Gateway fails to start.
- Log shows bind error.

### Fix
```bash
fuser -k 19001/tcp
./scripts/start-gateway.sh
```

## Problem: Ollama reachable but model not found

### Fix
```bash
ollama pull qwen2.5:7b-instruct
```

## Collecting logs

- Gateway logs: `~/.openclaw-dev/gateway.log`
- Quick health + agent test:
  ```bash
  ./scripts/health-check.sh
  ```
