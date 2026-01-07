# AirLog

**AirLog** is a verifiable aircraft maintenance ledger built with Compact smart contracts.

It enables aircraft owners to authorize maintenance issuers (A&P mechanics, repair stations) to write immutable, cryptographically verifiable maintenance entries. Buyers, insurers, and lenders can independently verify maintenance history via a read-only API without trusting intermediaries.

---

## What This Repository Contains

This is a monorepo that includes multiple example projects built with Midnight / Compact.

**Primary focus: AirLog**

- `packages/contracts/airlog` — AirLog Compact smart contract
- `packages/cli/airlog` — CLI tooling for deploy, authorization, and entry writing
- `packages/api/airlog` — Read-only API for decoding and verifying on-chain state

Other directories (e.g. kitties examples) are retained as learning/reference material.

---

## Architecture Overview

- **Write path**: Authorized issuers submit maintenance entries on-chain
- **Read path**: Indexer → state decoding → verification logic
- **Documents**: Stored off-chain, integrity enforced via on-chain hashes

---

## Status

- Contract: Implemented
- CLI: Implemented
- Read API: Implemented
- UI: Planned (read-only first)

---

## License

GPL-3.0

