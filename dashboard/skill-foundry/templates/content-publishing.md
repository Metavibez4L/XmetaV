---
name: {{NAME}}
description: {{DESCRIPTION}}
user-invocable: true
disable-model-invocation: false
allowed-tools: ["Bash(curl *)"]
---

# {{NAME}}

**Category:** media | **Risk:** low

{{DESCRIPTION}}

## Prerequisites

Ensure publishing credentials are configured in environment variables.

## Publishing Flow

1. Format content according to platform requirements
2. Validate content length and format
3. POST to publishing endpoint
4. Confirm publication and return URL

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `content` | string | yes | Content body to publish |
| `channel` | string | yes | Target channel or platform |
| `format` | string | no | Content format: text, markdown, html (default: text) |

## Response Format

```json
{
  "published": true,
  "url": "https://...",
  "platform": "{{PLATFORM}}",
  "timestamp": "2026-03-12T00:00:00.000Z"
}
```

## Safety Notes

- Rate-limit publishing to prevent spam (max 10 posts/hour)
- Validate content length before publishing (max 4000 chars)
- Never publish content containing private keys, credentials, or PII
- Log all publications for audit trail
