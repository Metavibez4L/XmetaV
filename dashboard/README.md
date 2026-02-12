# XmetaV Control Plane Dashboard

Cyberpunk-themed agent orchestration dashboard for the XmetaV ecosystem. Talk to agents, manage your fleet, orchestrate swarms, and control the bridge -- all from a browser.

```
Browser (Vercel / localhost) <-> Supabase (command bus + Realtime) <-> Bridge Daemon (WSL) <-> OpenClaw CLI <-> Agents
```

## Architecture

- **Dashboard**: Next.js 16 (App Router) with TypeScript, Tailwind CSS, shadcn/ui, cyberpunk theme
- **Supabase**: Postgres + Realtime as the message bus between dashboard and bridge
- **Bridge Daemon**: Node.js process running on WSL, executes OpenClaw commands and orchestrates swarms
- **Auth**: Supabase Auth (email/password)
- **Hosting**: Vercel (production) or localhost:3000 (development)

## Quick Start

### 1. Database Setup

Run the SQL migrations in the Supabase SQL Editor (in order):

```
https://supabase.com/dashboard/project/ptlneqcjsnrxxruutsxm/sql/new
```

1. `scripts/setup-db.sql` — creates `agent_commands`, `agent_responses`, `agent_sessions` tables with RLS + Realtime
2. `scripts/setup-db-agent-controls.sql` — creates `agent_controls` table for enable/disable toggles
3. `scripts/setup-db-swarms.sql` — creates `swarm_runs` + `swarm_tasks` tables with RLS + Realtime

### 2. Create Admin User

In the Supabase Auth dashboard, create a user with email/password:

```
https://supabase.com/dashboard/project/ptlneqcjsnrxxruutsxm/auth/users
```

### 3. Environment Setup

Copy `.env.example` to `.env.local` and fill in the Supabase keys:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (public, used in browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side API routes only) |
| `OPENAI_API_KEY` | OpenAI API key for voice commands (Whisper STT + TTS) |

### 4. Run Dashboard Locally

```bash
cd dashboard
npm install
npm run dev
```

Open http://localhost:3000, sign in with your admin user.

### 5. Bridge Daemon

```bash
cd dashboard/bridge
npm install
npm start
```

The bridge daemon will:
- Connect to Supabase Realtime
- Listen for pending agent commands and swarm runs
- Execute commands via OpenClaw CLI
- Orchestrate swarm tasks (parallel, pipeline, collaborative)
- Stream output back to the dashboard in real-time
- Enforce agent enable/disable controls
- Send periodic heartbeats

### 6. Deploy to Vercel

```bash
cd dashboard
npx vercel
```

Set the three environment variables in Vercel project settings.

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | **Command Center** | Bridge health indicator, fleet summary, recent command history, quick command input |
| `/agent` | **Agent Chat** | Full-screen streaming chat with agent selector dropdown |
| `/swarms` | **Swarms** | Create, monitor, and review multi-agent swarm runs (3 tabs) |
| `/fleet` | **Fleet** | Agent status table with enable/disable toggles and send-task dialog |
| `/payments` | **Payments** | x402 wallet status, daily spend tracking, payment history, gated endpoints |
| `/identity` | **Identity** | ERC-8004 on-chain agent identity, reputation, capabilities, and NFT details |
| `/auth/login` | **Login** | Supabase email/password authentication |

### Swarms Page (Tabs)

| Tab | Features |
|-----|----------|
| **Create** | Template picker (loads from `templates/swarms/*.json`), custom builder (mode, tasks, agents), "Let Main Agent Decide" button |
| **Active** | Live progress bars, per-task streaming output (auto-scroll), cancel button, auto-expand new runs |
| **History** | Filterable by mode and status, expandable detail views with synthesis and task outputs, lazy-loaded task data |

**Keyboard shortcuts**: `1` / `2` / `3` to switch tabs.

