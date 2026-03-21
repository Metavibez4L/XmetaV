# Kamino & Jupiter Integration — XmetaV x402

Full reference for the cross-chain DeFi pipeline: **Base → Solana bridge → Jupiter swap → Kamino vault → return to Base**.

---

## Architecture Overview

```
┌──────────┐     ┌───────────────┐     ┌──────────┐     ┌──────────────┐     ┌──────────┐
│  Base     │────▶│ Bridge        │────▶│ Jupiter  │────▶│ Kamino       │────▶│ Bridge   │
│  (USDC)   │     │ Base→Solana   │     │ Swap     │     │ Vault/Lend   │     │ Sol→Base │
└──────────┘     └───────────────┘     └──────────┘     └──────────────┘     └──────────┘
   x402 payment      bridge-solana.ts     jupiter-swap.ts   kamino-vault.ts     bridge-solana.ts
                                                            kamino-borrow.ts
```

The pipeline is orchestrated by `cross-chain-queue.ts` with job state tracking and optional batching. All gated endpoints are paid via x402 USDC payments on Base.

---

## Environment Variables

Every module in the x402 server reads from the same `.env` file at `dashboard/x402-server/.env`.

### Required Keys

| Variable | Used By | Description |
|----------|---------|-------------|
| `SOLANA_RPC_URL` | kamino-vault, kamino-borrow, jupiter-swap, bridge-solana | Solana mainnet RPC. Defaults to `https://api.mainnet-beta.solana.com`. **Use a private RPC (Helius, Triton) for production** to avoid rate limits. |
| `SOLANA_PRIVATE_KEY` | kamino-vault, kamino-borrow, jupiter-swap, bridge-solana | Base58-encoded Solana keypair. Signs vault deposits/withdrawals, Jupiter swaps, and bridge transactions. Must hold SOL for fees. |
| `EVM_PRIVATE_KEY` | cross-chain-queue, bridge-solana | Hex private key (`0x...`) for the Base wallet. Signs bridge initiation TXs and ERC-20 approvals on Base. |
| `BASE_RPC_URL` | cross-chain-queue, bridge-solana | Base mainnet RPC. Defaults to `https://mainnet.base.org`. Alchemy or similar recommended. |
| `SUPABASE_URL` | cross-chain-queue | Supabase project URL for job persistence. |
| `SUPABASE_SERVICE_ROLE_KEY` | cross-chain-queue | Supabase service role key for job persistence. |

### Optional Keys

| Variable | Used By | Description |
|----------|---------|-------------|
| `JUPITER_API_KEY` | jupiter-swap | Jupiter Ultra API key. Sent as `x-api-key` header on `/order` and `/execute` calls. Not required but avoids rate limits. |

### Keys Inherited from x402 Server

These are used by the broader x402 server and shared across all modules:

| Variable | Description |
|----------|-------------|
| `EVM_ADDRESS` | Server wallet address on Base (receives x402 payments). Default: `0x21fa51B40BF63E47f000eD77eC7FD018AE0ddA0B` |
| `PORT` | x402 server port. Default: `4021` |
| `NETWORK` | EVM network identifier. Default: `eip155:8453` (Base Mainnet) |
| `XMETAV_TOKEN_ADDRESS` | XMETAV ERC-20 for tier discounts. Default: `0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54` |

---

## Contract Addresses

### Base (EVM)

| Contract | Address | Purpose |
|----------|---------|---------|
| Bridge | `0x3eff766C76a1be2Ce1aCF2B69c78bCae257D5188` | Base→Solana bridging |
| Bridge Validator | `0xAF24c1c24Ff3BF1e6D882518120fC25442d6794B` | Validates bridge messages |
| Cross-Chain ERC20 Factory | `0xDD56781d0509650f8C2981231B6C917f2d5d7dF2` | Wrapped Solana tokens |
| Wrapped SOL (Base) | `0x311935Cd80B76769bF2ecC9D8Ab7635b2139cf82` | SOL representation on Base |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | Base USDC |
| XMETAV Token | `0x5b56CD209e3F41D0eCBf69cD4AbDE03fC7c25b54` | Tier discounts |
| Anchor | `0x0D1F695ea1ca6b5Ba22E3bAf6190d8553D9c4D98` | On-chain anchoring |
| Pay-To Wallet | `0x21fa51B40BF63E47f000eD77eC7FD018AE0ddA0B` | Revenue wallet |

