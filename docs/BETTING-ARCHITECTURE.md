# FIFAYITI PARIAJ — P2P Live Betting Exchange

## Overview

FIFAYITI PARIAJ is a peer-to-peer live betting exchange built around FIFAYITI's own football competitions. Users take positions against each other during live matches — FIFAYITI does NOT act as the opposing bettor.

## Architecture

```
FIFAYITI CORE (matches, teams, players, live broadcast)
    │
    ▼
OFFICIAL MATCH EVENT ENGINE (Live Operator → MatchEvent → OfficialEvent)
    │
    ▼
IMMUTABLE EVENT LOG (OfficialEvent with sequence + PENDING/CONFIRMED/CANCELLED)
    │
    ├──────────────────────┬─────────────────────┐
    ▼                      ▼                     ▼
FIFAYITI TV          MATCH CENTER          FIFAYITI PARIAJ
(scorebug, clock)    (events timeline)         │
                                              ▼
                                         MARKET ENGINE
                                         (one active market per match)
                                              │
                                              ▼
                                         MATCHING ENGINE
                                         (exact-stake P2P)
                                              │
                                              ▼
                                         WALLET + LEDGER
                                         (double-entry, atomic)
                                              │
                                              ▼
                                         SETTLEMENT ENGINE
                                         (event-driven, deterministic)
```

## Three-Authority Model

### A. Live Operator
- Authority for **official sporting events** (GOL, KAT_JON, FEN_MATCH, etc.)
- Does NOT create betting markets
- Does NOT control wallets
- Does NOT settle bets manually

### B. Betting Operator
- Curates the sequence of betting markets from a **predefined catalog**
- Can publish/suspend/close/cancel markets
- Does NOT create arbitrary market definitions
- Does NOT modify official events or wallets
- Enforced rule: **only ONE active market per match** (backend-enforced)

### C. Settlement Engine
- Authority for determining bet outcomes
- Reads OfficialEvents + market rules → deterministic outcome
- Never relies on manual operator declarations
- Handles event cancellations (refunds + reopens)

## Domain Model

### Money
- All amounts are **integer centimes** (1 HTG = 100 centimes)
- NEVER floating-point — always `BigInt`
- Double-entry ledger (LedgerEntry) — every movement is an immutable record
- Wallet is a denormalized cache of the ledger

### Stake Pools (backend-configured)
| Amount | Status |
|--------|--------|
| 50 HTG | ✅ enabled |
| 100 HTG | ✅ enabled |
| 250 HTG | ✅ enabled |
| 500 HTG | ✅ enabled |
| 1,000 HTG | ✅ enabled (can be disabled via DB) |

### Market Templates (predefined catalog)
| Code | Question | Settles On |
|------|----------|-----------|
| `NEXT_GOAL` | Kiyès ki pral make pwochen gòl la? | GOL |
| `ANOTHER_GOAL` | Èske gen yon lòt gòl? | FEN_MATCH |
| `NEXT_YELLOW_CARD` | Kiyès ekip ki pral jwenn pwochen kat jòn? | KAT_JON |
| `TOTAL_GOALS_OVER` | Èske total gòl yo ap depase X? | FEN_MATCH |
| `MATCH_WINNER` | Kiyès ekip ki pral genyen? | FEN_MATCH |

### Market Lifecycle
```
DRAFT → PUBLISHED → OPEN → SUSPENDED ↔ OPEN → CLOSED → SETTLING → SETTLED
                                                 ↘ CANCELLED
```

### Bet Lifecycle
```
CREATED → RESERVED → OPEN → MATCHED → SETTLED
                     ↘ CANCELLED → FUNDS RELEASED
MATCHED → MARKET_CANCELLED → REFUNDED
```

## API Routes

### Auth (bettor)
- `POST /api/betting/auth/register` — create bettor account + wallet + 500 HTG demo
- `POST /api/betting/auth/login` — login
- `POST /api/betting/auth/logout` — logout
- `GET /api/betting/auth/me` — current bettor profile

### Wallet
- `GET /api/betting/wallet` — balances (available, reserved, total)
- `GET /api/betting/wallet/transactions` — ledger history (last 50)
- `POST /api/betting/wallet/deposit` — demo deposit (real payment integration is a stub)

### Markets
- `GET /api/betting/markets/active` — current active market + liquidity
- `POST /api/betting/markets` — create market from template (betting_operator)
- `POST /api/betting/markets/[id]/publish` — DRAFT → OPEN
- `POST /api/betting/markets/[id]/suspend` — OPEN → SUSPENDED
- `POST /api/betting/markets/[id]/close` — → CLOSED
- `POST /api/betting/markets/[id]/cancel` — → CANCELLED (refunds all bets)

