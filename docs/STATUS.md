# Status — XmetaV / OpenClaw Command Center
**Last verified:** 2026-02-14  
**System:** metavibez4L (WSL2)  
**XmetaV Version:** v17 (Soul Agent + ERC-8004 Metadata + Arena Soul Office)

This file captures the **known-good** runtime settings for this machine and the quickest commands to verify everything is healthy.

---

## Quick Health Check

```bash
# One-command system fix and verification
./scripts/openclaw-fix.sh

# Check all components
./scripts/health-check.sh

# Verify OpenClaw
openclaw health
openclaw --version  # Expected: 2026.2.1

# Supabase tables sanity (service role / admin only)
# - agent_memory is the persistent memory bus used by the bridge
# - shared memory entries use agent_id = "_shared"
#
# Example SQL in Supabase editor:
#   select agent_id, kind, created_at from agent_memory order by created_at desc limit 10;
#   select count(*) from agent_memory;
```

---

## Versions

- OpenClaw: `openclaw --version` (expected: 2026.2.1)
- Node: `node --version` (expected: 22.x)
- Ollama: `ollama --version` (native install recommended; snap often breaks CUDA)

## Active profile and paths

- Profile: (none; using default `~/.openclaw/` config)
- State dir: `~/.openclaw/`
- Config file: `~/.openclaw/openclaw.json`
- Workspace(s): per-agent (`openclaw agents list`)
- Gateway: `ws://127.0.0.1:18789` (`gateway.mode: local` — agents use `--local` flag, gateway is fallback for channels)
- Ollama OpenAI-compat base: `http://127.0.0.1:11434/v1`

## Configured agents (this machine)

This command center is set up for **multiple isolated agents**, all powered by **Kimi K2.5** (256k context):

| Agent | Model | Workspace | Tools | Role |
|-------|-------|-----------|-------|------|
| `main` * | `kimi-k2.5:cloud` | `~/.openclaw/workspace` | **full** | **Orchestrator** — agent factory + swarm |
| `sentinel` | `kimi-k2.5:cloud` | `/home/manifest/sentinel` | coding | **Fleet Ops** — lifecycle, spawn coordination, health |
| `soul` | `kimi-k2.5:cloud` | `~/.openclaw/agents/soul` | coding | **Memory Orchestrator** — context curation, dreams, associations |
| `basedintern` | `kimi-k2.5:cloud` | `/home/manifest/basedintern` | coding | TypeScript/Node.js repo agent |
| `basedintern_web` | `kimi-k2.5:cloud` | `/home/manifest/basedintern` | full | Same repo — browser/web only |
| `akua` | `kimi-k2.5:cloud` | `/home/manifest/akua` | coding | Solidity/Hardhat repo agent |
| `akua_web` | `kimi-k2.5:cloud` | `/home/manifest/akua` | full | Same repo — browser/web only |
| `briefing` | `kimi-k2.5:cloud` | `/home/manifest/briefing` | coding | **Context Curator** — continuity, health, memory |
| `oracle` | `kimi-k2.5:cloud` | `/home/manifest/oracle` | coding | **On-Chain Intel** — gas, prices, chain, sentiment |
| `alchemist` | `kimi-k2.5:cloud` | `/home/manifest/alchemist` | coding | **Tokenomics** — supply, emissions, staking, liquidity |
| `web3dev` | `kimi-k2.5:cloud` | `/home/manifest/web3dev` | coding | **Blockchain Dev** — compile, test, audit, deploy contracts |
| _(dynamic)_ | `kimi-k2.5:cloud` | _(per-agent)_ | _(varies)_ | Created on-demand by Agent Factory |

\* = default agent

Detailed agent runbooks (index: [`docs/agents/README.md`](agents/README.md)):
- `docs/agents/main.md`
- `docs/agents/sentinel.md`
- `docs/agents/briefing.md`
- `docs/agents/oracle.md`
- `docs/agents/alchemist.md`
- `docs/agents/web3dev.md`
- `docs/agents/basedintern.md`
- `docs/agents/akua.md`
- `docs/agents/dynamic.md`

List agents:

```bash
openclaw agents list
# or
./scripts/manage-agents.sh list
```

