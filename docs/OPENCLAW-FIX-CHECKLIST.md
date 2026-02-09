# OpenClaw 2026.2.1 WSL2 Fix — Verification Checklist

## Quick Start
```bash
chmod +x scripts/openclaw-fix.sh
./scripts/openclaw-fix.sh
```

---

## Pre-flight Checks

| # | Check | Command | Expected | If Fails |
|---|-------|---------|----------|----------|
| 1 | Ollama running | `curl -s http://127.0.0.1:11434/api/tags` | JSON with models list | `ollama serve` |
| 2 | Model available | `curl -s http://127.0.0.1:11434/api/tags \| grep qwen2.5:7b-instruct` | Match found | `ollama pull qwen2.5:7b-instruct` |
| 3 | GPU enabled | `curl -s http://127.0.0.1:11434/api/ps \| grep size_vram` | `size_vram > 0` | Reinstall native Ollama (not snap) |
| 4 | No stale locks | `find ~/.openclaw -name "*.lock"` | No output | `find ~/.openclaw -name "*.lock" -delete` |
| 5 | No zombie procs | `pgrep -f 'openclaw\|gateway'` | No output | `pkill -9 -f openclaw` |

---

## Post-Fix Verification

### Step 1: Gateway Health
```bash
openclaw health
```
**Expected:**
```
Gateway: ws://127.0.0.1:18789
Status: connected
Uptime: ...
```
**If fails:** Check `~/.openclaw/gateway.log`

---

### Step 2: Models List
```bash
openclaw models list
```
**Expected:** Table showing `ollama/qwen2.5:7b-instruct` with `contextWindow: 32768`

**If fails:** Check `models.providers.ollama.baseUrl` is `http://127.0.0.1:11434/v1`

---

### Step 3: Agent Response (THE MAIN TEST)

**Use `--local` mode** (bypasses gateway websocket issues):
```bash
openclaw agent \
  --agent main \
  --local \
  --session-id test_ok_$(date +%s) \
  --message "Say hello briefly"
```
**Expected:**
- Response in 2-4 seconds (GPU) or 30+ seconds (CPU)
- JSON with `payloads` containing assistant response

**If hangs:**
1. Check GPU is being used: `curl -s http://127.0.0.1:11434/api/ps | grep size_vram`
2. If `size_vram: 0`, reinstall Ollama natively (not snap):
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ollama pull qwen2.5:7b-instruct
   ```
3. Verify Ollama responds: `curl http://127.0.0.1:11434/v1/chat/completions -d '{"model":"qwen2.5:7b-instruct","messages":[{"role":"user","content":"hi"}]}'`

---

## Config Changes Summary

| Key | Old Value | New Value | Why |
|-----|-----------|-----------|-----|
| `gateway.mode` | `"remote"` | `"local"` | CLI was trying to connect to a non-existent remote gateway; local mode spawns/manages its own |
| `models.providers.ollama.api` | `"openai-completions"` | `"openai-responses"` | `openai-responses` is required for tool calling (exec/read/write/process) |
| `models.providers.ollama.baseUrl` | `"http://127.0.0.1:11434/v1"` | `"http://127.0.0.1:11434/v1"` | OpenClaw's Ollama default is the OpenAI-compat base under `/v1` |
| `models.providers.ollama.apiKey` | (none) | `"local"` | Required placeholder for OpenClaw auth checks with local Ollama |

---

## Manual Config Patch (Alternative to Script)

If you prefer to apply manually:
```bash
# Backup
cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bak

# Apply fixes
openclaw config set gateway.mode local
openclaw config set models.providers.ollama.api openai-responses
openclaw config set models.providers.ollama.baseUrl "http://127.0.0.1:11434/v1"
openclaw config set models.providers.ollama.apiKey "local"

# Clear locks
find ~/.openclaw -name "*.lock" -delete

# Restart gateway
pkill -f "openclaw.*gateway" || true
openclaw gateway --port 18789 --force
```

---

## Why This Fix Works

1. **Port mismatch (1006 error):** With `gateway.mode = "remote"`, the CLI tried to connect to whatever URL was in `gateway.remote.url`, but nothing was listening there. Switching to `mode = "local"` makes the CLI manage its own gateway on port 18789.

2. **Agent hangs / tool loops:** On small local models, the agent can get confused by large tool inventories and loop calling tools (commonly `tts`). The stable configuration is to use `--local --thinking off`, deny `tts`, and (if needed) temporarily reduce tool surface area.

3. **Context window:** Your config's `contextWindow: 32768` actually matches Ollama's model metadata (`qwen2.context_length: 32768`). No fix needed—the 4096 you saw in `/api/ps` is the runtime-loaded context, not the max.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| "Gateway closed (1006)" | Gateway not running or wrong port | `openclaw gateway --port 18789 --force` |
| "Waiting for agent reply…" forever | Tool loop, wrong API mode, or stale locks | Use `--local --thinking off`, clear locks, ensure `models.providers.ollama.api=openai-responses`, deny `tts` (and temporarily switch `tools.profile` to `minimal` if needed) |
| "Session locked" | Stale `.jsonl.lock` file | `find ~/.openclaw -name "*.lock" -delete` |
| "Model not found" | Wrong model ID | `openclaw models list` to see available models |
| Gateway starts then dies | Port already in use | `fuser -k 18789/tcp` then retry |
| "No API key found for provider ollama" | Missing apiKey placeholder | `openclaw config set models.providers.ollama.apiKey "local"` |
