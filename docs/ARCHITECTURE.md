# Architecture — XmetaV OpenClaw Command Center

This repo is a thin operational layer around OpenClaw. It does **not** replace OpenClaw; it makes OpenClaw easier to run, debug, and keep stable on this machine (WSL2/Linux).

## Components

### OpenClaw CLI
- Entry point for everything: `openclaw ...`
- Reads configuration from a **profile** directory.

### Profiles and state directories
This command center targets the `dev` profile.

- Profile name: `dev`
- State directory: `~/.openclaw-dev/`
- Config path: `~/.openclaw-dev/openclaw.json`

OpenClaw also uses per-agent directories under the state dir for sessions.

### Gateway (WebSocket)
OpenClaw uses a WebSocket gateway that the CLI connects to.

- Default dev gateway port: `19001`
- Default bind in this setup: `loopback` (127.0.0.1 only)

**Golden path for WSL2:** `gateway.mode = "local"`
- Keeps routing simple.
- Avoids confusion between dev default port (19001) vs any manually-set remote URL.
- Avoids relying on systemd services (not available here).

### Agent runtime
`openclaw agent ...` runs a single agent turn via the Gateway.

Important practical details:
- Sessions are persisted as JSONL files.
- Locks are created as `*.jsonl.lock` to protect concurrent writers.
- Stale locks (e.g., from a crash) can hang future runs.

### Model provider: Ollama (local)
OpenClaw talks to Ollama through its OpenAI-compatible API.

- Ollama base: `http://127.0.0.1:11434`
- OpenAI-compat base (this setup): `http://127.0.0.1:11434/v1`

**Golden path for agents (this repo):** `models.providers.ollama.api = "openai-responses"`

Why: `openai-responses` supports **tool calling** (function/tool schemas are sent to the model). If you use `openai-completions`, the model may “narrate” tool usage but cannot actually execute tools.

Practical note for small local models (e.g. 7B):
- If the agent hangs or loops calling tools (commonly `tts`), restrict tools with `tools.profile = "minimal"` and deny `tts`.

## Data flow

1. You run a CLI command (`openclaw --profile dev agent ...`).
2. CLI reads `~/.openclaw-dev/openclaw.json`.
3. CLI connects to the Gateway at `ws://127.0.0.1:19001`.
4. Gateway routes the turn to the agent runtime.
5. Agent runtime calls the configured model provider (Ollama) using the configured OpenAI-compatible API mode.
6. The response is written to the session JSONL and returned to CLI.

## Ports and endpoints

- Gateway WS: `ws://127.0.0.1:19001`
- Ollama HTTP: `http://127.0.0.1:11434`

## Failure modes (what this repo is designed to prevent)

- **1006 (WebSocket closed)**: usually means the CLI connected to the wrong place/port or no gateway was running.
- **Agent hangs**: often caused by wrong provider API mode (completions vs chat), or stale session locks.
- **Stale locks**: `*.jsonl.lock` left behind can block forever.

This repo provides scripts and runbooks to make these problems quick to detect and fix.
