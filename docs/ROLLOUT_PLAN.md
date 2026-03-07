# XmetaV Fleet Rollout Plan v2.0

## Current State (March 7, 2026)
- **Fleet**: 12 agents operational
- **Revenue**: $3.70 (26 payments, 1 unique payer)
- **Anchors**: 204 memories on Base
- **Infrastructure**: Bridge, x402, dashboard live
- **Projection**: $9.30/mo at current rate

---

## Phase 1: Foundation (Weeks 1-2) — ACTIVE

### Goals
- Stabilize core infrastructure
- Improve reliability
- Document system

### Actions
| Task | Owner | Status | Priority |
|------|-------|--------|----------|
| ✅ 12-agent fleet operational | main | DONE | P0 |
| ✅ x402 on port 4021 | midas | DONE | P0 |
| ✅ 204 anchors on Base | alchemist | DONE | P0 |
| ⏳ Verify all env files 600 | sentinel | IN PROGRESS | P0 |
| ⏳ Load Ollama hot-keep | oracle | IN PROGRESS | P1 |
| ⏳ Test /cross-chain-swap endpoint | web3dev | TODO | P1 |

### Success Metrics
- [ ] 7 days uptime (no restarts)
- [ ] <100ms bridge latency
- [ ] All agents responding to health checks

---

## Phase 2: Monetization (Weeks 3-4) — TARGET

### Goals
- Increase revenue to $50/mo
- Onboard 5+ paying customers
- Optimize pricing

### Actions
| Task | Owner | Est. Impact |
|------|-------|-------------|
| Raise /agent-task to $0.15 | midas | +50% revenue |
| Bundle /fleet-status + /intent | midas | +20% revenue |
| Enable Tailscale Funnel | oracle | Public access |
| Create pricing page | vox | Marketing |
| Submit to x402.org | basedintern | Distribution |
| List on Coinbase CDP | basedintern | Grants |

### Success Metrics
- [ ] $50 monthly revenue
- [ ] 5 unique payers
- [ ] 100 total payments

---

## Phase 3: Distribution (Weeks 5-8) — TARGET

### Goals
- Launch on Virtual Protocol
- Enable cross-chain operations
- Scale to $500/mo

### Actions
| Task | Owner | Dependencies |
|------|-------|--------------|
| Deploy CCTP bridge contract | web3dev | Phase 1 stable |
| Set up Solana RPC | oracle | Budget approval |
| Create Virtual Protocol agent | vox | Cross-chain working |
| Jupiter vault integration | midas | Solana setup |
| Launch $FLEET token | alchemist | Community demand |
| Partner with SMBs | scholar | Phase 2 revenue |

### Success Metrics
- [ ] 1st cross-chain swap successful
- [ ] Virtual Protocol launch
- [ ] $500 monthly revenue
- [ ] 25 unique payers

---

## Phase 4: Scale (Months 3-6) — TARGET

### Goals
- $5K monthly revenue
- 100+ unique payers
- Multi-chain deployment

### Actions
- Deploy on Solana native
- Add Arbitrum/Optimism support
- Enterprise API pricing
- White-label agent hosting
- VC fundraising

### Success Metrics
- [ ] $5K MRR
- [ ] 100+ customers
- [ ] 2+ chains supported

---

## Weekly Execution Plan

### Week 1 (Mar 7-14)
**Focus**: Stability
- [ ] Ollama hot-keep loaded
- [ ] All .env files 600
- [ ] Document API endpoints
- [ ] Create pricing page

### Week 2 (Mar 15-21)
**Focus**: Testing
- [ ] Test /cross-chain-swap
- [ ] Verify RLS policies
- [ ] Load test bridge (100 req/s)
- [ ] Optimize pricing

### Week 3 (Mar 22-28)
**Focus**: Distribution
- [ ] Submit to x402.org
- [ ] Apply for Base Ecosystem Fund
- [ ] Enable Tailscale Funnel
- [ ] Create landing page

### Week 4 (Mar 29-Apr 4)
**Focus**: Growth
- [ ] Launch pricing bundles
- [ ] First paying customer outreach
- [ ] X thread on memory architecture
- [ ] Virtual Protocol research

---

## Resource Requirements

### Immediate (Week 1-2)
- $0 additional cost
- Time: 10 hours setup

### Short-term (Week 3-4)
- Solana RPC: $50/mo (Helius)
- CCTP testing: ~$100 gas
- Time: 20 hours dev

### Medium-term (Month 2-3)
- Virtual Protocol: TBD
- Marketing: $500
- Time: 40 hours

---

## Risk Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| x402 competition | Medium | First-mover, 26 payments already |
| Bridge downtime | Low | Launchd auto-restart, watchdog |
| Low adoption | Medium | Virtual Protocol partnership |
| Gas spikes | Low | Base fixed 0.01 gwei |

---

## Decision Points

**Week 2**: Continue Phase 2 if:
- 7 days stable uptime
- ≥1 new paying customer

**Week 4**: Proceed Phase 3 if:
- Revenue ≥$25/mo
- Cross-chain swap tested

**Month 2**: Scale Phase 4 if:
- Virtual Protocol traction
- ≥$200/mo revenue

---

## Key Metrics Dashboard

```
Revenue:        $3.70 → $50 → $500 → $5K
Anchors:        204 → 250 → 500 → 1000
Agents:         12 → 12 → 12 → 20+
Payers:         1 → 5 → 25 → 100+
Chains:         1 (Base) → 1 → 2 → 3+
Uptime:         99% → 99.5% → 99.9% → 99.99%
```

---

## Next 48 Hours

1. **Monday**: Load Ollama hot-keep
2. **Tuesday**: Verify env permissions
3. **Wednesday**: Test /cross-chain-swap
4. **Thursday**: Enable Tailscale Funnel
5. **Friday**: Submit to x402.org
6. **Weekend**: Create pricing page

---

**Ready to execute? Pick your first priority.**
