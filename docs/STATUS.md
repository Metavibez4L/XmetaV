# Status — XmetaV / OpenClaw (dev profile)
Last verified: 2026-02-05

This file captures the **known-good** runtime settings for this machine/profile and the quickest commands to verify everything is healthy.

## Versions

- OpenClaw: `openclaw --version` (expected: 2026.2.1)
- Node: `node --version` (expected: 22.x)
- Ollama: `ollama --version` (native install recommended; snap often breaks CUDA)

## Active profile and paths

- Profile: `dev`
- State dir: `~/.openclaw-dev/`
- Config file: `~/.openclaw-dev/openclaw.json`
- Workspace: `~/.openclaw/workspace-dev`
- Gateway: `ws://127.0.0.1:19001`
- Ollama OpenAI-compat base: `http://127.0.0.1:11434/v1`

## Configured agents (this machine)

This command center is set up for **multiple isolated agents**:

- **`dev`**: general-purpose command-center agent
  - Workspace: `~/.openclaw/workspace-dev`
- **`basedintern`**: repo agent for the local checkout at `~/basedintern/based-intern`
  - Workspace: `~/basedintern/based-intern`
  - Intended use: repo analysis + code/docs changes + running tests (`npm test`)
  - Model: `ollama/kimi-k2.5:cloud` (cloud; 256k context)

Detailed agent runbooks:
- `docs/agents/dev.md`
- `docs/agents/basedintern.md`

List agents:

```bash
openclaw --profile dev agents list
```

Run the repo agent:

```bash
openclaw --profile dev agent --agent basedintern --local --thinking off \
  --message "Summarize this repo and run npm test."
```

## Known-good config (sanity checks)

These should match (do not paste tokens publicly):

```bash
openclaw --profile dev config get agents.defaults.model.primary
openclaw --profile dev config get models.providers.ollama.baseUrl
openclaw --profile dev config get models.providers.ollama.api
openclaw --profile dev config get tools
openclaw --profile dev config get messages.tts
```

Expected values (high level):
- `models.providers.ollama.baseUrl`: `http://127.0.0.1:11434/v1`
- `models.providers.ollama.api`: `openai-responses` (required for tool calling!)
- `tools.profile`: `coding` (enables read, write, exec, process tools)
- `tools.allow`: includes `exec`, `process`, `read`, `write` (and `browser` if you enable browser automation)
- `tools.deny`: includes `tts`
- `messages.tts.auto`: `off`
- `messages.tts.edge.enabled`: `false`
- `messages.tts.modelOverrides.enabled`: `false`

## Standard way to run the agent (stable)

Use embedded mode + disable thinking for “simple chat” reliability on small local models:

```bash
openclaw --profile dev agent \
  --agent dev \
  --local \
  --thinking off \
  --session-id smoke_$(date +%s) \
  --message "What is 2+2?"
```

## Cloud model: `kimi-k2.5:cloud` (256k context)

This environment is configured with the Ollama cloud model:

- Model id: `kimi-k2.5:cloud`
- Expected context window: `262144` (256k)
- Auth: via `ollama signin` (no API key required for local `http://127.0.0.1:11434` calls)

Verify config:

```bash
openclaw --profile dev config get agents.list.1.model.primary
openclaw --profile dev config get models.providers.ollama.models
```

## Known behavior: Ollama Cloud “session usage limit” (HTTP 429)

If you exceed your Ollama Cloud quota/limits, calls to a cloud model can fail with:

```json
{"StatusCode":429,"Status":"429 Too Many Requests","error":"you've reached your session usage limit, please wait or upgrade to continue"}
```

Reproduce / diagnose (direct to local Ollama):

```bash
curl -i -sS http://127.0.0.1:11434/api/chat \
  -d '{"model":"kimi-k2.5:cloud","messages":[{"role":"user","content":"OK"}],"stream":false}'
```

Fix:
- Wait for the limit to reset, or upgrade your Ollama plan.

## Health checks

```bash
# Gateway should be reachable
openclaw --profile dev health

# Ollama should list models
curl -s http://127.0.0.1:11434/api/tags

# GPU should be in use when model is loaded (size_vram > 0)
curl -s http://127.0.0.1:11434/api/ps
```

## End-to-end smoke test (repo agent)

This is the “we can ship” verification for `basedintern`:

```bash
openclaw --profile dev agent --agent basedintern --local --thinking off --session-id bi_smoke_$(date +%s) --message "\
In /home/manifest/basedintern/based-intern, use exec to run:\n\
1) git pull --ff-only\n\
2) npx tsc --noEmit\n\
3) npm test\n\
Paste raw stdout/stderr and exit codes."
```

## If it hangs (fast recovery)

```bash
# Clear stale session locks
find ~/.openclaw-dev -name "*.lock" -type f -delete

# Stop anything stuck
pkill -9 -f "openclaw.*gateway" 2>/dev/null || true
pkill -9 -f "node.*openclaw" 2>/dev/null || true
fuser -k 19001/tcp 2>/dev/null || true

# Re-apply the golden-path fix
./scripts/openclaw-fix.sh
```

## Tool Calling (System Automation)

With `tools.profile=coding` and `api=openai-responses`, the agent can:
- Execute shell commands via `exec` tool
- Read/write files via `read`/`write` tools
- Manage background processes via `process` tool

Test:
```bash
openclaw --profile dev agent --agent dev --local --thinking off \
  --message "Call the exec tool with command: whoami"
```

Notes:
- If you see loops calling tools (especially `tts`), deny `tts`.
- For channels (Telegram/Slack/etc), you may need gateway mode rather than `--local`.
- The `openai-responses` API mode is required for tool schemas to be passed to the model.

## Browser Automation (OpenClaw-managed browser)

This setup supports OpenClaw’s dedicated browser automation via the `openclaw browser ...` CLI (open tabs, snapshot, click/type).

### Prereqs (WSL2/Linux)

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

2) Install a Chromium binary via Playwright (no sudo):

```bash
npx playwright install chromium
```

3) Point OpenClaw at that Chromium (example path shown; adjust if your version differs):

```bash
openclaw --profile dev config set browser.enabled true
openclaw --profile dev config set browser.defaultProfile openclaw
openclaw --profile dev config set browser.executablePath "$HOME/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome"

# Ensure browser tool is allowed (if using allowlist)
openclaw --profile dev config set tools.allow '[\"exec\",\"process\",\"read\",\"write\",\"browser\"]'
```

### Smoke test (CLI)

```bash
# Start gateway (if not already running)
./scripts/start-gateway.sh

openclaw --profile dev browser start
openclaw --profile dev browser open https://example.com
openclaw --profile dev browser snapshot
```

### Known limitation (small local models)

With smaller local models (e.g. `qwen2.5:7b-instruct`), the agent may sometimes ignore the `browser` tool and fall back to shell-based approaches.

Workarounds:
- Use the deterministic `openclaw browser ...` CLI for browser automation.
- Or use `exec` + `curl -sL ...` for “web fetch + summarize” workflows.

