---
name: {{NAME}}
description: {{DESCRIPTION}}
user-invocable: true
disable-model-invocation: false
allowed-tools: ["Bash(curl *)"]
---

# {{NAME}}

**Category:** data | **Risk:** low

{{DESCRIPTION}}

## Prerequisites

Ensure the target API is reachable:

```bash
curl -s -o /dev/null -w "%{http_code}" {{BASE_URL}}/health
```

## Command Syntax

```bash
curl -s {{BASE_URL}}/{{ENDPOINT}} | jq .
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `query` | string | yes | {{QUERY_DESCRIPTION}} |

## Response Format

```json
{
  "data": {},
  "source": "{{SOURCE}}",
  "timestamp": "2026-03-12T00:00:00.000Z"
}
```

## Error Handling

- If the API returns a non-200 status, report the status code and body
- If the API is unreachable, report "Service unavailable" with the endpoint
- Never retry more than 3 times

## Safety Notes

- This is a read-only skill — no state changes
- API credentials (if any) must be in environment variables
- Validate response shape before passing to consumer
