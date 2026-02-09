# Troubleshooting — OpenClaw Command Center (WSL2/Linux)

This guide targets OpenClaw 2026.2.1 on WSL2 without systemd.

## Golden-path baseline

- Config: default (`~/.openclaw/openclaw.json`)
- Gateway: local, loopback, port 18789
- Ollama: `http://127.0.0.1:11434` (native install, NOT snap)
- Provider API: `openai-responses` (required for tool calling)
- Provider API key: `"local"` (required placeholder for OpenClaw auth checks)
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

## Problem: "gateway closed (1006)" / tries ws://127.0.0.1:18789

### Symptoms
- `openclaw` connects to `ws://127.0.0.1:18789` and immediately fails.
- Or the CLI tries an unexpected port (e.g. remote url), and fails.

### Causes
- No gateway is running.
- Port conflict.
- Config mismatch between `gateway.mode` and `gateway.remote.url`.

### Fix
1. Make gateway local:
   ```bash
   openclaw config set gateway.mode local
   ```
2. Start/restart gateway:
   ```bash
   ./scripts/start-gateway.sh
   ```
3. Check health:
   ```bash
   openclaw health
   ```

## Problem: Agent hangs ("Waiting for agent reply…")

### Cause 1: Gateway websocket connection issue
The gateway websocket can hang on WSL2. **Use `--local` mode** to bypass:
```bash
openclaw agent --agent main --local --message "Hi"
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

### Cause 3: Wrong API mode (tools don't execute / agent "narrates")
Use `openai-responses` for tool calling:
```bash
openclaw config set models.providers.ollama.api openai-responses
openclaw config set models.providers.ollama.baseUrl http://127.0.0.1:11434/v1
```

If you only want chat (no tools), `openai-completions` can work, but tools won't be callable.

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
find ~/.openclaw -name "*.lock" -type f -delete
```

Then rerun:
```bash
openclaw agent --agent main --session-id fresh_ok --message "Say OK"
```

## Problem: Port already in use

### Symptoms
- Gateway fails to start.
- Log shows bind error.

### Fix
```bash
fuser -k 18789/tcp
./scripts/start-gateway.sh
```

## Problem: Browser automation fails to start (WSL2/Linux)

### Symptoms
- `openclaw browser start` fails with:
  - `No supported browser found`, or
  - `error while loading shared libraries: libnspr4.so: cannot open shared object file`

### Cause
Chromium/Chrome system dependencies are missing on the Linux environment (common on WSL2), or no Chromium binary is installed.

### Fix
1) Install system dependencies (requires `sudo`):

```bash
sudo apt-get update && sudo apt-get install -y \
  ca-certificates fonts-liberation wget xdg-utils \
  libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 \
  libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libgbm1 libglib2.0-0 \
  libgtk-3-0 libpango-1.0-0 libudev1 libvulkan1 \
  libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 \
  libxkbcommon0 libasound2
```

2) Install Chromium via Playwright (no sudo):

```bash
npx playwright install chromium
```

3) Configure OpenClaw to use that Chromium:

```bash
openclaw config set browser.enabled true
openclaw config set browser.defaultProfile openclaw
openclaw config set browser.executablePath "$HOME/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome"
```

4) Restart gateway and retest:

```bash
pkill -9 -f "openclaw.*gateway" 2>/dev/null || true
./scripts/start-gateway.sh
openclaw browser start
openclaw browser open https://example.com
openclaw browser snapshot
```

## Problem: Agent ignores browser tool (small local models)

### Symptoms
- You ask an agent to "use the browser tool", but it uses `exec` + `curl`, or tries shell screenshot tools (`scrot`, `gnome-screenshot`, etc.).

### Cause
Smaller local models (notably `qwen2.5:7b-instruct`) can be inconsistent at reliably selecting complex tools like `browser`.

### Fix / Workarounds
- Use deterministic CLI browser automation instead:
  - `openclaw browser open ...`
  - `openclaw browser snapshot`
  - `openclaw browser click <ref>`
- Or use `exec` + `curl -sL ...` for "web fetch + summarize" tasks.
- If you need the agent itself to drive the browser, consider a larger model with better tool-selection behavior.

