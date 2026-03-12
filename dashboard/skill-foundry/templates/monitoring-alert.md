---
name: {{NAME}}
description: {{DESCRIPTION}}
user-invocable: true
disable-model-invocation: false
allowed-tools: ["Bash(curl *)", "Read(*)", "Write(*)"]
---

# {{NAME}}

**Category:** monitoring | **Risk:** low

{{DESCRIPTION}}

## Prerequisites

Ensure the target service is network-reachable from this machine.

## Health Check

```bash
curl -s -o /dev/null -w "%{http_code}" {{TARGET_URL}}
```

## Monitoring Logic

1. Ping the target endpoint
2. Record response code and latency
3. Compare against thresholds
4. Fire alert if degraded or down

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `target` | string | yes | URL or service to monitor |
| `interval` | number | no | Check interval in seconds (default: 60) |
| `alertChannel` | string | no | Slack channel ID for alerts |

## Response Format

```json
{
  "status": "up | down | degraded",
  "latency": 142,
  "lastChecked": "2026-03-12T00:00:00.000Z",
  "alerts": []
}
```

## Alert Thresholds

| Metric | Warning | Critical |
| --- | --- | --- |
| Response time | > 2000ms | > 5000ms |
| Status code | 4xx | 5xx |
| Consecutive failures | 2 | 5 |

## Safety Notes

- This is a read-only monitoring skill — no state changes
- Deduplicate alerts within a 5-minute window to prevent spam
- Include cooldown between identical alerts
- Log all checks for trend analysis
