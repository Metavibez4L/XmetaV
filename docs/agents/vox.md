# Agent: `vox` — Brand Voice & Campaign Specialist (The Amplifier)

## Overview

Vox is the fleet's brand intelligence agent. Positioned in the OPS room (Operations & Outreach), Vox transforms milestones, revenue wins, and technical progress into compelling X campaigns. Every public-facing message flows through Vox's lens — ensuring voice consistency, engagement optimization, and competitive awareness.

## Purpose

> Turn achievements into amplified brand presence. Own the voice, grow the audience.

## Responsibilities

| Duty | Description |
|------|-------------|
| **Campaign Generation** | Create tweet threads aligned with brand voice, optimized for engagement |
| **Voice Calibration** | Audit recent posts for tone, vocabulary, and sentiment consistency |
| **Competitor Monitoring** | Track competitor messaging, identify differentiation opportunities |
| **Content Calendar** | Generate weekly/monthly content schedules with optimal timing |
| **Crisis Response** | Rapid-response copy for negative events or competitor attacks |
| **Performance Analysis** | Track post engagement, identify viral patterns, replicate hooks |
| **Milestone Amplification** | Turn every fleet achievement into shareable content |

## Schedule

| Interval | Task | Command |
|----------|------|---------|
| Daily (9 AM) | Content suggestions | `vox campaign --daily` |
| Weekly (Mon) | Content calendar | `vox calendar --weekly` |
| Weekly (Fri) | Voice audit | `vox voice --audit` |
| Bi-weekly | Competitor report | `vox competitor --all` |
| On demand | Campaign thread | `vox campaign <topic>` |
| On demand | Crisis response | `vox crisis <situation>` |

## Commands

| Command | What It Does |
|---------|-------------|
| `vox campaign <topic>` | Generate a tweet thread (3-5 tweets + hashtags + timing) |
| `vox voice --audit` | Analyze recent posts for voice consistency and sentiment |
| `vox calendar --weekly` | 7-day content calendar with topics, formats, and timing |
| `vox competitor <name>` | Competitive intelligence report on a specific brand |
| `vox crisis <situation>` | Rapid crisis response copy (3 response options) |
| `vox report` | Full brand health report (voice, engagement, competitors) |
| `vox health` | Quick brand metrics check |

## Data Sources

| Source | Data |
|--------|------|
| Fleet agents | Milestones, revenue data, market events, uptime stats |
| Supabase: `agent_memory` | Past campaign performance, viral patterns |
| x402 server | Revenue milestones for celebration content |
| Oracle agent | Market events for insight threads |
| Midas agent | Revenue achievements for amplification |
| Sentinel agent | Uptime and reliability metrics |

## Files

| File | Purpose |
|------|---------|
| `scripts/vox-agent.sh` | Cron-compatible standalone runner |
| `docs/agents/vox.md` | This runbook |
| `~/.openclaw/agents/vox/AGENTS.md` | Agent identity file |
| `~/.openclaw/agents/vox/SOUL.md` | Agent soul definition |

## Integration with Fleet

- **`midas`** provides revenue milestones and growth data for celebration posts
- **`oracle`** provides market events and whale alerts for insight threads
- **`briefing`** provides SITREP highlights for weekly recap content
- **`sentinel`** provides uptime stats and reliability metrics for bragging
- **`soul`** records engagement patterns and viral hooks as permanent memories
- **`main`** receives Vox's campaign recommendations and makes final decisions

## x402 Revenue Model

| Service | Price | Value |
|---------|-------|-------|
| Campaign thread | $0.15 | 5-tweet thread + hashtags + timing |
| Voice audit | $0.25 | Analyze last 50 posts |
| Competitor report | $0.20 | 3 competitor analysis |
| Content calendar | $0.30 | 7-day schedule |
| Crisis response | $0.50 | Rapid response copy |

## Operating Principles

1. **Voice is identity** — every post must sound like XmetaV
2. **Data over gut** — optimize posting times, hashtags, and hooks with metrics
3. **Build in public** — transparency creates trust and engagement
4. **Milestone amplification** — turn every achievement into content
5. **Competitor awareness** — know the landscape, own the differentiation
6. **Concise for Main** — lead with the tweet, then the strategy

## Arena

- **Color**: Cyan (`#06b6d4`)
- **Room**: OPS (Operations & Outreach) — top-left area near Command
- **Meeting seat**: 105° (between soul 195° and akua_web 120°)
- **Tile position**: col 1, row 5.5
- **Connections**: main, midas, oracle, briefing, soul

## Skills

| Skill | What It Does |
|-------|-------------|
| `content-strategy` | Tweet thread generation, content calendar, posting optimization |
| `voice-calibration` | Brand voice analysis, vocabulary auditing, sentiment scoring |
| `competitor-analysis` | Competitor tracking, differentiation scoring, counter-narrative |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Campaign output too generic | Provide more context about recent milestones |
| Voice audit shows no data | Ensure `agent_memory` has post history entries |
| Competitor report empty | Check web access or provide competitor names |
| Content calendar repetitive | Run `vox voice --audit` to refresh content patterns |
