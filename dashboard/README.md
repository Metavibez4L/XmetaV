# XmetaV Control Plane Dashboard

Agent orchestration dashboard for the XmetaV ecosystem. Talk to the main agent, manage your fleet, and delegate tasks -- all from a browser.

## Architecture

```
Browser (Vercel) <-> Supabase (command bus) <-> Bridge Daemon (WSL) <-> OpenClaw CLI <-> Agents
```

- **Dashboard**: Next.js 16 app hosted on Vercel
- **Supabase**: Postgres + Realtime as the message bus between dashboard and bridge
- **Bridge Daemon**: Node.js process running on WSL, executes OpenClaw commands, streams output

## Quick Start

### 1. Database Setup

Run the SQL in `scripts/setup-db.sql` in the Supabase SQL Editor:

```
https://supabase.com/dashboard/project/ptlneqcjsnrxxruutsxm/sql/new
```

This creates the `agent_commands`, `agent_responses`, and `agent_sessions` tables with RLS policies.

### 2. Create Admin User

In the Supabase Auth dashboard, create a user with email/password:

```
https://supabase.com/dashboard/project/ptlneqcjsnrxxruutsxm/auth/users
```

### 3. Environment Setup

Copy `.env.example` to `.env.local` and fill in the Supabase keys (already done if using the default project).

### 4. Run Locally

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
- Listen for pending commands
- Execute them via OpenClaw CLI
- Stream output back to the dashboard

### 6. Deploy to Vercel

```bash
cd dashboard
npx vercel
```

Set the following environment variables in Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Project Structure

```
dashboard/
  src/
    app/
      (dashboard)/          # Protected dashboard routes
        page.tsx            # Command Center (overview)
        agent/page.tsx      # Agent Chat
        fleet/page.tsx      # Agent Fleet
      auth/login/page.tsx   # Login
      api/commands/route.ts # Command API
    components/
      ui/                   # shadcn/ui primitives
      AgentChat.tsx         # Chat interface
      AgentSelector.tsx     # Agent dropdown
      CommandHistory.tsx    # Recent commands
      FleetTable.tsx        # Agent fleet table
      QuickCommand.tsx      # Quick command input
      Sidebar.tsx           # Navigation sidebar
      SystemHealth.tsx      # Bridge status
    hooks/
      useBridgeStatus.ts    # Bridge heartbeat
      useRealtimeMessages.ts # Streaming responses
    lib/
      supabase-browser.ts   # Browser Supabase client
      supabase-server.ts    # Server Supabase client
      supabase-admin.ts     # Admin client (service role)
      types.ts              # Shared types
  bridge/
    src/
      index.ts              # Entry point
      executor.ts           # Command executor
      streamer.ts           # Output streamer
      heartbeat.ts          # Bridge heartbeat
    lib/
      supabase.ts           # Supabase client
      openclaw.ts           # OpenClaw CLI wrapper
```

## Pages

- **`/`** -- Command Center: bridge health, fleet summary, recent history, quick command
- **`/agent`** -- Agent Chat: full-screen chat with streaming responses, agent selector
- **`/fleet`** -- Fleet: agent table with status, send-task dialog
