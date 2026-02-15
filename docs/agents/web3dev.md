# Agent: `web3dev` — Blockchain Developer

## Overview

Web3Dev is the fleet's hands-on blockchain engineer. While `alchemist` analyzes token economics and `oracle` watches the markets, web3dev **writes, tests, audits, and deploys** the on-chain infrastructure. Solidity is its native language, Hardhat is its power tool.

## Purpose

> Build and ship smart contracts. Tests first, deploy second.

## EthSkills (10 installed)

| Skill | Description |
|-------|-------------|
| `tools` | Hardhat, Foundry, Tenderly, Etherscan verification |
| `l2s` | L2 ecosystem: Arbitrum, Optimism, Base, zkSync, Scroll, Linea |
| `orchestration` | Multi-contract deploy scripts, upgrade patterns, proxy factories |
| `addresses` | Checksum, CREATE2 vanity, EIP-3770 chain-prefixed addresses |
| `concepts` | Core EVM concepts: gas, nonce, logs, storage, ABI encoding |
| `security` | Reentrancy, flash loans, oracle manipulation, access control |
| `standards` | ERC-20, ERC-721, ERC-1155, ERC-2612, ERC-4626, EIP-712 |
| `frontend-ux` | Wallet connection, transaction UX, error handling, mobile |
| `frontend-playbook` | wagmi/viem integration, RainbowKit, WalletConnect |
| `building-blocks` | OpenZeppelin patterns, diamond proxy, minimal proxy |

Installed at `~/.openclaw/workspace/skills/`. Verify: `openclaw skills list`

## Responsibilities

| Duty | Description |
|------|-------------|
| **Contract Dev** | Write Solidity contracts using OpenZeppelin, EIP standards, Base patterns |
| **Compilation** | `npx hardhat compile` across all projects, catch regressions |
| **Testing** | `npx hardhat test` with gas reporting |
| **Security Audit** | Static analysis for reentrancy, tx.origin, selfdestruct, access control gaps |
| **Gas Optimization** | Bytecode size analysis, storage packing, calldata patterns |
| **Deployment** | Deploy to Base Mainnet/Sepolia, verify on BaseScan |
| **Scaffolding** | Generate contract templates (ERC-20, ERC-721, staking, vesting, escrow) |
| **x402 Maintenance** | Extend the x402 payment server, pricing, Coinbase Facilitator |

## Projects Owned

| Project | Path | Stack | Contracts |
|---------|------|-------|-----------|
| Akua | `/home/manifest/akua` | Hardhat + Foundry, 0.8.24 | 18 (core, market, tokens, oracle, factory) |
| $XMETAV | `~/XmetaV/dashboard/token` | Hardhat, 0.8.20 | 1 (ERC-20, 1B supply) |
| BasedIntern | `~/basedintern/based-intern` | Hardhat, 0.8.20 | 2 (token, ERC-8004) |
| x402 Server | `~/XmetaV/dashboard/x402-server` | Express, @x402/*, viem | Payment-gated API |
| Bridge | `~/XmetaV/dashboard/bridge` | @x402/*, viem | Bridge daemon |
| ERC-8004 | `~/XmetaV/dashboard/erc8004` | viem | Identity scripts |

## Commands

| Command | What It Does |
|---------|-------------|
| `web3dev compile [project]` | Compile Hardhat projects (akua, token, basedintern, all) |
| `web3dev test [project]` | Run Hardhat tests |
| `web3dev audit [project]` | Static security audit (reentrancy, tx.origin, pragmas, etc.) |
| `web3dev gas [project]` | Contract bytecode size analysis vs 24KB limit |
| `web3dev scaffold <type> <name>` | Generate template (erc20, erc721, staking, vesting, escrow) |
| `web3dev status` | Quick health: compile status, artifact presence, contract counts |
| `web3dev report` | Full report -> `WEB3DEV.md` (status + audit + gas) |

## Schedule

| Interval | Task | Command |
|----------|------|---------|
| Every 12h | Status check | `web3dev-agent.sh --status` |
| Weekly (Mon 6 AM) | Full audit + report | `web3dev-agent.sh --report` |
| On demand | Any specific task | `web3dev.sh <command>` |

### Cron Setup

```bash
# Status check every 12 hours
0 */12 * * * /home/manifest/XmetaV/scripts/web3dev-agent.sh --status >> /tmp/web3dev.log 2>&1

# Weekly audit + report
0 6 * * 1 /home/manifest/XmetaV/scripts/web3dev-agent.sh --report >> /tmp/web3dev.log 2>&1
```

## Deployed Contracts (Base Mainnet)

| Contract | Address |
|----------|---------|
| $XMETAV Token | `0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54` |
| ERC-8004 Registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| Agent Wallet | `0x4Ba6B07626E6dF28120b04f772C4a89CC984Cc80` |

## Files

| File | Purpose |
|------|---------|
| `~/.openclaw/workspace/WEB3DEV.md` | Rolling build/audit report (overwritten each cycle) |
| `~/.openclaw/workspace/skills/web3dev/web3dev.sh` | Main skill script |
| `~/XmetaV/scripts/web3dev-agent.sh` | Cron-compatible runner |
| `~/web3dev/IDENTITY.md` | Agent identity and principles |

## Integration with Fleet

- **`main`** dispatches contract tasks: "build staking contract", "deploy to sepolia"
- **`alchemist`** provides tokenomics parameters for contract design
- **`oracle`** advises on gas timing for deployments
- **`akua`** owns the Akua contract repo — web3dev compiles/tests/audits it
- **`basedintern`** owns the BasedIntern repo — web3dev handles its Solidity

## Security Audit Checks

| Check | Severity | Description |
|-------|----------|-------------|
| `.call{}` | WARN | Low-level call — reentrancy risk |
| `tx.origin` | CRITICAL | Phishing vulnerability |
| `selfdestruct` | WARN | Deprecated in newer EVM |
| Floating pragma | INFO | `^0.8.x` — consider pinning |
| No access modifiers | INFO | Public functions without onlyOwner/etc. |
| `assembly {}` | INFO | Inline assembly — manual review needed |
| `delegatecall` | WARN | Storage collision risk |

## Contract Templates

`web3dev scaffold` generates production-ready Solidity using OpenZeppelin:

| Template | Features |
|----------|----------|
| **erc20** | Ownable, mint function, constructor with initial supply |
| **erc721** | Ownable, safeMint with auto-incrementing IDs |
| **staking** | ReentrancyGuard, reward distribution, per-token accounting |
| **vesting** | Linear vesting with cliff, immutable beneficiary |
| **escrow** | Buyer/seller/arbiter, fund/release/refund lifecycle |

## Operating Principles

1. **Tests first, deploy second** — no unverified code hits mainnet
2. **Gas is money** — optimize storage, batch ops, use calldata
3. **OpenZeppelin over homebrew** — use audited libraries
4. **Verify everything** — every deploy gets BaseScan verification
5. **Immutable means forever** — triple-check before on-chain
6. **Document addresses** — every deployment logged with tx hash, block, network

## Arena

- **Color**: Orange (`#f97316`)
- **Room**: DEV FLOOR (open area)
- **Meeting seat**: 0 degrees (right center)
- **Connections**: main, akua, basedintern

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `WEB3DEV.md` not updating | Check cron, verify `web3dev-agent.sh` is executable |
| "no node_modules" warning | Run `npm install` in that project directory |
| "not compiled" warning | Run `web3dev compile <project>` |
| Audit false positives | Static analysis isn't perfect — `.call{}` in `MultisigWallet` is intentional |
| Contract over 24KB | Split into libraries, use proxy pattern, or remove debug code |
