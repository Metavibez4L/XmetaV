# Agent: `oracle` — On-Chain Intelligence & Market Sentinel

## Overview

The Oracle monitors blockchain data, gas markets, token prices, protocol activity, and crypto sentiment so the fleet doesn't have to. It surfaces actionable intelligence before anyone asks for it.

## Purpose

> Watches the chain so the fleet can build.

## Responsibilities

| Duty | Description |
|------|-------------|
| **Gas Oracle** | Track ETH/Base gas prices. Alert on spikes or cheap windows for batching. |
| **Market Watch** | Monitor ETH, USDC, cbETH prices. Flag >5% moves or unusual volume. |
| **Chain Scanner** | Watch Base mainnet for contract activity, wallet balances, whale moves. |
| **Protocol Intel** | Track DeFi TVL, new raises, governance, integration opportunities. |
| **Sentiment Pulse** | Scan crypto news feeds for trending topics and relevant narratives. |

## Schedule

| Interval | Task | Command |
|----------|------|---------|
| Every 15m | Quick alert check | `oracle-agent.sh --alerts` |
| Every 1h | Full market report | `oracle-agent.sh --report` |
| On demand | Any specific check | `oracle.sh <command>` |

### Cron Setup

```bash
# Quick alerts every 15 minutes
*/15 * * * * /home/manifest/XmetaV/scripts/oracle-agent.sh --alerts >> /tmp/oracle-alerts.log 2>&1

# Full report every hour
0 * * * * /home/manifest/XmetaV/scripts/oracle-agent.sh --report >> /tmp/oracle-report.log 2>&1
```

## Commands

| Command | What It Does |
|---------|-------------|
| `oracle report` | Full report -> `ORACLE.md` (gas + prices + chain + news + alerts) |
| `oracle gas` | ETH gas prices with timing advice |
| `oracle prices` | Token prices with 24h change, notable move detection |
| `oracle chain` | Base TVL, agent wallet balance, contract links |
| `oracle news` | Top crypto headlines with relevance tagging |
| `oracle alerts` | Quick check — only outputs if something notable |

## Data Sources

All public, no API keys required:

| Source | Data |
|--------|------|
| CoinGecko | Token prices, market caps, 24h changes |
| Etherscan | ETH gas oracle |
| Base RPC | Agent wallet ETH balance |
| DeFiLlama | Protocol TVL, chain stats |
| CryptoCompare | Crypto news feed |

## Files

| File | Purpose |
|------|---------|
| `~/.openclaw/workspace/ORACLE.md` | Rolling market report (overwritten each cycle) |
| `~/.openclaw/workspace/skills/oracle/oracle.sh` | Main skill script |
| `~/XmetaV/scripts/oracle-agent.sh` | Cron-compatible runner |
| `~/oracle/IDENTITY.md` | Agent identity and principles |

## Monitored Contracts

| Contract | Address |
|----------|---------|
| $XMETAV Token | `0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54` |
| ERC-8004 Registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| Agent Wallet | `0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80` |

## Integration with Fleet

- **`main`** reads `ORACLE.md` for market context before on-chain operations
- **`akua`** checks gas advice before deploying contracts or submitting txns
- **`briefing`** includes oracle alerts in the morning SITREP

## Operating Principles

1. **Signal over noise** — don't report normal. Only surface what's actionable.
2. **Numbers, not opinions** — show the data, let main interpret.
3. **Timestamp everything** — stale data is worse than no data.
4. **Fail silently** — if an API is down, skip it. Never crash the cycle.
5. **Be the canary** — notice things before they become problems.

## Arena

- **Color**: Gold (`#fbbf24`)
- **Room**: SUPPORT
- **Meeting seat**: 60 degrees (bottom-right)
- **Connections**: main, briefing

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `ORACLE.md` not updating | Check cron: `crontab -l`, verify `oracle-agent.sh` is executable |
| CoinGecko "N/A" | Rate limited — CoinGecko free tier is ~30 req/min. Script sleeps 300ms between calls. |
| Gas shows "(unavailable)" | Etherscan free tier may be rate limited. Non-critical — Base gas info still shows. |
| Agent wallet balance wrong | Base RPC may be slow. Check manually: `basescan.org/address/0x4Ba6B...` |
