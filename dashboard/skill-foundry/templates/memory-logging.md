---
name: {{NAME}}
description: {{DESCRIPTION}}
user-invocable: true
disable-model-invocation: false
allowed-tools: ["Read(*)", "Write(*)"]
---

# {{NAME}}

**Category:** memory | **Risk:** low

{{DESCRIPTION}}

## Storage Backend

This skill uses the agent workspace filesystem for storage.
All keys are scoped to: `{{WORKSPACE}}/memory/{{NAMESPACE}}/`

## Operations

### Store

```bash
echo '{{VALUE}}' > "{{WORKSPACE}}/memory/{{NAMESPACE}}/{{KEY}}.json"
```

### Retrieve

```bash
cat "{{WORKSPACE}}/memory/{{NAMESPACE}}/{{KEY}}.json"
```

### List

```bash
ls "{{WORKSPACE}}/memory/{{NAMESPACE}}/"
```

## Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `key` | string | yes | Memory key / identifier |
| `value` | string | no | Value to store (for write operations) |
| `namespace` | string | no | Storage namespace (default: "default") |
| `operation` | string | yes | One of: store, retrieve, list, delete |

## Response Format

```json
{
  "stored": true,
  "key": "my-key",
  "namespace": "default"
}
```

## Safety Notes

- Never store secrets, passwords, or private keys
- Scope all keys to prevent cross-agent collisions
- Validate key format — alphanumeric + hyphens only
- Maximum value size: 1MB
