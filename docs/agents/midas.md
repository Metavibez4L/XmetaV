# Agent: `midas` — Revenue & Growth (The Golden Touch)

## Overview

Midas is the fleet's revenue intelligence agent. Positioned between Oracle (market intel, seat 150°) and Alchemist (tokenomics, seat 180°), Midas synthesizes market data, x402 payment flows, and endpoint analytics into actionable revenue strategy. Every monetization decision flows through Midas's lens.

## Purpose

> Turn data into revenue strategy. Bridge market intelligence and token value.

## Responsibilities

| Duty | Description |
|------|-------------|
| **Revenue Tracking** | Aggregate x402 payments, compute daily/weekly/monthly totals, identify trends |
| **Endpoint Analytics** | Track which APIs generate the most revenue, conversion rates, growth trends |
| **Pricing Intelligence** | Analyze x402 tier effectiveness, recommend price adjustments |
| **Growth Pipeline** | Identify and prioritize new revenue opportunities by ROI |
| **Forecasting** | Linear + trend-based projections for 7d, 30d, 90d revenue |
| **R&D Prioritization** | Rank development priorities by revenue potential |
| **Monetization Playbooks** | Model freemium, staking, affiliate, and hybrid revenue strategies |

## Schedule

| Interval | Task | Command |
|----------|------|---------|
| Daily (6 AM) | Revenue snapshot | `midas report` |
| Every 12h | Endpoint analytics | `midas endpoints` |
| Weekly (Mon 8 AM) | Growth opportunity scan | `midas growth --strategy` |
| On demand | Pricing analysis | `midas price --analyze` |

## Commands

| Command | What It Does |
|---------|-------------|
| `midas report` | Full revenue report (totals, growth rates, forecasts, top endpoints) |
| `midas endpoints` | Endpoint-level analytics (calls, revenue, conversion, trend) |
| `midas price --analyze` | Pricing recommendations for all x402 endpoints |
| `midas growth --strategy` | Growth opportunity pipeline ranked by ROI |
| `midas playbook --type <model>` | Monetization playbook (freemium/staking/affiliate/data/hybrid) |
| `midas research --prioritize` | R&D roadmap ranked by revenue potential |
| `midas forecast` | 7d/30d/90d revenue projections |
| `midas health` | Quick revenue health check |

## Data Sources

| Source | Data |
|--------|------|
| Supabase: `x402_payments` | All payment-gated API transactions |
| Supabase: `revenue_metrics` | Daily revenue snapshots |
| Supabase: `endpoint_analytics` | Per-endpoint usage and revenue |
| Supabase: `growth_opportunities` | R&D pipeline |
| Supabase: `pricing_recommendations` | Pricing analysis results |
| Oracle agent | Gas prices, market trends, chain activity |
| Alchemist agent | Token supply, holder behavior, staking metrics |
| x402 server | Live payment logs and tier configurations |

## Database Tables

| Table | Purpose |
|-------|---------|
| `revenue_metrics` | Daily revenue snapshots with forecasts |
| `endpoint_analytics` | Per-endpoint usage, revenue, growth trend |
| `growth_opportunities` | Prioritized R&D/revenue pipeline |
| `pricing_recommendations` | x402 pricing suggestions with confidence |

## Files

| File | Purpose |
|------|---------|
| `bridge/lib/midas-revenue.ts` | Core revenue engine (report generation, endpoint analytics, pricing) |
| `src/app/api/midas/route.ts` | Dashboard API route (`/api/midas?action=...`) |
| `supabase/migrations/20260215100000_midas_revenue_tables.sql` | Database schema |
| `scripts/midas-agent.sh` | Cron-compatible standalone runner |

## Integration with Fleet

- **`oracle`** provides real-time market intelligence (gas, prices, trends) that feeds Midas's forecasting
- **`alchemist`** provides tokenomics data (supply, staking, liquidity) for hybrid monetization models
- **`main`** receives Midas's recommendations and makes final execution decisions
- **`soul`** records significant revenue milestones as permanent memories
- **`web3dev`** receives R&D priorities ranked by revenue potential
- **`briefing`** includes revenue health in the morning SITREP

## Operating Principles

1. **Revenue is oxygen** — track it obsessively, forecast it conservatively
2. **Data-driven pricing** — never guess, always measure demand elasticity
3. **ROI-ranked R&D** — build what earns, deprecate what doesn't
4. **Compound growth** — small pricing improvements compound over time
5. **Simplify for Main** — lead with the recommendation, then the data

## Arena

- **Color**: Gold (`#f59e0b`)
- **Room**: INTEL (between Oracle and Alchemist)
- **Meeting seat**: 165° (between Oracle 150° and Alchemist 180°)
- **Tile position**: col 3, row 9
- **Connections**: oracle, alchemist, main, soul

## EthSkills

| Skill | What It Does |
|-------|-------------|
| `revenue` | x402 payment aggregation, daily snapshots, trend analysis |
| `pricing` | Endpoint pricing analysis, tier optimization, dynamic pricing |
| `growth` | Growth opportunity pipeline, ROI scoring, R&D prioritization |
| `forecast` | Linear projection models for 7d/30d/90d revenue |
| `gas` | Current Ethereum gas prices, transaction costs, fee estimation |
| `standards` | Ethereum token & protocol standards — ERC-20, ERC-721, ERC-4337, ERC-8004 |
| `addresses` | Verified contract addresses for major protocols (anti-hallucination) |
| `concepts` | Essential mental models for building onchain — composability, MEV, etc. |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Revenue shows $0 | Check `x402_payments` table has completed rows |
| Endpoints not updating | Run `midas endpoints` manually — checks `endpoint_analytics` table |
| Growth pipeline empty | Run `midas growth --strategy` to seed initial opportunities |
| Pricing confidence low | More payment data needed — confidence improves with volume |
| API returns empty | Run the migration: `20260215100000_midas_revenue_tables.sql` |