Run the repo agent:

```bash
openclaw agent --agent basedintern --local --thinking off \
  --message "Summarize this repo and run npm test."
```

## Orchestrator capabilities (main agent)

The `main` agent has two power skills installed:

### Agent Factory

Create agents, scaffold apps, manage the fleet, and create GitHub repos:

```bash
# Create a new agent
./scripts/create-agent.sh --id researcher --template research --web

# Create agent + GitHub repo (auto-creates + pushes)
./scripts/create-agent.sh --id researcher --template research --web --github --private

# Scaffold an app
./scripts/build-app.sh --type node --workspace /home/manifest/researcher

# Scaffold an app + push to GitHub
./scripts/build-app.sh --type node --workspace /home/manifest/researcher --github

# Fleet status
./scripts/manage-agents.sh list
./scripts/manage-agents.sh status
```

### Swarm (multi-agent orchestration)

Dispatch tasks across multiple agents with three execution modes:

| Mode | Command | Description |
|------|---------|-------------|
| Parallel | `./scripts/swarm.sh --parallel` | Run tasks simultaneously across agents |
| Pipeline | `./scripts/swarm.sh --pipeline` | Chain agents, output flows to next step |
| Collaborative | `./scripts/swarm.sh --collab` | Same task to multiple agents, then synthesize |

```bash
# Parallel health check across all repos
./scripts/swarm.sh --parallel \
  basedintern "Run /repo-health" \
  akua "Run /repo-health"

# Pipeline: research then implement
./scripts/swarm.sh --pipeline \
  main "Research best practices for X" \
  basedintern "Apply the findings"

# Collaborative code review
./scripts/swarm.sh --collab \
  "Review the last commit for bugs" \
  basedintern akua

# Pre-built templates
./scripts/swarm.sh templates/swarms/health-all.json

# Check past runs and results
./scripts/swarm.sh --status
./scripts/swarm.sh --results <run-id>
```

Results stored in: `~/.openclaw/swarm/<run-id>/`

Verify skills are installed:

```bash
ls ~/.openclaw/workspace/skills/
# Expected: agent-factory/ swarm/ (plus any others)
```

Full reference: `docs/SWARM.md`

## Known-good config (sanity checks)

These should match (do not paste tokens publicly):

```bash
openclaw config get agents.list
openclaw config get models.providers.ollama.baseUrl
openclaw config get models.providers.ollama.api
openclaw config get models.providers.ollama.apiKey
```

Expected values (high level):
- `models.providers.ollama.baseUrl`: `http://127.0.0.1:11434/v1`
- `models.providers.ollama.api`: `openai-responses` (required for tool calling!)
- `models.providers.ollama.apiKey`: set to a non-secret placeholder (e.g. `"local"`) to satisfy OpenClaw auth checks for local Ollama

Quick tool-calling sanity test:

```bash
openclaw agent --agent main --local --thinking off \
  --session-id tool_test_$(date +%s) \
  --message "Call exec: echo TOOL_OK"
# Expected: agent calls exec tool and returns TOOL_OK

## Persistent memory bus (Supabase)

This environment supports a Supabase-backed memory bus that complements OpenClaw session history:

- Table: `agent_memory`
- Scope: per-agent entries plus shared entries (`agent_id = "_shared"`)
- Bridge behavior: injects recent memory into dispatch prompts; writes an `outcome`/`error` entry after completion

Migration file (dashboard): `dashboard/scripts/setup-db-agent-memory.sql`
```

## Standard way to run the agent (stable)

Use `--local` + `--thinking off` for reliable agent calls (bypasses gateway websocket, runs embedded):

```bash
openclaw agent \
  --agent main \
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
openclaw config get agents.list
openclaw config get models.providers.ollama.models
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
- **Temporary fallback**: route non-critical agents (sentinel, briefing) to local `qwen2.5:7b-instruct` while keeping main on cloud. Edit the agent's `models.json` to swap the model.

## Health checks

```bash
# Gateway should be reachable
openclaw health

# Ollama should list models
curl -s http://127.0.0.1:11434/api/tags

