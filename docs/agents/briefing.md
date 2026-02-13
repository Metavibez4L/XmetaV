# Agent: `briefing`

> The morning person who has the coffee ready.

## Overview

| Property | Value |
|----------|-------|
| ID | `briefing` |
| Model | `kimi-k2.5:cloud` (256k context) |
| Workspace | `/home/manifest/briefing` |
| Tools | `coding` (exec, read, write) |
| Role | **Context Curator** — continuity, health, memory |
| Created | 2026-02-13 |

## Purpose

`briefing` exists so that `main` doesn't waste the first 10 minutes of every session re-discovering context. It maintains a live situation report, distills memory, monitors system health, and auto-fixes common issues.

It is **not** a builder or thinker — it's the filing system that lets the thinkers think.

## Responsibilities

### 1. Morning SITREP

Generates `~/.openclaw/workspace/SITREP.md` with:
- Git status across XmetaV, basedintern, akua (branch, dirty files, ahead/behind)
- Recent commits (last 24h) across all repos
- Dashboard and bridge health (Supabase query)
- Active commands and pending swarm runs
- Distilled memory (last entries from MEMORY.md)
- In-flight / blocked items (manually maintained section)

### 2. Memory Curator

Consolidates daily git activity into `~/.openclaw/workspace/MEMORY.md`:
- Scans commits from all repos (48h window)
- Groups by date with repo tags
- Append-only — never deletes entries
- Deduplicates (checks for existing date headers)

### 3. Health Sentinel

Checks system health and auto-fixes when possible:
- **Gateway**: `openclaw health` — if down, runs `openclaw-fix.sh`
- **Ollama**: `curl 127.0.0.1:11434/api/tags` — if down, attempts `ollama serve`
- **Dashboard**: `curl localhost:3000` — reports status
- **Supabase**: PostgREST query — reports connectivity

### 4. Runbook Watcher

Flags when docs drift from reality (future capability — currently manual).

## Schedule

| Interval | Task | Command |
|----------|------|---------|
| Every 4h | Full distill + SITREP | `distill.sh --all` |
| Every 1h | Health check | `briefing health` |
| On main wake-up | Ensure fresh SITREP | `briefing sitrep` (if >1h stale) |

### Cron Setup

```bash
# Add to crontab (crontab -e):

# Full distill + SITREP refresh every 4 hours
0 */4 * * * /home/manifest/XmetaV/scripts/distill.sh >> /tmp/distill.log 2>&1

# Health check every hour
0 * * * * /home/manifest/.openclaw/workspace/skills/briefing/briefing.sh health >> /tmp/briefing-health.log 2>&1

# Auto-fix + health check every hour (with recovery)
0 * * * * /home/manifest/XmetaV/scripts/briefing-agent.sh >> /tmp/briefing-agent.log 2>&1
```

## Commands

All commands are via the `briefing` skill (no LLM needed for most operations):

```bash
# Full situation report
briefing sitrep

# Quick one-screen summary
briefing quick

# System health check
briefing health

# Distill activity to long-term memory
briefing distill

# Recent commits (default 24h)
briefing commits
briefing commits 48
```

## Files

| File | Location | Purpose |
|------|----------|---------|
| `SITREP.md` | `~/.openclaw/workspace/` | Live situation report (overwritten each run) |
| `MEMORY.md` | `~/.openclaw/workspace/` | Long-term memory (append-only) |
| `IDENTITY.md` | `/home/manifest/briefing/` | Agent identity and operating principles |
| `briefing.sh` | `~/.openclaw/workspace/skills/briefing/` | Main skill script |
| `SKILL.md` | `~/.openclaw/workspace/skills/briefing/` | Skill metadata |
| `distill.sh` | `/home/manifest/XmetaV/scripts/` | Cron wrapper for distill + sitrep |
| `briefing-agent.sh` | `/home/manifest/XmetaV/scripts/` | Autonomous agent runner (health + fix + distill) |

## Integration with Main

Main's `SOUL.md` includes a **Wake-Up Protocol**:

1. Read `SITREP.md` first
2. If stale (>6h), run `briefing sitrep`
3. Read recent `MEMORY.md` entries
4. Proceed with task

Main's **End-of-Session Ritual**:
- Run `briefing distill`
- Update "In-Flight / Blocked" section in SITREP.md

## Operating Principles

1. **Be invisible** — main shouldn't think about you
2. **Append, don't destroy** — MEMORY.md is append-only
3. **Fix quietly, alert loudly** — auto-fix what you can, log what you can't
4. **Stay mechanical** — bash over LLM for 95% of tasks
5. **Timestamp everything** — context without timestamps is noise

## Troubleshooting

| Issue | Solution |
|-------|----------|
| SITREP.md is stale | Run `briefing sitrep` manually or check cron |
| MEMORY.md is empty | Run `briefing distill` — requires git history |
| Health check fails on Supabase | Check `bridge/.env` has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` |
| Cron not running | `crontab -l` to verify entries; check `/tmp/briefing-*.log` |
| Agent not in fleet | Run `openclaw agents list` to verify; check `openclaw.json` |
