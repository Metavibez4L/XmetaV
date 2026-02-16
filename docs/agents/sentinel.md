# The Sentinel — Agent Lifecycle Manager

**Codename:** Sentinel
**Role:** Agent Lifecycle Manager & Fleet Operations
**Station:** Command Room, XmetaV HQ
**Color:** Red (#ef4444)
**Arena Position:** Command room, left of Main

---

## Overview

The Sentinel is the operational backbone of the XmetaV agent fleet. It manages agent lifecycles, coordinates spawns, handles resource conflicts, monitors fleet health, and facilitates inter-agent communication. It's the reason the fleet runs smoothly.

The Sentinel is NOT a commander — **Main** gives the orders. Sentinel executes the logistics.

---

## Capabilities

### Spawn Coordination
- Track which agents are currently active, idle, or offline
- Prevent duplicate spawns of the same agent
- Manage spawn queues when multiple agents are requested simultaneously
- Report spawn failures and suggest recovery actions

### Resource Management
- Monitor agent session states via Supabase `agent_sessions`
- Detect and resolve lock contention
- Track agent timeouts and recommend restarts
- Manage OpenClaw session IDs to prevent collisions

### Inter-Agent Communication
- Route messages between agents for multi-step workflows
- Aggregate outputs from parallel swarm runs
- Maintain dispatch logs
- Flag unresponsive agents

### Fleet Health Monitoring
- Heartbeat verification — detect stale sessions
- Track error rates per agent
- Report fleet status summaries
- Recommend restarts or investigation

### Queue & Priority Management
- Manage command queues when fleet is at capacity
- Prioritize urgent commands (security alerts, etc.)
- Implement backpressure for low-priority tasks
- Track completion rates and response times

---

## Commands

| Command | Description |
|---------|-------------|
| `sentinel status` | Full fleet status report |
| `sentinel health` | Health check across all agents |
| `sentinel health <agent>` | Health check for specific agent |
| `sentinel spawn <agent>` | Coordinate agent spawn |
| `sentinel queue` | Show command queue status |
| `sentinel errors` | Show recent errors and failures |

---

## Data Sources

- **Supabase tables:** `agent_sessions`, `agent_controls`, `agent_commands`, `agent_responses`, `swarm_runs`, `swarm_tasks`
- **Bridge daemon:** Port 18789
- **OpenClaw CLI:** Agent status inspection

---

## Escalation Rules

| Condition | Severity | Action |
|-----------|----------|--------|
| 1 agent offline > 5 min | `[WARN]` | Flag in status report |
| 2+ agents offline | `[CRITICAL]` | Recommend investigation |
| Bridge offline | `[CRITICAL]` | Fleet down, escalate to operator |
| Command stuck > 3 min | `[WARN]` | Recommend timeout/retry |
| Spawn failure | `[INFO]` | Log, check conflicts, recommend fix |

---

## Fleet Architecture

```
┌─────────────────────────────────────────────────────┐
│                   COMMAND ROOM                       │
│   [OPERATOR]    [MAIN]    [SENTINEL]                │
│                    │           │                      │
├────────────────────┼───────────┼──────────────────────┤
│                    │           │                      │
│              ┌─────┴─────┐    │                      │
│              │  MEETING   │    │                      │
│              │   TABLE    │    │                      │
│              └─────┬─────┘    │                      │
│         ┌──────────┼──────────┘                      │
│   ┌─────┴─────┐    │    ┌──────────┐  ┌────────────┐│
│   │   INTEL   │    │    │ WEB3 LAB │  │ DEV FLOOR  ││
│   │ briefing  │    │    │ web3dev  │  │ akua       ││
│   │ oracle    │◄───┘    │          │  │ basedintern││
│   │ alchemist │         └──────────┘  └────────────┘│
│   └───────────┘                                      │
└─────────────────────────────────────────────────────┘
```

---

## Source Files

- **Identity:** `~/.openclaw/agents/sentinel/agent/IDENTITY.md`
- **Soul:** `~/.openclaw/agents/sentinel/agent/SOUL.md`
- **Models:** `~/.openclaw/agents/sentinel/agent/models.json`
- **Arena config:** `dashboard/src/components/arena/agents.ts`
- **This doc:** `docs/agents/sentinel.md`
