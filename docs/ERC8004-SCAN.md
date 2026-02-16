# ERC-8004 Agent Registry — Scan Results

**Scanned:** 2026-02-13
**Contract:** `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (Base Mainnet)

## Summary

| Metric | Value |
|--------|-------|
| Total registered | ~9 agents (more may exist with empty URIs) |
| With full metadata | 5 |
| Confirmed active | 5 |
| x402-enabled | 0 |
| Olas platform | 4 agents |
| ClawNews platform | 1 agent |
| OpenClaw / XmetaV | 1 agent (#16905, metadata pending) |

## Registered Agents

| ID | Name | Platform | Status | x402 | Metadata |
|----|------|----------|--------|------|----------|
| #1 | ClawNews | ClawNews | Active | No | Inline JSON (base64) |
| #14 | doyi-benyel45 | Olas | Active | No | HTTP URL |
| #15 | tustel-gogil00 | Olas | Active | No | HTTP URL |
| #21 | harar-kanot30 | Olas | Active | No | HTTP URL |
| #22 | wazi-yelkim50 | Olas | Active | No | HTTP URL |
| #16719 | (unknown) | — | ? | ? | No URI |
| #16720 | (unknown) | — | ? | ? | No URI |
| #16902 | (unknown) | — | ? | ? | No URI |
| #16903 | (unknown) | — | ? | ? | No URI |
| #16905 | **XmetaV** | OpenClaw | Active | Pending | **No URI (ours)** |

## Agent Details

### #1 — ClawNews (most complete)

- **Type:** `erc8004:agent-registration:1.0`
- **Services:** 4
  1. Web: https://clawnews.io
  2. OASF: https://github.com/agntcy/oasf/
  3. Agent Wallet: `eip155:8453:0x89E9E1ab11dD1B138b1dcE6d6A4a0926aaFD5029`
  4. Email: hello@clawnews.io
- **Skills:** NLP search, summarization, text classification, document retrieval, agent coordination, quality evaluation
- **Domains:** Media/news, AI, blockchain, API integration
- **Supported Trust:** reputation

### Olas Network Agents (#14, #15, #21, #22)

- All active, no x402 support
- Single service each
- #14, #15 — memecoin deployers
- #21, #22 — Contribute participants

### Unregistered / Empty (#16719, #16720, #16902, #16903)

- No `tokenURI` set
- May be reserved IDs or incomplete registrations

### #16905 — XmetaV (ours)

- Registered 2026-02-12
- Owner: `0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80`
- **tokenURI not yet set** — needs `setAgentURI()` call

## Action: Set XmetaV Metadata

```bash
cd dashboard/erc8004
npx tsx update-uri.ts
# defaults to raw GitHub URL for metadata.json
# or pass a custom URI:
# npx tsx update-uri.ts "https://example.com/metadata.json"
```

This calls `setAgentURI(16905, uri)` on-chain, making XmetaV discoverable in the registry.