### Solana

| Contract | Address | Purpose |
|----------|---------|---------|
| Bridge Program | `HNCne2FkVaNghhjKXapxJzPaBvAKDG1Ge3gqhZyfVWLM` | Solana-side bridge |
| Base Relayer | `g1et5VenhfJHJwsdJsDbxWZuotD5H4iELNG61kS4fb9` | Relays bridge proofs |
| USDC Mint | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | Solana USDC |
| SOL Mint | `So11111111111111111111111111111111111111112` | Native SOL (wrapped) |
| Jupiter Program | `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` | Swap routing |
| Kamino Lend (mainnet) | `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD` | Lending protocol |
| Kamino Vaults (mainnet) | `KvauGMspG5k6rtzrqqn7WNn3oZdyKqLKwK2XWQ8FLjd` | Vault protocol |

---

## Modules

### 1. Jupiter Swap — `jupiter-swap.ts`

Token swaps on Solana via [Jupiter Ultra API](https://docs.jup.ag/docs/ultra-api). Ultra is RPC-less: Jupiter manages execution, we just sign.

**Flow:**
1. `GET /ultra/v1/order` — request a swap quote with our pubkey as taker
2. Deserialize the returned `VersionedTransaction`, sign with `SOLANA_PRIVATE_KEY`
3. `POST /ultra/v1/execute` — Jupiter submits, confirms, and retries the TX

**Supported Tokens:**

| Token | Mint |
|-------|------|
| SOL | `So11111111111111111111111111111111111111112` |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| BONK | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` |
| JUP | `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN` |

**Key Functions:**

| Function | Description |
|----------|-------------|
| `getJupiterOrder(inputMint, outputMint, amount, slippageBps?)` | Request swap order from Ultra API |
| `executeJupiterOrder(order)` | Sign & execute the swap via Ultra |
| `getSwapQuote(inputMint, outputMint, amount)` | Get quote without executing |
| `swapOnJupiter(amountUsdc, outputToken)` | Full USDC→token swap (convenience wrapper) |

**API Endpoints:**

| Endpoint | Description |
|----------|-------------|
| `https://api.jup.ag/ultra/v1/order` | Request swap order |
| `https://api.jup.ag/ultra/v1/execute` | Execute signed swap |

---

### 2. Kamino Vaults — `kamino-vault.ts`

Earn yield on idle USDC/SOL via Kamino Earn Vaults. SDK-first for reads, API-first for deposit/withdraw transactions.

**SDK:** `@kamino-finance/klend-sdk` with `@solana/kit` v2 RPC types (cast via `as any` at boundaries).

**Known Vaults:**

| ID | Name | Address | Token | Est. APY |
|----|------|---------|-------|----------|
| `USDC_MAIN` | Kamino USDC Main Vault | `HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E` | USDC | ~8.5% |
| `SOL_MAIN` | Kamino SOL Main Vault | `DcCRSdUMgAt6ZMeuL4BJAsZmJgND2LQd74Zq4z6ckhpg` | SOL | ~8.6% |

**Key Functions:**

| Function | Description |
|----------|-------------|
| `getVaultDetails(vaultKey)` | SDK: APY, holdings, exchange rate, allocations |
| `getUserVaultShares(walletAddress?)` | SDK: user share balance for a specific vault |
| `getUserPositions(walletAddress?)` | SDK: user positions across all known vaults |
| `depositToVault(vaultAddress, amount, tokenMint)` | API fallback: deposit via KTX endpoint |
| `withdrawFromVault(vaultAddress, shares)` | API fallback: withdraw via KTX endpoint |
| `depositUsdcToKamino(amountUsdc)` | Convenience: deposit USDC into main vault |
| `withdrawUsdcFromKamino(shares)` | Convenience: withdraw from USDC vault |
| `listVaults()` | SDK/API: list all available vaults with state data |

**Caching:** Vault SDK objects cached for 1 minute (`CACHE_TTL = 60_000`).

---

### 3. Kamino Borrow/Lend — `kamino-borrow.ts`

Full lending market operations against Kamino's main market using `KaminoMarket` and `KaminoAction` from the klend-sdk.

**Main Market:** `7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF`
**Program ID:** klend-sdk's `PROGRAM_ID` constant
**Slot Duration:** 400ms

**Key Functions:**

| Function | Description |
|----------|-------------|
| `getMarketOverview()` | All reserves with deposit/borrow TVL, APYs, utilization |
| `getUserObligation(walletAddress?)` | LTV, deposits, borrows, health factor |
| `depositCollateral(tokenMint, amount)` | Deposit collateral (SDK → API fallback) |
| `borrowAsset(tokenMint, amount)` | Borrow against collateral |
| `repayLoan(tokenMint, amount)` | Repay outstanding borrow |
| `withdrawCollateral(tokenMint, amount)` | Withdraw collateral |

**Caching:** Market object cached for 1 minute (`MARKET_CACHE_TTL = 60_000`).

---

### 4. Bridge — `bridge-solana.ts`

Handles USDC bridging between Base and Solana using the native Base-Solana bridge (not CCTP/Wormhole).

**Bridge Flow (Base→Solana):**
1. Approve USDC spend to bridge contract
2. Call `bridgeToken()` on Base bridge contract
3. Wait for finalization + Merkle proof
4. Execute on Solana side

**Bridge Flow (Solana→Base):**
1. Lock SOL/SPL on Solana
2. Validators approve
3. Mint on Base

**Key Functions:**

| Function | Description |
|----------|-------------|
| `bridgeUsdcToSolana(amount)` | Initiate Base→Solana USDC bridge |
| `checkBridgeArrival(jobId)` | Poll Solana for bridge completion |
| `bridgeBackToBase(amount)` | Initiate Solana→Base return bridge |

---

### 5. Cross-Chain Queue — `cross-chain-queue.ts`

Orchestrates the full pipeline with job state tracking, batching for small amounts, retry logic, and Supabase persistence.

**Job Lifecycle (13 states):**
```
pending → batched → bridging_to_sol → bridged → swapping → swapped
  → depositing → vaulted → withdrawing → bridging_to_base → anchoring → completed
                                                                      → failed
```

**Batching Logic:**
- Amounts below `$6.50` get batched together (up to 10 jobs)
- Batch timeout: 1 hour max wait
- Amounts ≥ `$6.50` execute immediately
- Bridge fees amortized across batch size

**Retry Strategy:**
- 3 max retries per operation
- Backoff delays: 1 min → 5 min → 10 min
- Bridge timeout: 30 minutes

**Key Functions:**

| Function | Description |
|----------|-------------|
| `createJob(params)` | Create new cross-chain job |
| `addToBatch(jobId)` | Add job to pending batch |
| `executeJobDirect(jobId)` | Execute immediately (skip batching) |
| `processReturn(jobId)` | Trigger return bridge Solana→Base |
| `getJob(jobId)` | Get job status |
| `getQueueStats()` | Batch queue statistics |
| `loadJobsFromDb()` | Restore jobs from Supabase on startup |

---

## x402 Endpoints & Pricing

### Gated (Paid)

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /cross-chain-swap` | $0.65 | Initiate Base→Solana→Jupiter→optional Kamino swap |
| `GET /bridge-status/:jobId` | $0.05 | Check cross-chain job status |
| `POST /trigger-return/:jobId` | $0.25 | Trigger return bridge Solana→Base |
| `POST /kamino/deposit` | $0.15 | Deposit tokens into Kamino vault |
| `POST /kamino/withdraw` | $0.15 | Withdraw tokens from Kamino vault |
| `GET /kamino/obligation` | $0.05 | User lending obligation (LTV, deposits, borrows) |
| `POST /kamino/deposit-collateral` | $0.20 | Deposit collateral into lending market |
| `POST /kamino/borrow` | $0.20 | Borrow assets against collateral |
| `POST /kamino/repay` | $0.15 | Repay a loan |
| `POST /kamino/withdraw-collateral` | $0.20 | Withdraw collateral from lending market |

### Free (No Payment)

| Endpoint | Description |
|----------|-------------|
| `POST /cross-chain-swap/quote` | Estimate output and fees |
| `GET /cross-chain/queue` | Batch queue stats |
| `GET /cross-chain/vaults` | Available Kamino vaults (full SDK state) |
| `GET /kamino/vault-details?vault=USDC_MAIN` | Live vault data — APY, holdings, exchange rate |
| `GET /kamino/positions` | User vault positions across all vaults |
| `GET /kamino/market` | Lending market overview — TVL, reserves, APYs |

---

## Safety Limits

| Parameter | Value | Source |
|-----------|-------|--------|
| Min payment | $0.65 USDC | `SAFETY.minPayment` |
| Max single bridge | $500 USDC | `SAFETY.maxSingleBridge` |
| Batch threshold | $6.50 (10 × $0.65) | `SAFETY.minBatchThreshold` |
| Batch timeout | 1 hour | `SAFETY.batchCollectTimeout` |
| Max slippage | 0.5% (50 bps) | `SAFETY.slippageBps` |
| Max price impact | 1.0% | `SAFETY.maxPriceImpact` |
| Max retries | 3 | `SAFETY.maxRetries` |
| Retry delays | 1m, 5m, 10m | `SAFETY.retryDelays` |
| Bridge timeout | 30 minutes | `SAFETY.bridgeTimeout` |
| Emergency pause | `false` | `SAFETY.emergencyPause` |

---

## Fee Estimates (On-Chain Costs)

| Operation | Estimated Cost |
|-----------|---------------|
| Bridge Base→Solana | $0.50 |
| Jupiter swap | $0.01 |
| Kamino deposit | $0.01 |
| Bridge Solana→Base | $0.50 |
| Anchor gas (Base) | $0.0001 |

Batching reduces bridge costs proportionally (e.g., 5 jobs in a batch = $0.10 bridge cost each).

---

## Example: Full Cross-Chain Swap Request

```bash
# Swap $10 USDC from Base → SOL on Solana, deposit into Kamino vault
curl -X POST http://localhost:4021/cross-chain-swap \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "10.00",
    "targetChain": "solana",
    "outputToken": "SOL",
    "vaultStrategy": "kamino",
    "returnToBase": false
  }'
