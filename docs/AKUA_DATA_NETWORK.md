# Akua Data Network

## Purpose

Akua Data Network turns verified real-world data into programmable data assets. The network separates the underlying private data from its onchain identity, provenance, rights, and payment rails.

## Core rule

**Never put the valuable/private dataset onchain.**

Onchain: asset identity, issuer, version, content commitment, provenance root, rights class, lifecycle state, B20 reference, and settlement events.

Offchain: encrypted records, documents, raw sensor payloads, PII, commercial datasets, and query results.

## Architecture

```text
Sources -> Ingestion -> Normalization -> Verification -> Provenance
                                              |
                                              v
                                       Data Asset Registry
                                      /        |        \
                                     /         |         \
                                B20 Asset   Data API   Data Catalog
                                    |           |           |
                                    +-----------+-----------+
                                                |
                                          x402 / USDC
                                                |
                                      Humans / Businesses / Agents
```

## Services

### 1. Ingestion Gateway
Accepts signed events from APIs, operators, IoT devices, documents, ERP systems, and partner feeds.

Responsibilities:
- source authentication
- schema validation
- idempotency
- timestamp validation
- raw payload retention
- source signature capture

### 2. Verification Engine
Converts raw observations into attestations.

A verification result must identify:
- source
- method
- evidence
- verifier
- timestamp
- confidence
- status

Confidence is evidence metadata, not a claim that a dataset is objectively true.

### 3. Provenance Engine
Creates a deterministic canonical representation and cryptographic commitment for each dataset version.

Recommended primitives:
- canonical JSON serialization
- SHA-256 content hashes
- Merkle roots for record collections
- issuer signatures
- append-only event history

### 4. Data Asset Registry
Canonical identity layer for datasets.

Each asset has:
- immutable `asset_id`
- human-readable slug
- owner/issuer
- asset class
- current version
- lifecycle state
- access model
- license reference
- content hash
- provenance root
- optional chain reference

### 5. Access & Policy Engine
Evaluates whether a caller may receive a dataset, record, field, aggregate, or derived result.

Policies must support:
- public
- authenticated
- paid
- licensed
- organization-restricted
- jurisdiction-restricted
- time-limited

### 6. Data API
Provides stable APIs for both humans and AI agents.

Example:

`GET /v1/datasets/{assetId}/query`

The API returns a machine-readable entitlement and provenance envelope with every paid response.

### 7. Payment Gateway
x402-compatible HTTP payment layer using USDC.

Payment should occur before releasing paid data. Every settlement references:
- asset ID
- dataset version
- policy ID
- query fingerprint
- payer
- amount
- currency
- payment transaction

### 8. Onchain Asset Adapter
B20 is an adapter, not the source of truth for the dataset.

Potential asset classes:
- `DATA_ACCESS`: access entitlement
- `DATA_LICENSE`: commercial license/right
- `DATA_CERTIFICATE`: provenance/certification record
- `DATA_REVENUE`: only where a separately reviewed legal/economic structure permits it

Do not imply that holding a token automatically conveys legal ownership of offchain data.

## Dataset lifecycle

```text
DRAFT
  -> INGESTING
  -> VERIFIED
  -> PUBLISHED
  -> LICENSED
  -> SUSPENDED
  -> RETIRED
```

Versioning is immutable. A correction creates a new version and references the prior version.

## First vertical: commodity intelligence

MVP dataset family:

**Ghana Cocoa Supply Intelligence**

Possible records:
- warehouse inventory observations
- lot IDs
- quality measurements
- delivery events
- shipment milestones
- provenance/compliance evidence
- pricing observations

The first commercial objective is not token speculation. It is proving that customers pay for verified information through API/query access.

## Security requirements

- Separate hot API credentials from signing keys.
- Use a dedicated issuer wallet; never use an operator wallet for treasury funds.
- Encrypt raw data at rest and in transit.
- Hash before publication.
- Maintain an append-only audit trail.
- Rate-limit all query endpoints.
- Never expose raw PII through public dataset endpoints.
- Require explicit policy checks before data release.
- Treat chain transactions as settlement/proof events, not as the private data store.

## MVP acceptance criteria

1. Register a dataset.
2. Upload a version and calculate a deterministic content hash.
3. Record provenance events.
4. Generate a provenance root.
5. Publish dataset metadata.
6. Query a permitted subset.
7. Return a provenance envelope with every result.
8. Gate paid queries with x402/USDC.
9. Persist the payment-to-query relationship.
10. Optionally anchor the asset metadata/rights representation on Base.
11. Reproduce the same hash and provenance root from the same version.
12. Retire a version without deleting its audit history.
