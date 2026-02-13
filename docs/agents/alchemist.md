# Agent: `alchemist` — Tokenomics Specialist

## Overview

The Alchemist is the fleet's token economist. It reads $XMETAV's on-chain vitals — supply, holders, emission velocity, liquidity depth — and translates them into clear, actionable intelligence. When the emission schedule is creating sell pressure at month 3, Alchemist says so before it happens.

## Purpose

> Turns raw numbers into token strategy.

## Responsibilities

| Duty | Description |
|------|-------------|
| **Token Vitals** | Total/circulating supply, burn tracking, key wallet balances |
| **Holder Analysis** | Whale concentration, distribution phases, Gini estimation |
| **Emission Modeling** | Inflation rate per epoch, sell pressure windows, unlock projections |
| **Staking Curves** | APY scenarios, optimal stake ratio, lock tier recommendations |
| **Liquidity Intel** | DEX pool depth, LP concentration, volume metrics |
| **Scenario Modeling** | "What-if" projections for emissions, dump scenarios, staking changes |

## Schedule

| Interval | Task | Command |
|----------|------|---------|
| Every 6h | Quick health check | `alchemist-agent.sh --health` |
| Daily (8 AM) | Full tokenomics report | `alchemist-agent.sh --report` |
| On demand | Specific analysis | `alchemist.sh <command>` |

### Cron Setup

```bash
# Health check every 6 hours
0 */6 * * * /home/manifest/XmetaV/scripts/alchemist-agent.sh --health >> /tmp/alchemist.log 2>&1

# Full report daily at 8 AM UTC
0 8 * * * /home/manifest/XmetaV/scripts/alchemist-agent.sh --report >> /tmp/alchemist.log 2>&1
```

## Commands

| Command | What It Does |
|---------|-------------|
| `alchemist report` | Full report -> `TOKENOMICS.md` (supply + holders + emissions + staking + liquidity) |
| `alchemist supply` | Total supply, circulating, burn stats, key wallet balances |
| `alchemist holders` | Top holders, concentration risk assessment |
| `alchemist emissions` | 12-month emission projection with sell pressure windows |
| `alchemist staking` | APY vs stake ratio scenarios, lock tier recommendations |
| `alchemist liquidity` | DEX pool depth, LP analysis, trading links |
| `alchemist health` | Quick one-liner health check (only alerts if notable) |

## Data Sources

All public, zero API keys:

| Source | Data |
|--------|------|
| Base RPC (`mainnet.base.org`) | ERC-20 reads: `totalSupply()`, `balanceOf()`, `decimals()` |
| BaseScan | Token holder list, transfer events (via browser links) |
| DeFiLlama | Protocol TVL, pool stats |
| CoinGecko | Token price (when listed) |
| DEX Screener | Pool analytics (via browser links) |

## Monitored Contract

| Field | Value |
|-------|-------|
| Token | `$XMETAV` |
| Address | `0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54` |
| Network | Base Mainnet |
| Deployer | `0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80` |
| ERC-8004 | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |

## Emission Model Parameters

Configurable in the script header:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `INITIAL_SUPPLY` | 1,000,000,000 | 1B tokens at genesis |
| `VESTING_MONTHS` | 24 | Team/investor vesting period |
| `MONTHLY_UNLOCK_PCT` | 4.17% | ~100% / 24 months linear |
| `STAKING_TARGET_PCT` | 40% | Optimal staked supply ratio |
| `BASE_APY` | 12% | Base staking rewards |

## Files

| File | Purpose |
|------|---------|
| `~/.openclaw/workspace/TOKENOMICS.md` | Rolling tokenomics report (overwritten each cycle) |
| `~/.openclaw/workspace/skills/alchemist/alchemist.sh` | Main skill script |
| `~/XmetaV/scripts/alchemist-agent.sh` | Cron-compatible runner |
| `~/alchemist/IDENTITY.md` | Agent identity and principles |

## Integration with Fleet

- **`main`** reads `TOKENOMICS.md` before making token-related decisions
- **`oracle`** provides market prices that complement Alchemist's supply-side analysis
- **`akua`** uses emission model data when deploying/modifying token contracts
- **`briefing`** can include token health in the morning SITREP

## Operating Principles

1. **Math, not vibes** — every claim has a number behind it
2. **Forward-looking** — historical data for context, projections for decisions
3. **Concentration is risk** — always flag outsized single-entity influence
4. **Incentives drive behavior** — model what rational actors will do
5. **Simplify for main** — lead with the conclusion, then the data

## Arena

- **Color**: Fuchsia/Purple (`#e879f9`)
- **Room**: SUPPORT
- **Meeting seat**: 180 degrees (bottom center)
- **Connections**: main, oracle

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `TOKENOMICS.md` not updating | Check cron: `crontab -l`, verify `alchemist-agent.sh` is executable |
| Supply shows "N/A" | Base RPC may be rate limited — script retries with 300ms delay |
| Holder analysis limited | Full holder list needs BaseScan Pro API; current version checks known addresses |
| Emission model wrong | Edit parameters at top of `alchemist.sh` (INITIAL_SUPPLY, VESTING_MONTHS, etc.) |