# GPU should be in use when model is loaded (size_vram > 0)
curl -s http://127.0.0.1:11434/api/ps
```

## End-to-end smoke test (repo agent)

This is the “we can ship” verification for `basedintern`:

```bash
openclaw agent --agent basedintern --local --thinking off --session-id bi_smoke_$(date +%s) --message "\
In /home/manifest/basedintern/based-intern, use exec to run:\n\
1) git pull --ff-only\n\
2) npx tsc --noEmit\n\
3) npm test\n\
Paste raw stdout/stderr and exit codes."
```

## If it hangs (fast recovery)

```bash
# Clear stale session locks
find ~/.openclaw -name "*.lock" -type f -delete

# Stop anything stuck
pkill -9 -f "openclaw.*gateway" 2>/dev/null || true
pkill -9 -f "node.*openclaw" 2>/dev/null || true
fuser -k 18789/tcp 2>/dev/null || true

# Re-apply the golden-path fix
./scripts/openclaw-fix.sh
```

## Tool Calling (System Automation)

With `tools.profile=full` (main) or `coding` (repo agents) and `api=openai-responses`, the agent can:
- Execute shell commands via `exec` tool
- Read/write files via `read`/`write` tools
- Manage background processes via `process` tool
- Browse the web via `browser` tool (full profile)
- Fetch web pages via `web_fetch` / `web_search` tools (full profile)

Test:
```bash
openclaw agent --agent main --local --thinking off \
  --message "Call the exec tool with command: whoami"
```

Notes:
- If you see loops calling tools (especially `tts`), deny `tts`.
- For channels (Telegram/Slack/etc), you may need gateway mode rather than `--local`.
- The `openai-responses` API mode is required for tool schemas to be passed to the model.

## Control Plane Dashboard

The XmetaV Control Plane Dashboard is a cyberpunk-themed Next.js 16 web application providing remote agent management, swarm orchestration, and fleet controls via a browser.

### Dashboard status

| Component | Status | Notes |
|-----------|--------|-------|
| Dashboard (Next.js) | Active | `cd dashboard && npm run dev` (localhost:3000) |
| Bridge Daemon | Active when running | `cd dashboard/bridge && npm start` |
| Supabase | Active | Project: `ptlneqcjsnrxxruutsxm` |

### Supabase tables

| Table | Purpose | RLS |
|-------|---------|-----|
| `agent_commands` | Command bus (dashboard -> bridge) | Authenticated: SELECT, INSERT |
| `agent_responses` | Response bus (bridge -> dashboard) | Authenticated: SELECT, INSERT |
| `agent_sessions` | Agent session tracking | Authenticated: SELECT, INSERT |
| `agent_controls` | Agent enable/disable state | Authenticated: SELECT, INSERT, UPDATE |
| `swarm_runs` | Swarm run metadata and status | Authenticated: SELECT, INSERT, UPDATE |
| `swarm_tasks` | Per-task status and output | Authenticated: SELECT, INSERT, UPDATE |
| `x402_payments` | x402 payment transaction log | Authenticated: SELECT, INSERT |
| `intent_sessions` | Intent resolution sessions | Authenticated: SELECT, INSERT |

All tables have Realtime enabled for live updates.

View: `x402_daily_spend` — aggregates daily payment totals from `x402_payments`.

### Dashboard pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Command Center | Bridge health, fleet summary, recent commands, quick command |
| `/agent` | Agent Chat | Streaming chat with agent selector |
| `/swarms` | Swarms | Create (templates/custom), active runs (live), history (filterable) |
| `/fleet` | Fleet | Agent table with enable/disable toggles |
| `/payments` | Payments | x402 wallet status, daily spend, payment history, gated endpoints |
| `/identity` | Identity | ERC-8004 on-chain agent NFT, reputation, and capabilities |
| `/token` | $XMETAV | Token balance, tier table, discount info, holder benefits |
| `/arena` | XMETAV HQ | Isometric office visualization with live agent activity (PixiJS) |
| `/logs` | Live Logs | Real-time log streaming with severity/agent filters and search |

### Dashboard health checks

```bash
# Verify dashboard is running
curl -s http://localhost:3000 | head -1

# Verify bridge daemon is running
curl -s http://localhost:3000/api/bridge/status

