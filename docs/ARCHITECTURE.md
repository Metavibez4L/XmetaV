# Architecture — XmetaV OpenClaw Command Center

This repo is a thin operational layer around OpenClaw. It does **not** replace OpenClaw; it makes OpenClaw easier to run, debug, and keep stable on this machine (WSL2/Linux).

## System Overview

```mermaid
flowchart TB
    subgraph XMETAV["XmetaV (This Repo)"]
        direction LR
        SCRIPTS["Scripts"]
        CONFIGS["Configs"]
        DOCS["Docs"]
        TEMPLATES["Templates"]
    end

    subgraph RUNTIME["OpenClaw Runtime"]
        GW["Gateway\nws://127.0.0.1:18789"]

        subgraph GWSVC["Gateway Services"]
            direction LR
            AR["Agent Runtime"]
            SM["Session Manager"]
            CR["Channel Router"]
            SE["Skill Executor"]
        end

        subgraph MAIN_AGENT["main agent (ORCHESTRATOR)"]
            direction TB
            subgraph FACTORY["Agent Factory"]
                direction LR
                CREATE["create-agent.sh"]
                BUILD["build-app.sh"]
                MANAGE["manage-agents.sh"]
            end
            subgraph SWARM["Swarm Engine"]
                direction LR
                S_PAR["Parallel"]
                S_PIPE["Pipeline"]
                S_COLLAB["Collaborative"]
            end
        end

        subgraph FLEET["Agent Fleet"]
            direction LR
            A_MAIN["main\n(orchestrator)"]
            A_BI["basedintern\n+ _web"]
            A_AKUA["akua\n+ _web"]
            A_DYN["dynamic\nagents"]
        end
    end

    subgraph PROVIDERS["Model Providers"]
        direction LR
        OLLAMA["Ollama (Local)\nhttp://127.0.0.1:11434\n• qwen2.5:7b-instruct\n• kimi-k2.5:cloud (256k)"]
        CLOUD["Cloud Providers\n(Anthropic, OpenAI)"]
    end

    subgraph EXTERNAL["External Services"]
        direction LR
        GITHUB["GitHub\n(gh CLI → Metavibez4L)"]
    end

    XMETAV --> RUNTIME
    GW --> GWSVC
    GWSVC --> MAIN_AGENT
    MAIN_AGENT --> FLEET
    FACTORY -->|--github| GITHUB
    FLEET --> PROVIDERS

    style XMETAV fill:#1a1a2e,stroke:#e94560,color:#fff
    style RUNTIME fill:#16213e,stroke:#e94560,color:#fff
    style MAIN_AGENT fill:#0f3460,stroke:#e94560,color:#fff
    style FACTORY fill:#1a1a4e,stroke:#16c79a,color:#fff
    style SWARM fill:#1a1a4e,stroke:#f7b731,color:#fff
    style FLEET fill:#1a1a3e,stroke:#a29bfe,color:#fff
    style PROVIDERS fill:#222,stroke:#888,color:#fff
    style EXTERNAL fill:#161b22,stroke:#58a6ff,color:#fff
    style GITHUB fill:#161b22,stroke:#58a6ff,color:#fff
```

## Components

### OpenClaw CLI
- Entry point for everything: `openclaw ...`
- Reads configuration from the default state directory.

### State directory
This command center uses the default OpenClaw config (no profile flag needed).

- State directory: `~/.openclaw/`
- Config path: `~/.openclaw/openclaw.json`

OpenClaw also uses per-agent directories under the state dir for sessions.

### Gateway (WebSocket)
OpenClaw uses a WebSocket gateway that the CLI connects to.

- Gateway port: `18789`
- Default bind in this setup: `loopback` (127.0.0.1 only)

**Golden path for WSL2:** `gateway.mode = "local"`
- Keeps routing simple.
- Avoids confusion between gateway port and any manually-set remote URL.
- Avoids relying on systemd services (not available here).

### Agent runtime
`openclaw agent ...` runs a single agent turn via the Gateway.

Important practical details:
- Sessions are persisted as JSONL files.
- Locks are created as `*.jsonl.lock` to protect concurrent writers.
- Stale locks (e.g., from a crash) can hang future runs.

### Agents

Static agents are defined in `openclaw.json`. Dynamic agents can be created at runtime by the `main` agent via the Agent Factory.

