# OpenClaw 2026.2.1 WSL2 Fix — Verification Checklist

## Quick Start
```bash
chmod +x /home/manifest/projects/XmetaV/scripts/openclaw-fix.sh
/home/manifest/projects/XmetaV/scripts/openclaw-fix.sh
```

---

## Pre-flight Checks

| # | Check | Command | Expected | If Fails |
|---|-------|---------|----------|----------|
| 1 | Ollama running | `curl -s http://127.0.0.1:11434/api/tags` | JSON with models list | `ollama serve` or `snap start ollama` |
| 2 | Model available | `curl -s http://127.0.0.1:11434/api/tags \| grep qwen2.5:7b-instruct` | Match found | `ollama pull qwen2.5:7b-instruct` |
| 3 | No stale locks | `find ~/.openclaw-dev -name "*.lock"` | No output | `find ~/.openclaw-dev -name "*.lock" -delete` |
| 4 | No zombie procs | `pgrep -f 'openclaw\|gateway'` | No output | `pkill -9 -f openclaw` |

---

## Post-Fix Verification

### Step 1: Gateway Health
```bash
openclaw --profile dev health
```
**Expected:**
```
Gateway: ws://127.0.0.1:19001
Status: connected
Uptime: ...
```
**If fails:** Check `~/.openclaw-dev/gateway.log`

---

### Step 2: Models List
```bash
openclaw --profile dev models list
```
**Expected:** Table showing `ollama/qwen2.5:7b-instruct` with `contextWindow: 32768`

**If fails:** Check `models.providers.ollama.baseUrl` is `http://127.0.0.1:11434` (no `/v1` suffix)

---

### Step 3: Agent Response (THE MAIN TEST)
```bash
openclaw --profile dev agent \
  --agent dev \
  --session-id test_ok_$(date +%s) \
  --message "Say OK and print provider+model"
```
**Expected output must include:**
- The word `OK`
- `ollama/qwen2.5:7b-instruct` (or similar provider/model string)

**If hangs ("Waiting for agent reply…"):**
1. Check `~/.openclaw-dev/gateway.log` for errors
2. Verify Ollama responds: `curl http://127.0.0.1:11434/v1/chat/completions -d '{"model":"qwen2.5:7b-instruct","messages":[{"role":"user","content":"hi"}]}'`
3. Ensure `api` is `openai-chat-completions` (not `openai-completions`)

---

## Config Changes Summary

| Key | Old Value | New Value | Why |
|-----|-----------|-----------|-----|
| `gateway.mode` | `"remote"` | `"local"` | CLI was trying to connect to a non-existent remote gateway; local mode spawns/manages its own |
| `models.providers.ollama.api` | `"openai-completions"` | `"openai-completions"` | OpenClaw 2026.2.1 uses the `openai-completions` API mode for OpenAI-compatible providers (including Ollama) |
| `models.providers.ollama.baseUrl` | `"http://127.0.0.1:11434/v1"` | `"http://127.0.0.1:11434/v1"` | OpenClaw’s Ollama default is the OpenAI-compat base under `/v1` |

---

## Manual Config Patch (Alternative to Script)

If you prefer to apply manually:
```bash
# Backup
cp ~/.openclaw-dev/openclaw.json ~/.openclaw-dev/openclaw.json.bak

# Apply fixes
openclaw --profile dev config set gateway.mode local
openclaw --profile dev config set models.providers.ollama.api openai-completions
openclaw --profile dev config set models.providers.ollama.baseUrl "http://127.0.0.1:11434/v1"

# Clear locks
find ~/.openclaw-dev -name "*.lock" -delete

# Restart gateway
pkill -f "openclaw.*gateway" || true
openclaw --profile dev gateway --port 19001 --force
```

---

## Why This Fix Works

1. **Port mismatch (1006 error):** With `gateway.mode = "remote"`, the CLI tried to connect to whatever URL was in `gateway.remote.url` (port 19011), but nothing was listening there. The `--profile dev` flag defaults to port 19001. Switching to `mode = "local"` makes the CLI manage its own gateway on the correct port.

2. **Agent hangs:** The `openai-completions` API mode sends requests to `/v1/completions`, which expects a single prompt string. Ollama's chat models need `/v1/chat/completions` with a messages array. The agent was sending malformed requests.

3. **Context window:** Your config's `contextWindow: 32768` actually matches Ollama's model metadata (`qwen2.context_length: 32768`). No fix needed—the 4096 you saw in `/api/ps` is the runtime-loaded context, not the max.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| "Gateway closed (1006)" | Gateway not running or wrong port | `openclaw --profile dev gateway --port 19001 --force` |
| "Waiting for agent reply…" forever | Wrong API mode or Ollama down | Check `api: openai-chat-completions` and `curl http://127.0.0.1:11434/api/tags` |
| "Session locked" | Stale `.jsonl.lock` file | `find ~/.openclaw-dev -name "*.lock" -delete` |
| "Model not found" | Wrong model ID | `openclaw --profile dev models list` to see available models |
| Gateway starts then dies | Port already in use | `fuser -k 19001/tcp` then retry |