# Verify Supabase connection
cd dashboard && npx tsx -e "
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  sb.from('agent_commands').select('count').then(r => console.log('OK:', r));
"
```

### Dashboard environment

Required environment variables (in `dashboard/.env.local`):

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public, used in browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (**server-side only**, never expose to browser) |
| `OPENAI_API_KEY` | OpenAI API key for Whisper STT + TTS (**server-side only**) |
| `XMETAV_TOKEN_ADDRESS` | Deployed $XMETAV ERC-20 contract address |

### Swarm runs (dashboard)

The dashboard can create, monitor, and cancel swarm runs:

```bash
# Swarm runs are stored in Supabase swarm_runs table
# The bridge daemon picks up pending runs and orchestrates execution
# Live output is streamed via Supabase Realtime to the browser
```

Swarm modes: **parallel**, **pipeline**, **collaborative**

Templates are loaded from `XmetaV/templates/swarms/*.json`.

---

## $XMETAV Token (v11)

ERC-20 token on Base Mainnet with tiered discounts for x402 endpoints.

| Component | Status | Notes |
|-----------|--------|-------|
| Contract | Deployed | `0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54` on Base Mainnet |
| Token API | Active | `/api/token?wallet=0x...` returns balance, tier, discount |
| Dashboard Page | Active | `/token` — balance, tier table, holder benefits |
| x402 Integration | Active | Tier middleware checks `balanceOf()` on-chain |
| Identity Integration | Active | Token balance + tier badge on `/identity` page |
| Payments Integration | Active | Token tier card on `/payments` page |

### Tier Table

| Tier | Min Balance | Discount | Daily Limit |
|------|-------------|----------|-------------|
| None | 0 | 0% | $5 |
| Bronze | 1,000 | 10% | $25 |
| Silver | 10,000 | 20% | $100 |
| Gold | 100,000 | 35% | $500 |
| Diamond | 1,000,000 | 50% | $2,000 |

### Environment

| Variable | Location | Description |
|----------|----------|-------------|
| `XMETAV_TOKEN_ADDRESS` | `dashboard/.env.local` | Deployed contract address |
| `XMETAV_TOKEN_ADDRESS` | `x402-server/.env` | Same for tier checks |

Full reference: `capabilities/xmetav-token.md`

---

## Voice Commands (v10 — optimized)

XmetaV v10 adds voice interaction with streaming TTS, push-to-talk, wake word detection, and continuous conversation.

| Component | Status | Notes |
|-----------|--------|-------|
| Voice API (streaming) | Active | `/api/voice/transcribe` (STT) + `/api/voice/synthesize` (streaming TTS) |
| React Hook | Active | `useVoice()` — streaming playback, PTT, analyser node, settings |
| Wake Word | Active | `useWakeWord()` — "Hey XmetaV" via Web Speech API (Chrome/Edge) |
| Waveform Visualizer | Active | `VoiceWaveform` — canvas-based frequency bars during record/playback |
| Settings Panel | Active | `VoiceSettings` — voice, model, speed, PTT, wake, continuous toggles |
| Dashboard UI | Active | Voice toggle + gear icon in Agent Chat header |
| x402 Gating | Active | Endpoints payment-gated: $0.005 (transcribe), $0.01 (synthesize) |

### Usage

**Dashboard:** Click the voice toggle in Agent Chat header. Use the gear icon for settings.
- **Click-to-talk**: Click mic to record, click again to send
- **Push-to-talk**: Hold SPACE to record, release to send (enable in settings)
- **Wake word**: Say "Hey XmetaV" hands-free (enable in settings, Chrome/Edge)
- **Continuous**: Auto-listen after agent speaks (enable in settings)
- **Streaming TTS**: Audio starts playing within ~200ms via MediaSource API

**CLI:**
```bash
cd dashboard
npx tsx scripts/voice-cli.ts
```

### Environment variables

| Variable | Location | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Dashboard `.env.local` | Required for Whisper + TTS |
| `X402_BUDGET_LIMIT` | (in voice mode) | Must be >= $0.01 for TTS payments |

---

## XMETAV HQ — Isometric Office Arena (v12, fixed v13, reorganized v14)

Full isometric office visualization rendered with PixiJS at `/arena`, driven by live Supabase Realtime events.

| Component | Status | Notes |
|-----------|--------|-------|
| Arena Page | Active | `/arena` — standalone fullscreen PixiJS canvas |
| PixiJS (v8.16.0) | Installed | WebGL 2D rendering with BlurFilter, dynamic loading |
| Isometric Renderer | Active | `renderer/iso.ts` — 2:1 projection, 10x10 grid, tile/cube/wall primitives |
| Office Background | Active | `renderer/background.ts` — 4 distinct floor zones, glass walls, room labels, particles |
| Office Furniture | Active | `renderer/office.ts` — boss desk, meeting table, projector, 8 workstation desks |
| Agent Avatars | Active | `renderer/avatars.ts` — glowing orbs with ghost silhouettes (idle/busy/offline) |
| Effects | Active | `renderer/effects.ts` — command pulses, streaming particles, dispatch beams, bursts, glitches |
| Supabase Events | Active | `useArenaEvents.ts` — subscribes to sessions, commands, responses, controls + 10s periodic sync |
| HUD Overlay | Active | DOM: title, system status, agent legend, floating labels, TEST MEETING button |
| Meeting Sync | **Fixed (v13)** | State replay after PixiJS init resolves race condition; periodic sync catches dropped events |

### Office layout (v14 — reorganized)

Grid expanded from 10x8 to 10x10 with four distinct zones:

- **COMMAND room** (top, rows 0–2, walled): Main agent desk with 3 holo screens + Operator orb floating above
- **MEETING area** (center, rows 3–5): Hexagonal glass table with holographic projector, 10 chairs for all agents
- **INTEL room** (bottom-left, rows 6–9, glass walls): Briefing, Oracle, Alchemist — with space for 2 future agents. Blue-tinted floor and `#38bdf8` glass partition walls.
- **DEV FLOOR** (bottom-right, rows 6–9, open, no walls): Web3Dev, Akua, Akua_web, Basedintern, Basedintern_web at open desks. Green-tinted grid lines.

### Meeting visualization (v13+)

When 2+ agents are "busy," avatars smoothly interpolate from their desks to assigned seats around the hexagonal meeting table. The holographic projector activates, connection lines draw between participants, and a "MEETING IN SESSION" HUD indicator appears.

| Seat | Agent | Angle |
|------|-------|-------|
| Top | main | 270 |
| Upper-right | operator | 330 |
| Upper-left | briefing | 210 |
| Lower-left | oracle | 150 |
| Bottom center | alchemist | 180 |
| Left | akua | 240 |
| Lower-right | basedintern | 30 |
| Bottom-left | akua_web | 120 |
| Bottom-right | basedintern_web | 60 |
| Right center | web3dev | 0 |

**TEST MEETING** button in the HUD (top-right) forces a meeting for visual verification.

### Visual effects (real-time)

| Effect | Trigger | Description |
|--------|---------|-------------|
| Command Pulse | New command | Golden energy travels boss desk -> partition -> target desk |
| Streaming Particles | Agent busy | Code-fragment particles rise from desk area |
| Dispatch Beam | Inter-agent dispatch | Neon beam routed through meeting table center |
| Completion Burst | Command success | Green ring expands from desk |
| Failure Glitch | Command failure | Red glitch blocks flicker around desk, screen turns red |
| Screen Animation | Agent state change | Scrolling code lines (busy), red flicker (fail), dim (offline) |
| Meeting Hologram | 2+ agents busy | Pulsing ring, vertical beam, floating discs, agent connection lines |

---

## Streaming Optimization (v12)

End-to-end optimization of the agent chat streaming pipeline for lower latency and smoother rendering.

| Component | Change | Impact |
|-----------|--------|--------|
| `streamer.ts` | Chunk size 800→400, flush 500ms→200ms, first flush 50ms | Faster time-to-first-byte |
| `streamer.ts` | Non-blocking flush guards, chained setTimeout | No lost data under load |
| `useRealtimeMessages` | Ref-based string accumulator (no array/join) | Eliminates GC pressure |
| `useRealtimeMessages` | 80ms throttle for batched renders | Smoother streaming UI |
| `AgentChat.tsx` | StreamingBubble component | Independent render from message history |

---

## Agent Skills (v12)

Three new bash skills installed for the main agent:

| Skill | Location | Description |
|-------|----------|-------------|
| `dispatch` | `~/.openclaw/workspace/skills/dispatch/` | Inter-agent communication via Supabase PostgREST |
| `supabase` | `~/.openclaw/workspace/skills/supabase/` | Direct database access with service role key |
| `web` | `~/.openclaw/workspace/skills/web/` | HTTP operations (GET/POST) with HTML stripping |

Main agent `tools.profile` set to `full` with 11 exec allowlist entries for unrestricted shell access.

### Dispatch skill fix (v13)

- Message encoding now pipes through `python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))"` for safe JSON encoding of emojis, newlines, and special characters
- `status`, `result`, `list` subcommands hardened with `try/except` JSON parsing, `isinstance()` type checks, `.get()` dictionary access

---

## Bug Fixes and Hardening (v13)

### Arena sync race condition

**Problem:** Supabase events arrived before PixiJS finished async initialization. `nodesApiRef.current` was `null` so `startMeeting()` was silently skipped via optional chaining. After PixiJS loaded, nothing re-checked the state.

**Fix:** After PixiJS init completes and API refs are set, replay all buffered agent states from `nodeStatesRef` into the PixiJS layer, then call `checkMeeting()`. Also added a 10-second periodic sync that re-fetches `agent_sessions` from Supabase as a safety net for dropped realtime events.

### Voice response duplicate/stale text

**Problem:** After sending a voice command, the next voice interaction would briefly display the previous response text, and sometimes responses appeared twice. The auto-speak (TTS) feature also stopped working.

**Fix:** Implemented synchronous reset of `fullText` and `isComplete` in `useRealtimeMessages` when `commandId` changes. Added `lastCompletedTextRef` to capture the final response before `activeCommandId` is cleared. Updated auto-speak effect to read from this ref immediately.

### Chat history positioning

**Problem:** The chat history sidebar rendered behind the main navigation sidebar (both used `fixed left-0`), making it invisible.

**Fix:** Changed `ChatHistory.tsx` to slide in from the right (`right-0`, `translateX(100%)`) with left border instead of right.

### Wallet/MetaMask error handling

**Problem:** MetaMask browser extension auto-injection caused "Failed to connect to MetaMask" errors even though the app uses server-side wallets.

**Fix:** Added `error` state with retry UI to `PaymentsDashboard.tsx` and `AgentIdentity.tsx`. Added 10-second RPC timeouts to all wallet API routes (`/api/x402/wallet`, `/api/token`, `/api/erc8004/identity`). Display message: "Wallet data is loaded server-side -- MetaMask is not required."

### Arena visual improvements

- Meeting table: larger size, brighter cyan edges, inner glow ring, semi-transparent glass fill
- Projector: larger orb, thicker beam, outer glow
- Chairs: brighter colors with edge glow
- Ghost silhouettes: increased alpha for idle (0.35) and busy (0.5) states
- Meeting mode: brighter glow and silhouette when seated

---

## Soul Agent (v17)

Memory orchestrator providing context curation, association building, dream consolidation, and fleet-wide memory retrieval learning.

| Component | Status | Notes |
|-----------|--------|-------|
| Bridge Library | Active | `dashboard/bridge/lib/soul/` (context, associations, dream, retrieval, types) |
| DB Schema | Active | `memory_associations`, `memory_queries`, `dream_insights` tables |
| Arena Presence | Active | Room: SOUL (private alcove), Color: Magenta (#ff006e) |
| Arena Office | Active | L-shaped surveillance desk + arc of mini fleet-monitor screens |
| Meeting Seat | Active | Observer position (195°) |
| Topology | Active | Watches: main, briefing, oracle, alchemist, sentinel |
| ERC-8004 | Active | Listed in `fleet.agents` + 5 soul capabilities in metadata |
| Bridge | Active | Listed in ALLOWED_AGENTS |
| Supabase | Active | Registered in agent_controls |

Capabilities: `soul-memory-orchestration`, `dream-consolidation`, `memory-association-building`, `context-packet-curation`, `memory-retrieval-learning`

---

## Sentinel Agent (v15)

Fleet lifecycle manager providing spawn coordination, resource management, and inter-agent communication.

| Component | Status | Notes |
|-----------|--------|-------|
| IDENTITY.md | Active | `~/.openclaw/agents/sentinel/agent/IDENTITY.md` |
| SOUL.md | Active | `~/.openclaw/agents/sentinel/agent/SOUL.md` |
| models.json | Active | kimi-k2.5:cloud (256k context) |
| Arena Presence | Active | Room: COMMAND, Color: Red (#ef4444) |
| Bridge | Active | Listed in ALLOWED_AGENTS |
| Supabase | Active | Registered in agent_controls |

Commands: `status`, `health`, `spawn`, `queue`, `errors`

---

## Agent Identity System (v15)

All sub-agents now have proper IDENTITY.md and SOUL.md files defining their self-awareness.

| Agent | IDENTITY.md | SOUL.md | Status |
|-------|-------------|---------|--------|
| main | `~/.openclaw/workspace/IDENTITY.md` | `~/.openclaw/workspace/SOUL.md` | Active |
| sentinel | `~/.openclaw/agents/sentinel/agent/` | Same | Active |
| briefing | `~/.openclaw/agents/briefing/agent/` | Same | Active |
| oracle | `~/.openclaw/agents/oracle/agent/` | Same | Active |
| alchemist | `~/.openclaw/agents/alchemist/agent/` | Same | Active |
| web3dev | `~/.openclaw/agents/web3dev/agent/` | Same | Active |

Each agent's identity includes: purpose, commands, data sources, team awareness, operating principles, communication style, and arena info.

---

## Agent Session Persistence (v15)

Main agent uses a persistent daily session for conversation context.

| Feature | Value |
|---------|-------|
| Session ID format | `dash_main_YYYYMMDD` |
| Scope | Per-day (resets at midnight) |
| Lock fallback | Unique ID when persistent session is locked |
| Other agents | Always use unique session IDs |

**How it works:** When main is invoked, the bridge checks if the daily session lock file exists. If unlocked, main reuses the same session, preserving full conversation history within the day. If locked (concurrent command), it falls back to a unique session ID so the command isn't blocked.

---

## Output Noise Filter (v15)

Expanded to catch all bridge/diagnostic noise in agent responses.

| Pattern | Description |
|---------|-------------|
| `[diagnostic]` | Lane task errors from OpenClaw runtime |
| `[heartbeat]` | Bridge heartbeat messages |
| `[bridge]` | Bridge daemon internals |
| `[swarm]` | Swarm executor messages |
| `[intent-tracker]` | Intent tracking messages |
| `[voice/...]` | Voice transcription debug |
| `session file locked` | Session lock timeout errors |

Located in: `dashboard/src/lib/utils.ts` → `cleanAgentOutput()`

---

## Voice STT Changes (v15)

| Change | Before | After |
|--------|--------|-------|
| Default STT | `gpt-4o-transcribe` | Browser `SpeechRecognition` |
| Fallback | — | `whisper-1` with `language: "en"` |
| Prompt | Full example sentences | Removed entirely |
| Temperature | `0` | Removed |

Browser SpeechRecognition bypasses WSL2 audio degradation by processing audio directly in Chrome, avoiding WebM encoding and network roundtrip.

---

## x402 Payments (Base Mainnet) ✅ PRODUCTION

XmetaV gates agent API endpoints with USDC micro-payments via the x402 protocol (Coinbase).

| Component | Status | Notes |
|-----------|--------|-------|
| x402 Express Server | **Mainnet** ✅ | `cd dashboard/x402-server && npm start` |
| Bridge x402 Client | **Mainnet** ✅ | Auto-pays with `EVM_PRIVATE_KEY` |
| Supabase `x402_payments` table | Active | Payment logging with daily spend view |
| Dashboard `/payments` page | Active | Wallet status, history, gated endpoints |

### Network Configuration

| Setting | Value | Network |
|---------|-------|---------|
| `NETWORK` | `eip155:8453` | **Base Mainnet** ✅ |
| `FACILITATOR_URL` | `https://api.cdp.coinbase.com/platform/v2/x402` | Production |
| `EVM_ADDRESS` | `0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80` | Receives USDC |

### Gated endpoints (x402-server)

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /agent-task` | $0.01 | Queue a task for any agent |
| `POST /intent` | $0.005 | Create an intent resolution session |
| `GET /fleet-status` | $0.001 | Get fleet status summary |
| `POST /swarm` | $0.02 | Launch a multi-agent swarm |
| `POST /voice/transcribe` | $0.005 | Speech-to-text (Whisper) |
| `POST /voice/synthesize` | $0.01 | Text-to-speech (streaming TTS) |

### Free endpoints (x402-server)

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Server status and endpoint listing |
| `GET /token-info` | $XMETAV token contract address and tier table |

### Environment variables

| Variable | Location | Description |
|----------|----------|-------------|
| `EVM_PRIVATE_KEY` | `bridge/.env` | Agent wallet private key (Base) |
| `EVM_ADDRESS` | `x402-server/.env` | Address receiving payments |
| `FACILITATOR_URL` | `x402-server/.env` | Coinbase x402 facilitator |
| `X402_BUDGET_LIMIT` | `bridge/.env` | Max payment per request in USD |
| `XMETAV_TOKEN_ADDRESS` | `x402-server/.env` | $XMETAV contract for tier discounts |
| `OPENAI_API_KEY` | `x402-server/.env` | OpenAI key for voice endpoints |

---

## ERC-8004 Agent Identity (Base mainnet)

The XmetaV main agent is registered on-chain as an ERC-8004 identity NFT with full x402 payment support declared in metadata.

| Property | Value |
|----------|-------|
| Agent ID | `16905` |
| Contract | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (IdentityRegistry) |
| Network | Base Mainnet |
| Owner | `0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80` |
| tokenURI | `https://raw.githubusercontent.com/Metavibez4L/XmetaV/dev/dashboard/erc8004/metadata.json` |
| x402Support | `enabled: true` (declared in on-chain metadata) |
| setAgentURI tx | [BaseScan](https://basescan.org/tx/0xc5c67e881d94c09746378f791eaee56e70c424742dc30c528109895ee5f23339) |
| NFT | [BaseScan](https://basescan.org/token/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432?a=16905) |

### Identity Resolution Middleware

The x402 server includes ERC-8004 identity resolution middleware:
- Incoming requests with `X-Agent-Id` header trigger on-chain lookup
- Resolves `ownerOf`, `tokenURI`, `getAgentWallet` from the Identity Registry
- Fetches metadata and checks `x402Support.enabled`
- Attaches resolved identity to `req.callerAgent` for downstream handlers

### Discovery Endpoint

```
GET /agent/16905/payment-info
```
Returns: owner, wallet, tokenURI, x402 support status, accepted schemes, pricing, and registry address.

### Dashboard `/identity` page

Shows agent registration status, owner, wallet, capabilities, services, trust model, and contract addresses. Supports lookup by agent ID.

### Environment

| Variable | Location | Description |
|----------|----------|-------------|
| `ERC8004_AGENT_ID` | `bridge/.env` | On-chain agent ID (16905) |
| `EVM_PRIVATE_KEY` | `bridge/.env` | Wallet key (shared with x402) |
| `BASE_RPC_URL` | `x402-server/.env` | Alchemy RPC for on-chain reads |

Full reference: `capabilities/erc8004-identity.md`

---

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
openclaw config set browser.enabled true
openclaw config set browser.defaultProfile openclaw
openclaw config set browser.executablePath "$HOME/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome"
```

### Smoke test (CLI)

```bash
# Start gateway (if not already running)
./scripts/start-gateway.sh

openclaw browser start
openclaw browser open https://example.com
openclaw browser snapshot
```

### Known limitation (small local models)

With smaller local models (e.g. `qwen2.5:7b-instruct`), the agent may sometimes ignore the `browser` tool and fall back to shell-based approaches.

Workarounds:
- Use the deterministic `openclaw browser ...` CLI for browser automation.
- Or use `exec` + `curl -sL ...` for “web fetch + summarize” workflows.