## Problem: Ollama reachable but model not found

### Fix
```bash
ollama pull qwen2.5:7b-instruct
```

## Problem: Tools not actually executing (model narrates instead)

### Symptoms
- Agent describes what it would do but doesn't actually execute
- Model says it ran a command but results are hallucinated (wrong date, wrong output)
- JSON output shows `tools.schemaChars: 0` and `tools.entries: []`

### Cause
The API mode `openai-completions` doesn't support function calling. Tool schemas aren't passed to the model.

### Fix
1. Switch to `openai-responses` API mode (supports tool calling):
   ```bash
   openclaw config set models.providers.ollama.api "openai-responses"
   ```

2. Ensure the Ollama API key placeholder is set:
   ```bash
   openclaw config set models.providers.ollama.apiKey "local"
   ```

### Verify fix
```bash
# Check JSON output for tool entries
openclaw agent --agent main --local --thinking off --json \
  --message "Use exec to run: whoami" 2>&1 | grep -o '"entries": \[[^]]*\]'
# Should show entries like: "entries": [{"name":"read"...}]

# Test actual execution
timeout 30 openclaw agent --agent main --local --thinking off \
  --message "Call the exec tool with command: date +%Y-%m-%d"
# Should return today's actual date (Feb 2026)
```

## Problem: Ollama Cloud model returns HTTP 429 ("session usage limit")

### Symptoms
- Any request to a cloud model (e.g. `kimi-k2.5:cloud`) fails with:
  - `HTTP 429: you've reached your session usage limit, please wait or upgrade to continue`
- The failure happens even for a tiny prompt like "OK".

### Cause
Ollama Cloud enforces plan-based usage limits for cloud models. When the account/session quota is exhausted, the local Ollama daemon returns HTTP 429.

### Diagnose (capture raw response)
Direct Ollama endpoint:

```bash
curl -i -sS http://127.0.0.1:11434/api/chat \
  -d '{"model":"kimi-k2.5:cloud","messages":[{"role":"user","content":"OK"}],"stream":false}' | sed -n '1,80p'
```

OpenAI-compatible endpoint:

```bash
curl -i -sS http://127.0.0.1:11434/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"kimi-k2.5:cloud","messages":[{"role":"user","content":"OK"}]}' | sed -n '1,80p'
```

### Fix
- Wait for the quota window to reset, **or** upgrade your Ollama plan.
- Confirm you are signed in (cloud models require auth):
  ```bash
  ollama signin
  ```

## Problem: Agent loops calling TTS tool repeatedly

### Symptoms
- Agent hangs with no output
- Logs show repeated `tool=tts` calls
- Output shows garbage like `ronics` or `{"name": "tts", ...}`

### Cause
The qwen2.5:7b-instruct model gets confused by OpenClaw's 23+ tools and repeatedly calls TTS when asked to "say" or "greet".

### Fix (applied to this setup)
1. Disable TTS completely:
   ```bash
   openclaw config set messages.tts.auto off
   openclaw config set messages.tts.edge.enabled false
   openclaw config set messages.tts.modelOverrides.enabled false
   ```

2. Block TTS tool from being presented to the model:
   ```bash
   openclaw config set tools.deny '["tts"]'
   ```

3. Use coding profile for tool execution (or minimal if no tools needed):
   ```bash
   openclaw config set tools.profile coding  # For system automation
   # OR
   openclaw config set tools.profile minimal  # For chat-only
   ```

4. Use `--thinking off` flag for simple prompts:
   ```bash
   openclaw agent --agent main --local --thinking off --message "Hello"
   ```

### Verify fix
```bash
timeout 30 openclaw agent --agent main --local --session-id test_$(date +%s) --thinking off --message "What is 2+2?"
# Expected: "4" or "The answer is 4" in ~5 seconds
```

---

## Collecting logs

- Gateway logs: `~/.openclaw/gateway.log`
- Main logs: `/tmp/openclaw/openclaw-*.log`
- Quick health + agent test:
  ```bash
  ./scripts/health-check.sh
  ```