```

**Response:**
```json
{
  "jobId": "abc-123",
  "status": "pending",
  "estimatedCompletion": "~5 minutes",
  "breakdown": {
    "payment": 10.00,
    "estimatedFees": {
      "bridgeToSolana": 0.50,
      "jupiterSwap": 0.01,
      "kaminoDeposit": 0.01,
      "bridgeToBase": 0,
      "total": 0.52
    },
    "estimatedOutput": 9.48,
    "estimatedMargin": "94.8%"
  },
  "batched": false,
  "batchId": null
}
```

---

## Example: Direct Kamino Vault Operations

```bash
# Check current vault APY and holdings
curl 'http://localhost:4021/kamino/vault-details?vault=USDC_MAIN'

# Check lending market overview
curl http://localhost:4021/kamino/market

# Deposit into vault (x402-gated, $0.15)
curl -X POST http://localhost:4021/kamino/deposit \
  -H "Content-Type: application/json" \
  -d '{"vault": "USDC_MAIN", "amount": "100.00"}'

# Borrow against collateral (x402-gated, $0.20)
curl -X POST http://localhost:4021/kamino/borrow \
  -H "Content-Type: application/json" \
  -d '{"tokenMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "amount": "50.00"}'
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `@kamino-finance/klend-sdk` | Vault reads, market data, lending actions |
| `@solana/kit` | v2 Solana RPC (required by klend-sdk) |
| `@solana/web3.js` | Connection, Keypair, transaction signing |
| `@solana/spl-token` | SPL token account lookups |
| `viem` | Base EVM client (bridge, ERC-20 interactions) |
| `bs58` | Solana private key decoding |
| `decimal.js` | Precision math for token amounts |
| `@supabase/supabase-js` | Job persistence |

---

## File Map

| File | Purpose |
|------|---------|
| `cross-chain-types.ts` | Shared types, contract addresses, APIs, safety config, fee estimates |
| `cross-chain-routes.ts` | Express router — all endpoints, validation, pricing |
| `cross-chain-queue.ts` | Job orchestration, batching, retry, Supabase persistence |
| `jupiter-swap.ts` | Jupiter Ultra API integration (order → sign → execute) |
| `kamino-vault.ts` | Kamino Earn Vaults — SDK reads + API deposit/withdraw |
| `kamino-borrow.ts` | Kamino lending market — collateral, borrow, repay |
| `bridge-solana.ts` | Base↔Solana bridge (native, not CCTP) |