## Supabase Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `agent_commands` | Command bus (dashboard -> bridge) | `id`, `agent_id`, `message`, `session_id`, `status` |
| `agent_responses` | Response bus (bridge -> dashboard) | `id`, `command_id`, `content`, `is_complete` |
| `agent_sessions` | Session tracking | `id`, `agent_id`, `session_id` |
| `agent_controls` | Agent enable/disable state | `id`, `agent_id`, `enabled` |
| `swarm_runs` | Swarm run metadata | `id`, `name`, `mode`, `status`, `manifest`, `synthesis` |
| `swarm_tasks` | Per-task status and output | `id`, `swarm_id`, `agent_id`, `message`, `status`, `output` |
| `x402_payments` | x402 payment transaction log | `id`, `endpoint`, `amount`, `tx_hash`, `payer_address`, `status` |
| `intent_sessions` | Intent resolution sessions | `id`, `query`, `cursor_agent_id`, `status` |

All tables have:
- RLS policies (authenticated users: SELECT, INSERT, UPDATE)
- Realtime enabled for live WebSocket updates
- `created_at` / `updated_at` timestamps

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/commands` | POST | Send a command to an agent |
| `/api/agents/controls` | GET, POST | Get/set agent enable/disable state |
| `/api/bridge/status` | GET | Check bridge daemon status |
| `/api/bridge/start` | POST | Start bridge daemon |
| `/api/bridge/stop` | POST | Stop bridge daemon |
| `/api/swarms` | GET, POST | List swarm runs / create a new swarm run |
| `/api/swarms/[id]` | GET | Get swarm run details + tasks |
| `/api/swarms/[id]/cancel` | POST | Cancel a running/pending swarm |
| `/api/swarms/templates` | GET | List available swarm templates from disk |
| `/api/x402/payments` | GET | List x402 payment history with filters |
| `/api/x402/wallet` | GET | Wallet info, spend stats, bridge status |
| `/api/erc8004/identity` | GET | On-chain agent identity and metadata |
| `/api/intent` | POST | Intent resolution (agent routing) |
| `/api/voice/transcribe` | POST | Speech-to-text via Whisper (multipart audio) |
| `/api/voice/synthesize` | POST | Text-to-speech via OpenAI TTS (returns audio/mpeg) |

## Project Structure

```
dashboard/
  src/
    app/
      (dashboard)/              # Protected dashboard routes
        page.tsx                # Command Center (overview)
        agent/page.tsx          # Agent Chat
        swarms/page.tsx         # Swarms (create, active, history)
        fleet/page.tsx          # Agent Fleet
        payments/page.tsx       # x402 Payments dashboard
        identity/page.tsx       # ERC-8004 Agent Identity
        layout.tsx              # Dashboard layout with Sidebar
      auth/login/page.tsx       # Login page
      api/
        commands/route.ts       # Command submission API
        agents/controls/route.ts # Agent enable/disable API
        bridge/
          status/route.ts       # Bridge status
          start/route.ts        # Bridge start
          stop/route.ts         # Bridge stop
        swarms/
          route.ts              # List/create swarms
          [id]/
            route.ts            # Get swarm details
            cancel/route.ts     # Cancel swarm
          templates/route.ts    # List swarm templates
        x402/
          payments/route.ts     # Payment history API
          wallet/route.ts       # Wallet info + spend stats
        erc8004/
          identity/route.ts     # On-chain identity resolution
        intent/route.ts         # Intent resolution API
      globals.css               # Cyberpunk theme (neon blue, scanlines, glitch)
      layout.tsx                # Root layout
    components/
      ui/                       # shadcn/ui primitives (button, input, card)
      AgentChat.tsx             # Streaming chat interface
      AgentSelector.tsx         # Agent dropdown selector
      BridgeControls.tsx        # Bridge start/stop/status controls
      CommandHistory.tsx        # Recent command table
      ErrorBoundary.tsx         # React error boundary
      FleetTable.tsx            # Agent fleet with enable/disable toggles
      QuickCommand.tsx          # Quick command input bar
      Sidebar.tsx               # Navigation sidebar (keyboard shortcuts)
      SwarmActiveRuns.tsx       # Active swarm run cards with live output
      SwarmCreate.tsx           # Template picker + custom swarm builder
      SwarmHistory.tsx          # Past swarm runs with filters
      SystemHealth.tsx          # Bridge health indicator
      PaymentsDashboard.tsx    # x402 payments UI (wallet, history, endpoints)
      AgentIdentity.tsx        # ERC-8004 identity viewer (NFT, reputation, lookup)
    hooks/
      useAgentControls.ts       # Agent enable/disable state
      useAgentSessions.ts       # Agent session listing
      useBridgeStatus.ts        # Bridge heartbeat monitoring
      useCommandHistory.ts      # Command history fetching
      useRealtimeMessages.ts    # Streaming agent responses
      useSwarmRuns.ts           # Swarm runs + tasks (Realtime subscriptions)
    lib/
      bridge-manager.ts         # Server-side bridge process manager
      supabase-browser.ts       # Browser Supabase client
      supabase-server.ts        # Server Supabase client
      supabase-admin.ts         # Admin client (service role key)
      types.ts                  # Shared TypeScript types (includes X402Payment, ERC8004Identity)
    middleware.ts               # Auth middleware (protects dashboard routes)
  x402-server/                  # x402 payment-gated Express service
    index.ts                    # Express server with paymentMiddleware
    package.json                # @x402/express, @x402/core, @x402/evm, express
    .env.example                # EVM_ADDRESS, FACILITATOR_URL, PORT, NETWORK
  erc8004/                      # ERC-8004 agent identity
    register.ts                 # Registration script (mints agent NFT)
    registration.json           # Agent metadata (name, capabilities, services)
    lib/client.ts               # Viem client for identity + reputation lookups
    abis/                       # Minimal contract ABIs
      IdentityRegistry.ts
      ReputationRegistry.ts
    package.json                # dotenv, tsx, viem
  bridge/
    src/
      index.ts                  # Bridge daemon entry point (v1.1.0)
      executor.ts               # Command executor (agent_commands -> openclaw agent)
      swarm-executor.ts         # Swarm orchestrator (parallel/pipeline/collaborative)
      streamer.ts               # Output streamer (stdout -> Supabase)
      heartbeat.ts              # Periodic bridge heartbeat
    lib/
      supabase.ts               # Supabase client for bridge
      openclaw.ts               # OpenClaw CLI wrapper (spawn child processes)
      x402-client.ts            # x402 fetch wrapper (auto-pays 402 responses)
    .gitignore                  # Ignores bridge PID file
  scripts/
    setup-db.sql                # Base tables migration
    setup-db-agent-controls.sql # Agent controls table migration
    setup-db-swarms.sql         # Swarm tables migration (runs + tasks + RLS)
  .env.example                  # Environment variable template
  .env.local                    # Local environment (not committed)
  next.config.ts                # Next.js configuration
  vercel.json                   # Vercel deployment configuration
