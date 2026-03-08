# Kamino Finance API Integration Guide

> Comprehensive documentation for integrating with Kamino Finance vaults, lending markets, and yield strategies on Solana.

**Last Updated:** March 8, 2026  
**Source:** https://kamino.com/docs  
**SDK Version:** @kamino-finance/klend-sdk (latest)

---

## Table of Contents

1. [Overview](#overview)
2. [Program Addresses](#program-addresses)
3. [SDK Installation & Setup](#sdk-installation--setup)
4. [Vault Deposit/Withdrawal API](#vault-depositwithdrawal-api)
5. [Yield APY Data Endpoints](#yield-apy-data-endpoints)
6. [Borrow Market Operations](#borrow-market-operations)
7. [CPI Integration for Solana Programs](#cpi-integration-for-solana-programs)
8. [Automated Deposit Example](#automated-deposit-example)
9. [Transaction Costs & Estimates](#transaction-costs--estimates)
10. [Resources & Links](#resources--links)

---

## Overview

Kamino Finance is the largest borrowing and lending protocol on Solana, offering:

- **Earn Vaults (K-Vaults)** - Curated yield vaults that distribute capital across multiple K-Lend reserves
- **Borrow/Lend (K-Lend)** - Lending markets with collateral support
- **Multiply** - One-click leveraged yield vaults
- **Liquidity Vaults** - Automated concentrated liquidity strategies

Developers can integrate via **REST API** (language-agnostic) or **TypeScript SDK** (full on-chain control).

### Base URLs

- **REST API:** `https://api.kamino.finance`
- **Transaction API (KTX):** `https://api.kamino.finance/ktx`
- **OpenAPI Spec (Data):** https://api.kamino.finance/openapi/json?openapi=3.0.0
- **OpenAPI Spec (Transactions):** https://api.kamino.finance/ktx/documentation/json

---

## Program Addresses

### Mainnet Programs

| Program | Address |
|---------|---------|
| **Kamino Lend** | `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD` |
| **Kamino Vaults** | `KvauGMspG5k6rtzrqqn7WNn3oZdyKqLKwK2XWQ8FLjd` |
| **Kamino Farms** | `FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr` |
| **Kamino Limit Orders** | `LiMoM9rMhrdYrfzUCxQppvxCSG1FcrUK9G8uLq4A1GF` |
| **Kamino Scope** | `HFn8GnPADiny6XqUoWE8uRPPxb29ikn4yTuPa9MF2fWJ` |
| **Kamino Liquidity** | `6LtLpnUFNByNXLyCoK9wA2MykKAmQNZKBdY8s47dehDc` |

### Staging (Mainnet)

| Program | Address |
|---------|---------|
| **Kamino Lend** | `SLendK7ySfcEzyaFqy93gDnD3RtrpXJcnRwb6zFHJSh` |
| **Kamino Vaults** | `stKvQfwRsQiKnLtMNVLHKS3exFJmZFsgfzBPWHECUYK` |
| **Kamino Limit Orders** | `sLim6uuAFC8kAWstWpu1r6oJD4T8VR6raukSpU2Zim7` |
| **Kamino Scope** | `scpStzYvKzE7DHwsGMP5XLhcMTuLr3feoiC9mJ3yHr5` |

### Devnet

| Program | Address |
|---------|---------|
| **Kamino Vaults** | `devkRngFnfp4gBc5a3LsadgbQKdPo8MSZ4prFiNSVmY` |
| **Kamino Farms** | `FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr` |

### Example Vault Addresses

- **USDC Vault:** `HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E`
- **Main Borrow Market:** `7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF`

---

## SDK Installation & Setup

### Install Dependencies

```bash
npm install @kamino-finance/klend-sdk @solana/kit
```

Optional additional packages:

```bash
# For KSwap routing (multiply, repay-with-collateral)
npm install @kamino-finance/kswap-sdk

# For oracle prices (multiply)
npm install @kamino-finance/scope-sdk

# For farm rewards (APY calc, claim)
npm install @kamino-finance/farms-sdk

# For address lookup tables
npm install @solana-program/address-lookup-table
```

### Import Required Packages

```typescript
import { createSolanaRpc, address, generateKeyPairSigner } from '@solana/kit';
import { KaminoVault, KaminoMarket, KaminoAction, VanillaObligation } from '@kamino-finance/klend-sdk';
import { Decimal } from 'decimal.js';
import BN from 'bn.js';
```

### Initialize RPC Connection

```typescript
const rpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
const rpcSubscriptions = createSolanaRpcSubscriptions('wss://api.mainnet-beta.solana.com');
```

**Note:** Use a private RPC (e.g., Helius) for production to avoid rate limits and transaction failures.

---

## Vault Deposit/Withdrawal API

### SDK Method: Deposit to Vault

```typescript
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  address,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  sendAndConfirmTransactionFactory,
  getSignatureFromTransaction,
} from '@solana/kit';
import { KaminoVault } from '@kamino-finance/klend-sdk';
import { parseKeypairFile } from '@kamino-finance/klend-sdk/dist/utils/signer.js';
import { Decimal } from 'decimal.js';

// Load signer
const KEYPAIR_FILE = '/path/to/your/keypair.json';
const signer = await parseKeypairFile(KEYPAIR_FILE);

// Initialize RPC
const rpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
const rpcSubscriptions = createSolanaRpcSubscriptions('wss://api.mainnet-beta.solana.com');

// Initialize vault instance
const vault = new KaminoVault(
  rpc,
  address('HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E') // USDC vault
);

// Build deposit instructions
const depositAmount = new Decimal(100.0); // 100 USDC
const bundle = await vault.depositIxs(signer, depositAmount);
const instructions = [...(bundle.depositIxs || [])];

// Build and sign transaction
const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

const transactionMessage = pipe(
  createTransactionMessage({ version: 0 }),
  (tx) => setTransactionMessageFeePayerSigner(signer, tx),
  (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
  (tx) => appendTransactionMessageInstructions(instructions, tx)
);

const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
const signature = getSignatureFromTransaction(signedTransaction);

// Send and confirm
await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
  commitment: 'confirmed',
  skipPreflight: true,
});

console.log('Deposit successful! Signature:', signature);
```

### SDK Method: Withdraw from Vault

```typescript
// Initialize vault (same as above)
const vault = new KaminoVault(
  rpc,
  address('HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E')
);

// Build withdraw instructions
const withdrawAmount = new Decimal(50.0); // 50 vault shares (not tokens)
const bundle = await vault.withdrawIxs(signer, withdrawAmount);
const instructions = [
  ...(bundle.unstakeFromFarmIfNeededIxs || []),
  ...(bundle.withdrawIxs || [])
];

// Build, sign, and send transaction (same pattern as deposit)
// ... transaction building code ...
```

**Note:** Withdraw amount represents **vault shares**, not underlying tokens.

### REST API Method: Deposit

```typescript
const API_BASE_URL = 'https://api.kamino.finance';

// Build deposit transaction via API
const response = await fetch(`${API_BASE_URL}/ktx/kvault/deposit`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    wallet: signer.address,
    kvault: 'HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E',
    amount: '100.0',
  }),
});

if (!response.ok) {
  const error = await response.json();
  throw new Error(`API error: ${error.message}`);
}

const { transaction: encodedTransaction } = await response.json();

// Decode and sign the transaction
const txBuffer = Buffer.from(encodedTransaction, 'base64');
const txMessageBytes = getTransactionDecoder().decode(txBuffer).messageBytes;
const compiledMessage = getCompiledTransactionMessageDecoder().decode(txMessageBytes);

// Resolve lookup tables and sign
const { value: latestBlockhash } = await rpc.getLatestBlockhash({ commitment: 'finalized' }).send();

const signedTransaction = await pipe(
  await decompileTransactionMessageFetchingLookupTables(compiledMessage, rpc),
  (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
  (tx) => setTransactionMessageFeePayerSigner(signer, tx),
  (tx) => addSignersToTransactionMessage([signer], tx),
  (tx) => signTransactionMessageWithSigners(tx)
);

// Send transaction
await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
  commitment: 'confirmed',
  skipPreflight: true,
});
```

### REST API Method: Withdraw

```typescript
const response = await fetch(`${API_BASE_URL}/ktx/kvault/withdraw`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    wallet: signer.address,
    kvault: 'HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E',
    amount: '50.0',
  }),
});

// Same decode and sign process as deposit
```

### REST API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /ktx/kvault/deposit` | POST | Build unsigned deposit transaction |
| `POST /ktx/kvault/deposit-instructions` | POST | Get deposit instructions with lookup tables |
| `POST /ktx/kvault/withdraw` | POST | Build unsigned withdraw transaction |
| `POST /ktx/kvault/withdraw-instructions` | POST | Get withdraw instructions with lookup tables |

---

## Yield APY Data Endpoints

### SDK Method: Get Vault APY

```typescript
import { KaminoVault } from '@kamino-finance/klend-sdk';
import { createSolanaRpc, address } from '@solana/kit';

const vault = new KaminoVault(
  createSolanaRpc('https://api.mainnet-beta.solana.com'),
  address('HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E')
);

// Get current APYs
const apys = await vault.getAPYs();
console.log('Vault APYs:', apys);

// Get exchange rate
const rate = await vault.getExchangeRate();
console.log('Exchange Rate:', rate.toString());

// Get user shares
const user = address('EZC9wzVCvihCsCHEMGADYdsRhcpdRYWzSCZAVegSCfqY');
const shares = await vault.getUserShares(user);
console.log('User Shares:', {
  shares: shares.totalShares.toString(),
  tokens: shares.totalShares.mul(rate).toString(),
});
```

### REST API: Get Vault Metrics

```typescript
const API_BASE_URL = 'https://api.kamino.finance';

// Get current vault metrics
const response = await fetch(
  `${API_BASE_URL}/kvaults/vaults/HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E/metrics`
);
const metrics = await response.json();
console.log('Vault Metrics:', {
  apy: metrics.apy,
  tvl: metrics.tvl,
  utilization: metrics.utilization,
});

// Get historical metrics
const historyResponse = await fetch(
  `${API_BASE_URL}/kvaults/vaults/HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E/metrics/history`
);
const history = await historyResponse.json();
```

### REST API: Get Market Reserve APY

```typescript
// Get current reserve metrics
const marketPubkey = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';
const reservePubkey = 'd4A2prbA2whesmvHaL88BH6Ewn5N4bTSU2Ze8P6Bc4Q';

// Current metrics
const metricsResponse = await fetch(
  `${API_BASE_URL}/kamino-market/${marketPubkey}/reserves/${reservePubkey}/metrics`
);
const metrics = await metricsResponse.json();

// Historical metrics
const historyResponse = await fetch(
  `${API_BASE_URL}/kamino-market/${marketPubkey}/reserves/${reservePubkey}/metrics/history`
);
const { history } = await historyResponse.json();

for (const item of history) {
  console.log({
    timestamp: item.timestamp,
    symbol: item.metrics.symbol,
    supplyInterestAPY: item.metrics.supplyInterestAPY,
    borrowInterestAPY: item.metrics.borrowInterestAPY,
    depositTvl: item.metrics.depositTvl,
    borrowTvl: item.metrics.borrowTvl,
  });
}
```

### SDK Method: Get Reserve APY

```typescript
import { KaminoMarket } from '@kamino-finance/klend-sdk';
import { createSolanaRpc, address } from '@solana/kit';

const slotDuration = 400; // ms
const rpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
const marketPubkey = address('7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF');
const market = await KaminoMarket.load(rpc, marketPubkey, slotDuration);

const slot = await rpc.getSlot().send();

for (const reserve of market!.getReserves()) {
  console.log(`Reserve ${reserve.symbol}:`);
  console.log(`  Deposit TVL: ${reserve.getDepositTvl().toFixed(2)}`);
  console.log(`  Borrow TVL: ${reserve.getBorrowTvl().toFixed(2)}`);
  console.log(`  Borrow APY: ${reserve.totalBorrowAPY(slot)}%`);
  console.log(`  Supply APY: ${reserve.totalSupplyAPY(slot)}%`);
  console.log(`  Utilization: ${reserve.calculateUtilizationRatio()}%`);
}
```

### REST API Data Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /kvaults/vaults` | List all Kamino Earn vaults |
| `GET /kvaults/vaults/{pubkey}` | Get single vault by address |
| `GET /kvaults/vaults/{pubkey}/metrics` | Current vault metrics (APY, TVL, utilization) |
| `GET /kvaults/vaults/{pubkey}/metrics/history` | Historical vault metrics |
| `GET /v2/kamino-market` | All Kamino Lending markets |
| `GET /kamino-market/{pubkey}/reserves/metrics` | Current reserve metrics (APY, TVL, LTV) |
| `GET /kamino-market/{marketPubkey}/reserves/{reservePubkey}/metrics/history` | Historical reserve metrics |
| `GET /v2/staking-yields` | Latest staking yields for all LSTs |
| `GET /yields/{yieldSource}/history` | Historical yield data |
| `GET /oracles/prices` | All oracle prices for Klend market assets |

---

## Borrow Market Operations

### Deposit Collateral

```typescript
import { KaminoMarket, KaminoAction, VanillaObligation, PROGRAM_ID } from '@kamino-finance/klend-sdk';
import BN from 'bn.js';

const rpc = createSolanaRpc('https://api.mainnet-beta.solana.com');
const market = await KaminoMarket.load(
  rpc,
  address('7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF'),
  400
);

const depositMint = address('So11111111111111111111111111111111111111112'); // SOL
const depositAmount = new BN(1_000_000_000); // 1 SOL

const depositAction = await KaminoAction.buildDepositTxns(
  market,
  depositAmount,
  depositMint,
  signer,
  new VanillaObligation(PROGRAM_ID)
);
```

### Borrow Assets

```typescript
const usdtMint = address('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');
const borrowAmount = new BN(1_000_000); // 1 USDT

const borrowAction = await KaminoAction.buildBorrowTxns(
  market,
  borrowAmount,
  usdtMint,
  signer,
  new VanillaObligation(PROGRAM_ID)
);
```

### Check Loan Health

```typescript
const userAddress = address('EZC9wzVCvihCsCHEMGADYdsRhcpdRYWzSCZAVegSCfqY');
const obligation = await market.getObligationByWallet(
  userAddress,
  new VanillaObligation(PROGRAM_ID)
);

const ltv = obligation.loanToValue();
console.log('Loan-to-Value:', ltv);
```

### REST API Borrow Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /ktx/klend/deposit` | POST | Build unsigned deposit transaction |
| `POST /ktx/klend/borrow` | POST | Build unsigned borrow transaction |
| `POST /ktx/klend/repay` | POST | Build unsigned repay transaction |
| `POST /ktx/klend/withdraw` | POST | Build unsigned withdraw transaction |

---

## CPI Integration for Solana Programs

To integrate Kamino operations into your own Solana program using CPI (Cross-Program Invocation), you need to:

1. Add the Kamino program ID to your program
2. Include the Kamino instruction data structures
3. Build CPI calls from your program

### CPI Account Structures

```rust
// Example: Deposit CPI instruction
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct KaminoDepositCPI<'info> {
    /// The Kamino vault program
    pub kamino_vault_program: Program<'info, System>,
    
    /// The vault state account
    #[account(mut)]
    pub vault: AccountInfo<'info>,
    
    /// The user's token account
    #[account(mut)]
    pub user_token_account: AccountInfo<'info>,
    
    /// The user's vault share account
    #[account(mut)]
    pub user_shares_account: AccountInfo<'info>,
    
    /// The user signer
    pub user: Signer<'info>,
    
    /// Token program
    pub token_program: Program<'info, Token>,
}
```

### Example CPI Call

```rust
use anchor_lang::prelude::*;
use solana_program::program::invoke_signed;

pub fn deposit_to_kamino_vault(
    ctx: Context<KaminoDepositCPI>,
    amount: u64,
) -> Result<()> {
    // Build Kamino deposit instruction
    let ix = Instruction {
        program_id: ctx.accounts.kamino_vault_program.key(),
        accounts: vec![
            AccountMeta::new(ctx.accounts.vault.key(), false),
            AccountMeta::new(ctx.accounts.user_token_account.key(), false),
            AccountMeta::new(ctx.accounts.user_shares_account.key(), false),
            AccountMeta::new_readonly(ctx.accounts.user.key(), true),
            AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
        ],
        data: [...], // Serialized instruction data
    };
    
    invoke_signed(
        &ix,
        &[
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.user_token_account.to_account_info(),
            ctx.accounts.user_shares_account.to_account_info(),
            ctx.accounts.user.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
        ],
        &[], // signer seeds if needed
    )?;
    
    Ok(())
}
```

**Note:** For full CPI integration, reference the Kamino smart contract source code:
https://github.com/Kamino-Finance/klend

---

## Automated Deposit Example

### Complete Automated Deposit Script

```typescript
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  address,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  sendAndConfirmTransactionFactory,
  getSignatureFromTransaction,
} from '@solana/kit';
import { KaminoVault } from '@kamino-finance/klend-sdk';
import { parseKeypairFile } from '@kamino-finance/klend-sdk/dist/utils/signer.js';
import { Decimal } from 'decimal.js';

// Configuration
const CONFIG = {
  KEYPAIR_FILE: '/path/to/your/keypair.json',
  VAULT_ADDRESS: 'HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E',
  RPC_URL: 'https://api.mainnet-beta.solana.com',
  WS_URL: 'wss://api.mainnet-beta.solana.com',
  MIN_BALANCE: 0.1, // Keep minimum 0.1 SOL for fees
  TARGET_VAULT: 'USDC', // Target token to deposit
};

// Initialize connections
const rpc = createSolanaRpc(CONFIG.RPC_URL);
const rpcSubscriptions = createSolanaRpcSubscriptions(CONFIG.WS_URL);

async function automatedDeposit() {
  try {
    // Load signer
    const signer = await parseKeypairFile(CONFIG.KEYPAIR_FILE);
    console.log('Signer:', signer.address);
    
    // Initialize vault
    const vault = new KaminoVault(
      rpc,
      address(CONFIG.VAULT_ADDRESS)
    );
    
    // Check current APY
    const apys = await vault.getAPYs();
    console.log('Current APY:', apys);
    
    // Get exchange rate
    const rate = await vault.getExchangeRate();
    console.log('Exchange Rate:', rate.toString());
    
    // Get user current position
    const shares = await vault.getUserShares(signer.address);
    console.log('Current Shares:', shares.totalShares.toString());
    
    // Calculate deposit amount (example: fixed 100 USDC)
    const depositAmount = new Decimal(100.0);
    console.log('Depositing:', depositAmount.toString(), 'USDC');
    
    // Build deposit instructions
    const bundle = await vault.depositIxs(signer, depositAmount);
    const instructions = [...(bundle.depositIxs || [])];
    
    if (!instructions.length) {
      throw new Error('No instructions returned by Kamino SDK');
    }
    
    // Get fresh blockhash
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    
    // Build transaction
    const transactionMessage = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(signer, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => appendTransactionMessageInstructions(instructions, tx)
    );
    
    // Sign transaction
    const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
    const signature = getSignatureFromTransaction(signedTransaction);
    
    console.log('Sending transaction:', signature);
    
    // Send and confirm
    await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
      commitment: 'confirmed',
      skipPreflight: true,
    });
    
    console.log('✅ Deposit successful! Signature:', signature);
    
    // Verify new position
    const newShares = await vault.getUserShares(signer.address);
    console.log('New Shares:', newShares.totalShares.toString());
    
  } catch (error) {
    console.error('❌ Deposit failed:', error);
    throw error;
  }
}

// Run deposit
automatedDeposit().then(() => {
  console.log('Automation complete');
  process.exit(0);
}).catch((error) => {
  console.error('Automation failed:', error);
  process.exit(1);
});
```

### Automated Deposit with Threshold Logic

```typescript
async function automatedDepositWithThreshold(
  vault: KaminoVault,
  signer: any,
  minApy: number,
  maxTvl: number
) {
  // Get current metrics
  const apys = await vault.getAPYs();
  const rate = await vault.getExchangeRate();
  
  // Check if conditions are met
  if (apys.baseAPY < minApy) {
    console.log('APY too low, skipping deposit');
    return;
  }
  
  // Calculate optimal deposit amount
  const userShares = await vault.getUserShares(signer.address);
  const optimalAmount = calculateOptimalDeposit(userShares, rate);
  
  if (optimalAmount.lessThan(1)) {
    console.log('Amount too small, skipping deposit');
    return;
  }
  
  // Execute deposit
  const bundle = await vault.depositIxs(signer, optimalAmount);
  // ... send transaction ...
}

function calculateOptimalDeposit(shares: any, rate: Decimal): Decimal {
  // Custom logic for optimal deposit calculation
  return new Decimal(100); // Example: deposit 100 tokens
}
```

---

## Transaction Costs & Estimates

### Typical Transaction Costs (as of March 2026)

| Operation | Estimated Cost (SOL) | Notes |
|-----------|---------------------|-------|
| **Vault Deposit** | ~0.0005 - 0.001 | Includes token transfer + mint |
| **Vault Withdraw** | ~0.0005 - 0.0015 | May include unstaking |
| **Borrow** | ~0.0005 - 0.001 | Includes obligation creation |
| **Repay** | ~0.0003 - 0.0008 | |
| **Flash Loan** | ~0.001 - 0.002 | + flash loan fees |
| **Create Vault** | ~0.01 - 0.02 | One-time setup cost |

### Fee Structure

- **Performance Fee:** Typically 10% of yield (vault dependent)
- **Management Fee:** Typically 1% annually (vault dependent)
- **Flash Loan Fee:** 0.09% of borrowed amount
- **Borrow Interest:** Variable per reserve

### Compute Unit Limits

```typescript
// Recommended compute unit limits
const COMPUTE_UNITS = {
  DEPOSIT: 200_000,
  WITHDRAW: 250_000,
  BORROW: 200_000,
  REPAY: 150_000,
  FLASH_LOAN: 400_000,
};
```

### Priority Fees

```typescript
// Add priority fee for faster confirmation
const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
  microLamports: 5000, // 5000 micro-lamports per CU
});

// Add to instructions before sending
instructions.unshift(priorityFeeIx);
```

---

## Resources & Links

### Documentation

- **Main Docs:** https://kamino.com/docs
- **Buildkit Docs:** https://kamino.com/docs/build
- **Curator Docs:** https://kamino.com/docs/curators
- **API Docs:** https://api-docs.kamino.com/

### SDK & Code

- **TypeScript SDK:** https://github.com/Kamino-Finance/klend-sdk
- **Smart Contracts:** https://github.com/Kamino-Finance/klend
- **Examples:** https://github.com/Kamino-Finance/klend-sdk/tree/master/examples

### API References

- **Data API OpenAPI:** https://api.kamino.finance/openapi/json?openapi=3.0.0
- **Transaction API OpenAPI:** https://api.kamino.finance/ktx/documentation/json

### Community & Support

- **Discord:** https://discord.com/invite/kamino
- **Risk Dashboard:** https://risk.kamino.finance
- **Full Docs Index:** https://kamino.com/docs/llms.txt

### Additional SDKs

| Package | Purpose |
|---------|---------|
| `@kamino-finance/klend-sdk` | Core lending SDK |
| `@kamino-finance/kswap-sdk` | Routing for multiply/repay operations |
| `@kamino-finance/scope-sdk` | Oracle prices for multiply |
| `@kamino-finance/farms-sdk` | Farm rewards, APY calc, claims |
| `@solana/kit` | Modern Solana SDK |
| `@solana-program/address-lookup-table` | LUT fetching |

---

## Summary

Kamino Finance provides comprehensive integration options:

1. **REST API** - Best for data queries and simple transaction building
2. **TypeScript SDK** - Best for complex on-chain interactions and custom logic
3. **CPI Integration** - For building on top of Kamino within your own programs

For automated deposits:
- Use SDK for full control over transaction building
- Use API for simpler integration where you sign pre-built transactions
- Monitor APY and TVL metrics to optimize deposit timing
- Account for transaction costs (typically 0.0005-0.002 SOL per operation)

For production:
- Use a private RPC endpoint (Helius, QuickNode, etc.)
- Implement retry logic for transaction failures
- Monitor health factors for borrow positions
- Consider priority fees for faster confirmation during congestion