### Bets
- `POST /api/betting/bets` — place bet (validates balance, reserves funds, tries match)
- `GET /api/betting/bets` — list bettor's bets
- `POST /api/betting/bets/[id]/cancel` — cancel OPEN bet (refunds reserved funds)

### Operator
- `POST /api/betting/operator/emergency-suspend` — suspend ALL open markets
- `GET /api/betting/templates` — list enabled market templates
- `GET /api/betting/stake-pools` — list enabled stake pools

## Commission Model
- 5% of the matched pot goes to FIFAYITI as commission
- Winner receives: `stake + (opposingStake - commission)`
- Example: 500 HTG vs 500 HTG → pot = 1000 → commission = 50 → winner gets 950

## Security Measures
- **Double-spend protection**: atomic wallet reservation inside Prisma transactions
- **Idempotency**: `idempotencyKey` on BetOrder prevents duplicate submissions
- **Role enforcement**: server-side role checks on every privileged route
- **HMAC-signed sessions**: bettor sessions are tamper-evident (separate from admin sessions)
- **One-active-market rule**: backend-enforced (rejects publish if a market is already active)
- **Exact-stake matching**: prevents combining smaller bets to satisfy larger stakes
- **Immutable ledger**: historical entries are NEVER modified
- **Audit log**: every operator/system action is logged with before/after state

## ⚠️ Critical Limitations

### 1. Vercel Ephemeral Database
The current deployment uses SQLite on Vercel's serverless filesystem. **Wallet balances and bet history are NOT persistent across cold starts** — each lambda gets a fresh copy of `prisma/dev.db`.

**For real-money launch, you MUST migrate to Postgres:**
- Neon (free tier available)
- Supabase
- Vercel Postgres

The code is correct (atomic transactions, double-entry ledger) — only the backend needs swapping. The `db` client in `src/lib/db.ts` supports `DATABASE_URL` via Prisma datasource.

### 2. Payment Integration (Stub)
`POST /api/betting/wallet/deposit` creates a ledger DEPOSIT entry but does NOT process a real payment. Real deposit/withdrawal requires integration with:
- MonCash (Haiti)
- Natcash (Haiti)
- Or international payment processor

The wallet library has a clean `deposit()` / `withdraw()` interface — the payment gateway just needs to call it after confirming a transaction.

### 3. KYC / AML / Regulatory
No identity verification, age verification, or anti-money-laundering controls are implemented. These are required before any real-money launch in any jurisdiction.

### 4. Real-time Updates
Market state changes are pushed via the LiveKit data channel (same channel as broadcast overlays). The bettor UI polls `/api/betting/markets/active` every 3s as a fallback. For high-frequency production, a dedicated WebSocket (e.g. Pusher, Ably, or a custom server) would be more robust.

## Credentials

### Betting Operator Login
- Email: `betting@fifayiti.com`
- Password: `pariaj2026`
- Role: `betting_operator`

### Bettor Accounts
- Self-registration via the bettor login page
- Each new bettor receives 500 HTG demo balance for testing

## Database Schema
See `prisma/schema.prisma` — betting models start at line ~329. Key models:
- `Bettor` — bettor account (separate from admin User)
- `Wallet` — available + reserved balances
- `LedgerEntry` — immutable double-entry log
- `StakePool` — backend-configured stake options
- `MarketTemplate` — predefined market catalog
- `BettingMarket` — instance of a template for a match
- `MarketSelection` — predefined choices (HOME/AWAY, YES/NO, OVER/UNDER)
- `BetOrder` — user's bet (with matchedWith self-reference)
- `OfficialEvent` — formalized event for settlement (PENDING/CONFIRMED/CANCELLED + supersession)
- `BettingAuditLog` — operator/system action audit

## Testing
```bash
# Run the betting tests
bun test tests/betting-wallet.test.ts
bun test tests/betting-matching.test.ts
bun test tests/betting-settlement.test.ts
```

Tests cover:
- Wallet double-spend (concurrent reservations)
- Exact-stake matching (500↔500 = match, 500↔250 = no match, same selection = no match)
- Settlement (GOL event → NEXT_GOAL market settles → winner gets payout, loser forfeits)

## Integration with Existing FIFAYITI

PARIAJ integrates with the existing ecosystem:
- **Events**: the existing `/api/matches/[id]/events` route now creates an `OfficialEvent` + fires the settlement engine after each operator event
- **LiveKit**: market state is pushed to the broadcast room metadata (same channel as score/clock)
- **Auth**: bettor auth is separate (different cookie name + signing context) but uses the same HMAC secret
- **UI**: the bettor page is accessible via the "Pariaj" tab in the bottom nav

The betting system does NOT modify existing FIFAYITI TV functionality.
