# XmetaV Capabilities

Quick reference for everything you can do with your OpenClaw Command Center.

**Last updated:** 2026-02-12 (v11 - $XMETAV Token + Voice Commands + x402 Payments + ERC-8004 Identity)

## Directory Contents

| File | Description |
|------|-------------|
| [quick-commands.md](quick-commands.md) | Essential daily-use commands |
| [agent-tasks.md](agent-tasks.md) | AI agent task examples and patterns |
| [management.md](management.md) | System administration commands |
| [expand.md](expand.md) | Add models, skills, channels, agents |
| [cheatsheet.md](cheatsheet.md) | One-page quick reference |
| [x402-payments.md](x402-payments.md) | **x402 USDC micro-payments** (Coinbase/Base) — autonomous agent payments |
| [erc8004-identity.md](erc8004-identity.md) | **ERC-8004 on-chain identity** — Agent NFT #16905 on Base |
| [voice-commands.md](voice-commands.md) | **Voice Commands** — Whisper STT + TTS with x402 gating |
| [xmetav-token.md](xmetav-token.md) | **$XMETAV Token** — ERC-20 on Base with tiered discounts |

## Your Setup at a Glance

```
┌─────────────────────────────────────────┐
│         XmetaV Command Center v11       │
├─────────────────────────────────────────┤
│  Config:   ~/.openclaw/openclaw.json    │
│  Gateway:  127.0.0.1:18789             │
│  Mode:     --local (recommended)        │
├─────────────────────────────────────────┤
│  Agents:                                │
│    main          - Orchestrator (256k)   │
│    basedintern   - TypeScript/Node.js   │
│    basedintern_web - Browser automation │
│    akua          - Solidity/Hardhat     │
│    akua_web      - Browser automation   │
│    dynamic_*     - Created on-demand    │
├─────────────────────────────────────────┤
│  Model:    kimi-k2.5:cloud (256k ctx)   │
│  Provider: Ollama (native + CUDA)       │
│  GPU:      RTX 4070 (42-54 tok/s)       │
├─────────────────────────────────────────┤
│  Features:                              │
│    ✓ Swarm orchestration (p/p/c)        │
│    ✓ x402 USDC payments (Base)          │
│    ✓ ERC-8004 Identity #16905           │
│    ✓ Voice commands (STT/TTS)           │
│    ✓ $XMETAV token (tiered discounts)   │
│    ✓ Dashboard (Next.js + Supabase)     │
│    ✓ GitHub integration                 │
└─────────────────────────────────────────┘
```

## Quick Start

```bash
# Talk to the orchestrator (main agent)
openclaw agent --agent main --local --thinking off --message "Hello!"

# Run basedintern on its repo
openclaw agent --agent basedintern --local --message "Run npm test"

# Create a new agent via Agent Factory
./scripts/create-agent.sh --id researcher --template research --web

# Run a parallel swarm health check
./scripts/swarm.sh --parallel \
  basedintern "Run npm test" \
  akua "Run /repo-ops compile"

# Start the Control Plane Dashboard
cd dashboard && npm run dev
```

## Feature Highlights

### 🎯 Agent Factory
The `main` agent can create agents, scaffold apps, manage GitHub repos:
```bash
./scripts/create-agent.sh --id myagent --template coding --github
./scripts/build-app.sh --type nextjs --workspace /home/manifest/myagent
```

### 🐝 Swarm Orchestration
Dispatch tasks across multiple agents:
- **Parallel** — Run tasks simultaneously
- **Pipeline** — Chain agents, output flows forward
- **Collaborative** — Multiple perspectives, synthesized results

### 💰 x402 Autonomous Payments
Agents pay for API access automatically via USDC on Base:
- Server gates endpoints with micro-payments
- Client automatically pays 402 responses
- Dashboard tracks spend and wallet status

### 🆔 ERC-8004 On-Chain Identity
Agent #16905 registered as NFT on Base mainnet:
- Identity: `0x8004...a432` (IdentityRegistry)
- Reputation tracking on-chain
- Dashboard `/identity` page for details

### 🎤 Voice Commands
Speak to agents via OpenAI Whisper:
- STT: $0.005 per transcription
- TTS: $0.01 per synthesis
- x402-gated endpoints
- Dashboard voice toggle in Agent Chat

### 🪙 $XMETAV Token
ERC-20 on Base Mainnet with tiered discounts:
- Contract: `0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54`
- Tiers: None → Bronze (10%) → Silver (20%) → Gold (35%) → Diamond (50%)
- Dashboard `/token` page with balance, tier table, holder benefits
- x402 server checks `balanceOf()` on-chain for tier discounts

### 🖥️ Control Plane Dashboard
Cyberpunk-themed web UI for remote management:
- Agent Chat with streaming
- Swarm creation and monitoring
- Fleet enable/disable controls
- Payment and identity tracking
- Real-time via Supabase