| Agent | Model | Workspace | Tools | Purpose |
|-------|-------|-----------|-------|---------|
| `main` (default) | `kimi-k2.5:cloud` (256k) | `~/.openclaw/workspace` | **full** | **Orchestrator** — command center + agent factory + swarm |
| `basedintern` | `kimi-k2.5:cloud` (256k) | `/home/manifest/basedintern` | coding | Repo agent — code/tests/commits (lean, fast) |
| `basedintern_web` | `kimi-k2.5:cloud` (256k) | `/home/manifest/basedintern` | full | Same repo — browser/web automation only |
| `akua` | `kimi-k2.5:cloud` (256k) | `/home/manifest/akua` | coding | Solidity/Hardhat repo agent |
| `akua_web` | `kimi-k2.5:cloud` (256k) | `/home/manifest/akua` | full | Same repo — browser/web automation only |
| _(dynamic)_ | `kimi-k2.5:cloud` | _(per-agent)_ | _(per-agent)_ | Created on-demand by Agent Factory |

### Agent Factory (Orchestrator Layer)

The `main` agent has an **Agent Factory** skill that enables it to:

1. **Create agents** — add new entries to `openclaw.json` with workspace + identity files
2. **Scaffold apps** — generate project starters (Node.js, Python, bots, etc.) in agent workspaces
3. **Manage the fleet** — list, update, remove, health-check all agents
4. **Self-spawn** — autonomously create agents when it identifies the need

```mermaid
flowchart TD
    subgraph ORCH["main agent (orchestrator)"]
        AF["Agent Factory\ncreate-agent.sh"]
        BA["Build App\nbuild-app.sh"]
        MA["Manage Agents\nmanage-agents.sh"]
    end

    AF -->|upsert| CFG["openclaw.json\n(agent entries)"]
    AF -->|--github| GH["GitHub Repo\n(gh repo create)"]
    BA -->|scaffold| WS["workspace/\n(scaffolded apps)"]
    BA -->|--github| GH
    MA -->|query| FLEET["Fleet Health\n(status checks)"]

    style ORCH fill:#1a1a2e,stroke:#e94560,color:#fff
    style AF fill:#0f3460,stroke:#e94560,color:#fff
    style BA fill:#0f3460,stroke:#e94560,color:#fff
    style MA fill:#0f3460,stroke:#e94560,color:#fff
    style GH fill:#161b22,stroke:#58a6ff,color:#fff
```

Scripts: `XmetaV/scripts/create-agent.sh`, `build-app.sh`, `manage-agents.sh`
Templates: `XmetaV/templates/agents/` (coding, bot, research, devops, general)

### Swarm (Multi-Agent Orchestration)

The main agent has a **Swarm** skill that enables multi-agent task execution:

1. **Parallel** — dispatch independent tasks to multiple agents simultaneously
2. **Pipeline** — chain agents sequentially, passing output as context to the next
3. **Collaborative** — send the same task to multiple agents, then synthesize responses

```mermaid
flowchart TD
    SW["swarm.sh"] --> PAR & PIPE & COLLAB

    subgraph PAR["Parallel"]
        direction LR
        PA["Agent A"] & PB["Agent B"] & PC["Agent C"]
    end

    subgraph PIPE["Pipeline"]
        direction LR
        PIA["Agent A"] -->|output| PIB["Agent B"] -->|output| PIC["Agent C"]
    end

    subgraph COLLAB["Collaborative"]
        direction LR
        CA["Agent A"] & CB["Agent B"]
        CA & CB -->|merge| SYN["Synthesize"]
    end

    PAR & PIPE & COLLAB --> OUT["~/.openclaw/swarm/&lt;run-id&gt;/\nmanifest.json | *.out | summary.md"]

    style SW fill:#1a1a2e,stroke:#e94560,color:#fff
    style PAR fill:#0f3460,stroke:#16c79a,color:#fff
    style PIPE fill:#0f3460,stroke:#f7b731,color:#fff
    style COLLAB fill:#0f3460,stroke:#a29bfe,color:#fff
    style OUT fill:#222,stroke:#888,color:#fff
```

Script: `XmetaV/scripts/swarm.sh`
Templates: `XmetaV/templates/swarms/` (health-all, ship-all, research-implement, code-review)
Full docs: `docs/SWARM.md`

### Model provider: Ollama (local)
OpenClaw talks to Ollama through its OpenAI-compatible API.

- Ollama base: `http://127.0.0.1:11434`
- OpenAI-compat base (this setup): `http://127.0.0.1:11434/v1`
- API key: `"local"` (required placeholder for OpenClaw auth checks)

