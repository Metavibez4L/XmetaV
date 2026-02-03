# Troubleshooting — OpenClaw Command Center (WSL2/Linux)

This guide targets OpenClaw 2026.2.1 on WSL2 without systemd.

## Golden-path baseline

- Profile: `dev`
- Gateway: local, loopback, port 19001
- Ollama: `http://127.0.0.1:11434`
- Provider API: `openai-chat-completions`

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

### Common cause: wrong Ollama API mode
If `models.providers.ollama.api` is set to `openai-completions`, the agent loop may send the wrong schema to Ollama.

Fix:
```bash
openclaw --profile dev config set models.providers.ollama.api openai-chat-completions
openclaw --profile dev config set models.providers.ollama.baseUrl http://127.0.0.1:11434
```

### Verify Ollama chat endpoint works
```bash
curl -s http://127.0.0.1:11434/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"qwen2.5:7b-instruct","messages":[{"role":"user","content":"Say OK"}]}' | head -c 400 && echo
```

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
