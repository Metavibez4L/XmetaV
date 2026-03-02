# Akualabs

### *Intelligent systems for real assets*

[![Base](https://img.shields.io/badge/Base-0052FF?logo=base&logoColor=white)](https://base.org)
[![Agents](https://img.shields.io/badge/Agents-10%2B-00f0ff)](https://github.com/Metavibez4L/akualabs)
[![x402](https://img.shields.io/badge/x402-Live-39ff14)](https://x402.org)
[![macOS](https://img.shields.io/badge/macOS-Sequoia-000000?logo=apple)](https://apple.com/macos)

---

**Akualabs** builds autonomous agent infrastructure for commodity markets.

Our platform enables traders to deploy AI agent fleets that monitor markets 24/7, execute strategies automatically, and learn from every trade—all on commodity-grade infrastructure.

---

## What We Build

### 🚀 Agent Infrastructure
Deploy individual agents or full fleets. Each agent runs independently, with its own memory, skills, and trading logic. Coordinate them for complex strategies.

### ⚡ Real-Time Execution
From signal to settlement in milliseconds. Our bridge daemon streams output at 40ms intervals with 4x concurrent agent capacity.

### 💰 Payment Rails
Built-in x402 integration for usage-based billing. Pay per API call, per agent dispatch, per trade signal. Transparent pricing, instant settlement on Base.

### 📊 Market Intelligence
Real-time market data, pattern detection, and analytics. Agents that don't just see markets—they understand them.

---

## The Platform

```
┌─────────────────────────────────────────────────────────────┐
│                    AKUALABS PLATFORM                         │
├─────────────────────────────────────────────────────────────┤
│  AGENT FLEET        │  PAYMENT RAILS      │  MARKET DATA    │
│  • web3dev          │  • x402 endpoints   │  • Real-time    │
│  • alchemist        │  • USDC on Base     │  • Streaming    │
│  • oracle           │  • Usage-based      │  • Multi-source │
│  • midas            │  • $0.01 - $3.00    │  • Historical   │
│  • soul             │                     │                 │
│  • sentinel         │                     │                 │
│  • ...              │                     │                 │
├─────────────────────────────────────────────────────────────┤
│                    BRIDGE ORCHESTRATOR                       │
│              (4x concurrency, 40ms streaming)                │
└─────────────────────────────────────────────────────────────┘
```

---

## Capabilities

| Capability | Description | Status |
|------------|-------------|--------|
| **Agent Dispatch** | Send commands to any agent in the fleet | ✅ Live |
| **Swarm Execution** | Multi-agent coordinated tasks | ✅ Live |
| **x402 Payments** | Pay-per-use API access | ✅ 22 endpoints |
| **Memory System** | Persistent agent memory | ✅ Active |
| **Market Scanning** | Whale alerts, liquidation signals | ✅ Alpha feeds |
| **Trade Execution** | Generate unsigned transactions | ✅ Live |
| **Yield Optimization** | DeFi strategy analysis | ✅ Live |
| **Voice Interface** | Whisper transcription, TTS | ✅ Enabled |

---

## Quick Start

### For Traders

```bash
# Access the fleet
GET /fleet-status
# Returns: All 10 agents with live status

# Dispatch an agent
POST /agent-task
{
  "agent": "oracle",
  "message": "Scan Base for whale movements"
}

# Pay per use: $0.01 - $0.10
```

### For Developers

```bash
# Clone and run
git clone https://github.com/Metavibez4L/akualabs.git
cd akualabs/dashboard
npm install
npm run dev

# Bridge starts automatically
# Dashboard at http://localhost:3000
```

### For Infrastructure Builders

```typescript
// Build on our agent protocol
import { createAgent } from '@akualabs/agent-kit';

const trader = createAgent({
  id: 'my-trader',
  skills: ['commodity-analysis', 'execution'],
  memory: true,
  payment: 'x402' // Pay-as-you-go
});
```

---

## Agent Fleet

Our operational agents cover every aspect of commodity trading:

| Agent | Role | Specialty |
|-------|------|-----------|
| **web3dev** | Blockchain Dev | Solidity, Base deployment |
| **alchemist** | Tokenomics | Economic modeling, incentives |
| **oracle** | On-Chain Intel | Whale alerts, liquidation signals |
| **midas** | Revenue | Pricing optimization, growth |
| **soul** | Memory | Context orchestration, recall |
| **sentinel** | Fleet Ops | Monitoring, health checks |
| **briefing** | SITREP | Automated reporting |
| **akua** | Solidity | Smart contract focus |
| **basedintern** | TypeScript | Frontend, tooling |
| **main** | Orchestrator | Fleet coordination |

---

## x402 Payment Gateway

Micro-payments for agent services. All on Base.

```
GET  /fleet-status         $0.01    // Live agent status
POST /agent-task           $0.10    // Dispatch to any agent
POST /swarm                $0.50    // Multi-agent coordination

# Trade Execution
POST /execute-trade        $0.50    // Generate swap bundle
GET  /arb-opportunity      $0.25    // Cross-DEX scan
GET  /yield-optimize       $0.50    // Strategy analysis

# Alpha Feeds
GET  /whale-alert          $0.15    // Whale detection
GET  /liquidation-signal   $0.25    // DeFi liquidation signals
```

---

## Infrastructure

### Built on
- **96GB Mac Studio** — Serious compute for serious trading
- **Tailscale** — Secure mesh networking
- **Base** — Fast, cheap settlement (eip155:8453)
- **Supabase** — Realtime database, auth
- **Ollama** — Local LLM inference

### Performance
- 40ms stream flush (was 80ms)
- 8ms token batching (was 15ms)
- 4x concurrent agents
- ~80GB RAM headroom

---

## Commodity Focus

We believe commodities need intelligent infrastructure:

- **Energy** — Power markets, grid optimization, carbon credits
- **Metals** — Precious metals, industrial commodities
- **Agriculture** — Soft commodities, supply chain
- **Carbon** — Emissions trading, offsets

Our systems are designed for physical markets with real assets—not just crypto speculation.

---

## Documentation

- [Getting Started](./WEB3DEV-SETUP.md) — Frontend development
- [Contributing](./CONTRIBUTING.md) — Contribution guidelines
- [Brand Voice](./BRAND_VOICE.md) — Brand guidelines
- [API Reference](./docs/api.md) — Endpoint documentation

---

## Status

```
┌────────────────────────────────────┐
│  Bridge:        ONLINE             │
│  x402 Server:   22 endpoints live  │
│  Agent Fleet:   10 agents ready    │
│  Network:       Base (eip155:8453) │
│  Memory:        94% free (96GB)    │
└────────────────────────────────────┘
```

---

## Community

- [Discord](https://discord.gg/akualabs)
- [Twitter](https://twitter.com/akualabs)
- [Blog](https://blog.akualabs.io)

---

## License

MIT — See [LICENSE](./LICENSE)

---

<p align="center">
  <strong>Autonomous agents. Real commodities.</strong>
</p>

<p align="center">
  <a href="https://github.com/Metavibez4L/akualabs">GitHub</a> •
  <a href="https://basescan.org/address/0x21fa51B40BF63E47f000eD77eC7FD018AE0ddA0B">Base Contract</a>
</p>