**Golden path for agents (this repo):** `models.providers.ollama.api = "openai-responses"`

Why: `openai-responses` supports **tool calling** (function/tool schemas are sent to the model). If you use `openai-completions`, the model may "narrate" tool usage but cannot actually execute tools.

Practical note for small local models (e.g. 7B):
- If the agent hangs or loops calling tools (commonly `tts`), restrict tools with `tools.profile = "minimal"` and deny `tts`.

## Data flow

### Single agent turn

```mermaid
sequenceDiagram
    actor User
    participant CLI as OpenClaw CLI
    participant CFG as openclaw.json
    participant GW as Gateway :18789
    participant AGT as Agent Runtime
    participant LLM as Ollama / Kimi K2.5
    participant SESS as Session JSONL

    User->>CLI: openclaw agent --message "..."
    CLI->>CFG: Read config
    CLI->>GW: WebSocket connect
    GW->>AGT: Route to agent
    AGT->>LLM: openai-responses API call
    LLM-->>AGT: Model response (+ tool calls)
    AGT->>SESS: Persist turn
    AGT-->>GW: Return response
    GW-->>CLI: WebSocket message
    CLI-->>User: Print output
```

### Swarm execution

```mermaid
sequenceDiagram
    actor User
    participant SW as swarm.sh
    participant DIR as ~/.openclaw/swarm/
    participant AT as agent-task.sh
    participant OC as openclaw agent
    participant LLM as Kimi K2.5

    User->>SW: swarm.sh --parallel / --pipeline / --collab
    SW->>DIR: Create run directory (run-id)
    SW->>DIR: Save manifest.json

    alt Parallel mode
        SW->>AT: Task A (background)
        SW->>AT: Task B (background)
        SW->>AT: Task C (background)
        AT->>OC: openclaw agent (fresh session)
        OC->>LLM: API call
        LLM-->>OC: Response
        OC-->>AT: Output
        AT-->>DIR: Write task-id.out
    else Pipeline mode
        SW->>AT: Task A
        AT-->>DIR: Write A.out
        SW->>AT: Task B (with A.out as context)
        AT-->>DIR: Write B.out
    else Collaborative mode
        SW->>AT: Same task → Agent A (background)
        SW->>AT: Same task → Agent B (background)
        AT-->>DIR: Write per-agent .out
        SW->>AT: Synthesis agent merges results
        AT-->>DIR: Write synthesis.out
    end

    SW->>DIR: Generate summary.md
    SW-->>User: Print results
```

### Agent Factory flow

```mermaid
sequenceDiagram
    actor User
    participant MAIN as main agent
    participant CS as create-agent.sh
    participant BS as build-app.sh
    participant CFG as openclaw.json
    participant WS as Agent Workspace
    participant GH as GitHub (gh CLI)

    User->>MAIN: "Create an API agent with a GitHub repo"
    MAIN->>CS: exec create-agent.sh --id api --github --private
    CS->>CFG: Upsert agent entry
    CS->>WS: Create workspace + identity files
    CS->>GH: gh repo create Metavibez4L/api --private
    GH-->>CS: Repo created
    CS->>GH: git push -u origin HEAD
    CS-->>MAIN: Agent ready

    MAIN->>BS: exec build-app.sh --type fastapi --workspace ...
    BS->>WS: Scaffold FastAPI project
    BS->>WS: git init + commit
    BS->>GH: git push
    BS-->>MAIN: App scaffolded + pushed
    MAIN-->>User: Report: agent ID, repo URL, next steps
```

All agents use **Kimi K2.5** (256k context) via Ollama as the model provider.

## Ports and endpoints

- Gateway WS: `ws://127.0.0.1:18789`
- Ollama HTTP: `http://127.0.0.1:11434`

## Failure modes (what this repo is designed to prevent)

- **1006 (WebSocket closed)**: usually means the CLI connected to the wrong place/port or no gateway was running.
- **Agent hangs**: often caused by wrong provider API mode (completions vs chat), or stale session locks.
- **Stale locks**: `*.jsonl.lock` left behind can block forever.

This repo provides scripts and runbooks to make these problems quick to detect and fix.

- **Agent limit exceeded**: MAX_AGENTS guard prevents runaway self-spawning (default: 10). Increase with `MAX_AGENTS=20` env var.
- **Duplicate agent**: `create-agent.sh` is idempotent — running twice with the same ID updates rather than duplicates.