```

## Bridge Daemon

The bridge daemon (`bridge/`) is a Node.js process that runs on the same machine as OpenClaw. It:

1. **Subscribes** to Supabase Realtime channels for `agent_commands` and `swarm_runs`
2. **Executes** commands by spawning `openclaw agent` child processes
3. **Streams** output back to Supabase in real-time (chunked updates to `agent_responses` and `swarm_tasks`)
4. **Orchestrates** swarm runs with three execution modes:
   - **Parallel**: Spawns all agent tasks concurrently
   - **Pipeline**: Runs tasks sequentially, passing each output as context to the next
   - **Collaborative**: Sends the same task to multiple agents, then runs a synthesis step
5. **Enforces** agent controls (checks `agent_controls` table; disabled agents have commands blocked)
6. **Heartbeats** periodically so the dashboard knows the bridge is alive

### Swarm Executor Features

- Cancellation-aware: kills child processes when a swarm is cancelled from the dashboard
- Agent-enabled checks: verifies agents are enabled before spawning
- Output buffer deduplication: avoids sending duplicate output chunks
- Configurable timeouts per task
- Optional synthesis step (any agent can synthesize results)

## x402 Payment Service

The `x402-server/` directory contains a standalone Express server that gates XmetaV API endpoints with USDC micro-payments via the x402 protocol.

```bash
cd dashboard/x402-server
cp .env.example .env  # fill in EVM_ADDRESS, FACILITATOR_URL
npm install
npm start             # starts on port 4021
```

Gated endpoints: `/agent-task` ($0.01), `/intent` ($0.005), `/fleet-status` ($0.001), `/swarm` ($0.02). Free endpoint: `/health`.

## ERC-8004 Agent Identity

The `erc8004/` directory contains the on-chain identity integration for the XmetaV agent on Base mainnet.

- **Agent ID**: 16905
- **Contract**: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (IdentityRegistryUpgradeable)
- **NFT**: [View on BaseScan](https://basescan.org/token/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432?a=16905)

```bash
cd dashboard/erc8004
npm install
npx tsx register.ts   # register or re-register the agent
```

## UI Theme

The dashboard uses a **cyberpunk hacker** aesthetic:

- **Colors**: Neon cyan (`#00f0ff`) on dark backgrounds (`#0a0e1a`, `#0d1117`)
- **Effects**: CSS scanlines, glitch text animations, neon glow borders
- **Typography**: Monospace-first with geometric headings
- **Interactions**: Hover glow effects, animated transitions, keyboard shortcuts throughout
- **Responsive**: Full mobile support with collapsible sidebar

