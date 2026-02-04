# Troubleshooting — OpenClaw Command Center (WSL2/Linux)

This guide targets OpenClaw 2026.2.1 on WSL2 without systemd.

## Golden-path baseline

- Profile: `dev`
- Gateway: local, loopback, port 19001
- Ollama: `http://127.0.0.1:11434` (native install, NOT snap)
- Provider API: `openai-responses` (required for tool calling)
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

### Cause 3: Wrong API mode (tools don’t execute / agent “narrates”)
Use `openai-responses` for tool calling:
```bash
openclaw --profile dev config set models.providers.ollama.api openai-responses
openclaw --profile dev config set models.providers.ollama.baseUrl http://127.0.0.1:11434/v1
```

If you only want chat (no tools), `openai-completions` can work, but tools won’t be callable.

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

## Problem: Browser automation fails to start (WSL2/Linux)

### Symptoms
- `openclaw --profile dev browser start` fails with:
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
openclaw --profile dev config set browser.enabled true
openclaw --profile dev config set browser.defaultProfile openclaw
openclaw --profile dev config set browser.executablePath "$HOME/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome"
```

4) Restart gateway and retest:

```bash
pkill -9 -f "openclaw.*gateway" 2>/dev/null || true
./scripts/start-gateway.sh
openclaw --profile dev browser start
openclaw --profile dev browser open https://example.com
openclaw --profile dev browser snapshot
```

## Problem: Agent ignores browser tool (small local models)

### Symptoms
- You ask an agent to “use the browser tool”, but it uses `exec` + `curl`, or tries shell screenshot tools (`scrot`, `gnome-screenshot`, etc.).

### Cause
Smaller local models (notably `qwen2.5:7b-instruct`) can be inconsistent at reliably selecting complex tools like `browser`.

### Fix / Workarounds
- Use deterministic CLI browser automation instead:
  - `openclaw --profile dev browser open ...`
  - `openclaw --profile dev browser snapshot`
  - `openclaw --profile dev browser click <ref>`
- Or use `exec` + `curl -sL ...` for “web fetch + summarize” tasks.
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
   openclaw --profile dev config set models.providers.ollama.api "openai-responses"
   ```
   Note: You may need to set the full ollama provider config:
   ```bash
   openclaw --profile dev config set models.providers.ollama '{"baseUrl":"http://127.0.0.1:11434/v1","apiKey":"ollama-local","api":"openai-responses","models":[{"id":"qwen2.5:7b-instruct","name":"qwen2.5:7b-instruct","reasoning":false,"input":["text"],"contextWindow":32768,"maxTokens":4096}]}'
   ```

2. Use `coding` profile to enable tools:
   ```bash
   openclaw --profile dev config set tools.profile coding
   ```

### Verify fix
```bash
# Check JSON output for tool entries
openclaw --profile dev agent --agent dev --local --thinking off --json \
  --message "Use exec to run: whoami" 2>&1 | grep -o '"entries": \[[^]]*\]'
# Should show entries like: "entries": [{"name":"read"...}]

# Test actual execution
timeout 30 openclaw --profile dev agent --agent dev --local --thinking off \
  --message "Call the exec tool with command: date +%Y-%m-%d"
# Should return today's actual date (Feb 2026)
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
   openclaw --profile dev config set messages.tts.auto off
   openclaw --profile dev config set messages.tts.edge.enabled false
   openclaw --profile dev config set messages.tts.modelOverrides.enabled false
   ```

2. Block TTS tool from being presented to the model:
   ```bash
   openclaw --profile dev config set tools.deny '["tts"]'
   ```

3. Use coding profile for tool execution (or minimal if no tools needed):
   ```bash
   openclaw --profile dev config set tools.profile coding  # For system automation
   # OR
   openclaw --profile dev config set tools.profile minimal  # For chat-only
   ```

4. Use `--thinking off` flag for simple prompts:
   ```bash
   openclaw --profile dev agent --agent dev --local --thinking off --message "Hello"
   ```

### Verify fix
```bash
timeout 30 openclaw --profile dev agent --agent dev --local --session-id test_$(date +%s) --thinking off --message "What is 2+2?"
# Expected: "4" or "The answer is 4" in ~5 seconds
```

---

## Collecting logs

- Gateway logs: `~/.openclaw-dev/gateway.log`
- Main logs: `/tmp/openclaw/openclaw-*.log`
- Quick health + agent test:
  ```bash
  ./scripts/health-check.sh
  ```