## Frontend Optimizations

- `React.memo` on all major components (SwarmCreate, SwarmActiveRuns, SwarmHistory, FleetTable, etc.)
- Memoized sub-components (TemplateCard, TaskEditor, ActiveRunCard, HistoryRunRow, TaskRow)
- `useCallback` / `useMemo` throughout hooks and components
- Visibility-aware Realtime polling (pauses when tab is hidden)
- Debounced Realtime event handling to coalesce rapid updates
- Lazy-loaded task data in history (only fetched on expand)
- Auto-scroll with smart pause detection (user scroll stops auto-scroll)
- Keyboard shortcuts for tab navigation (`1`/`2`/`3` on Swarms page)
- Error boundaries for graceful failure handling

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Dashboard won't start | Check `.env.local` has all 3 Supabase keys; run `npm install` |
| Bridge not connecting | Verify Supabase URL/keys match in both `dashboard/.env.local` and `bridge/.env` |
| Commands not executing | Ensure bridge daemon is running (`npm start` in `bridge/`); check bridge heartbeat on Command Center |
| Swarm stuck in pending | Bridge daemon must be running; check that swarm_runs Realtime is enabled in Supabase |
| Agent disabled warning | Check Fleet page; toggle the agent back to enabled |
| Cancel not working | Verify RLS UPDATE policies exist on `swarm_runs` and `swarm_tasks` (run `setup-db-swarms.sql`) |
| Port 3000 in use | `pkill -f "next dev"` and `rm -f .next/dev/lock` |
| Hydration errors | Clear `.next` cache: `rm -rf .next && npm run dev` |
| x402 payments not logging | Check `EVM_PRIVATE_KEY` is set in `bridge/.env`; verify `x402_payments` table exists |
| Identity page empty | Verify `ERC8004_AGENT_ID=16905` in `bridge/.env`; check Base RPC connectivity |
| x402-server won't start | Check `EVM_ADDRESS` and `FACILITATOR_URL` in `x402-server/.env` |
