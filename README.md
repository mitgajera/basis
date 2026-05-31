<div align="center">
  <img src="web/public/brand.svg" alt="basis." width="64" height="64" />
  <h1>basis.</h1>
  <p><strong>Cross-venue basis-trading vault on Solana.</strong><br/>
  Captures funding-rate spreads delta-neutral across Backpack, Hyperliquid, Phoenix, and Pacifica.</p>

  <p>
    <a href="https://basis-v1.vercel.app">Live dashboard</a> ·
    <a href="https://basis-3jlj.onrender.com/api/health">Keeper API</a> ·
    <a href="https://stats.uptimerobot.com/JrNzCZ12Cu">Status</a>
  </p>
</div>

---

## What is this?

`basis.` is a yield vault that captures the **funding-rate basis** between perpetual venues. When two venues quote materially different funding rates for the same asset, the vault opens equal-and-opposite positions on each — long the cheap leg, short the expensive one — and collects the differential as funding settles. Net exposure is delta-neutral; PnL comes from funding payments minus fees.

Users deposit USDC and receive **bUSD** — a non-rebasing share token whose price (`navPerShare`) reflects vault performance. Withdrawing burns bUSD back into USDC at the current NAV.

> **Status:** Devnet · Open beta. Not audited. Test tokens only.

---

## How it works

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              USER                                        │
│                                                                          │
│   deposit USDC  ──────────►       │                                      │
│                                   │     receives bUSD shares             │
│                                   ▼                                      │
└─────────────────────────────┬────────────────────────────────────────────┘
                              │
                              ▼  (on-chain: Anchor / Solana devnet)
┌──────────────────────────────────────────────────────────────────────────┐
│                       basis_vault program                                │
│                                                                          │
│   ┌───────────┐  ┌──────────────────┐  ┌──────────────┐                  │
│   │  Vault    │  │ Vault USDC ATA   │  │  Share Mint  │                  │
│   │  (PDA)    │──┤ (PDA-owned)      │  │   (bUSD)     │                  │
│   └─────┬─────┘  └──────────────────┘  └──────────────┘                  │
│         │                                                                │
│         │  totalAssets · totalShares · navPerShare                       │
│         │                                                                │
└─────────┼────────────────────────────────────────────────────────────────┘
          │
          │  read state
          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       off-chain keeper (Node)                            │
│                                                                          │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│   │  Backpack    │  │ Hyperliquid  │  │   Phoenix    │  │   Pacifica   │ │
│   │   adapter    │  │   adapter    │  │   adapter    │  │   adapter    │ │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│          └──────────────┬──┴──────────────┬──┴──────────────┬──┘         │
│                         ▼                 ▼                 ▼            │
│                   ┌──────────┐     ┌────────────┐    ┌─────────────┐     │
│                   │ Strategy │────►│ Risk       │───►│  Executor   │     │
│                   │ (ranker, │     │ (margin,   │    │ (simulated  │     │
│                   │  sizer)  │     │  caps)     │    │  on devnet) │     │
│                   └──────────┘     └────────────┘    └──────┬──────┘     │
│                                                             │            │
│                                                             ▼            │
│                                                       open / close       │
│                                                       paired legs        │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────────────┐   │
│   │  SQLite (replicated to Turso) — trade history, NAV snapshots,    │   │
│   │  funding history, spread history                                 │   │
│   └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   API server (Fastify): /api/funding-rates · /api/spreads · /api/nav     │
│                         /api/positions · /api/trades · /api/stats        │
└──────────────────────────────────────────────────────────────────────────┘
          │
          ▼  (read API)
┌──────────────────────────────────────────────────────────────────────────┐
│                      Next.js dashboard (Vercel)                          │
│   Live charts · funding/spread/NAV/PnL · positions · trades · vault UI   │
└──────────────────────────────────────────────────────────────────────────┘
```

### The loop

1. **Poll** — every ~5 s the keeper hits each venue's REST/WebSocket endpoint for the latest mark price + funding rate for each tracked asset.
2. **Normalize** — rates are annualized to a comparable basis (`hourlyRate × 24 × 365`).
3. **Rank** — compute every long/short venue pair's spread. Filter by minimum threshold and venue health.
4. **Size** — risk engine picks notional based on free vault collateral, per-venue caps, and minimum trade size.
5. **Execute** — open both legs (currently simulated on devnet; real execution is the production roadmap). Record entry fills.
6. **Monitor** — recompute spreads. Close when the spread compresses below the close threshold, or risk triggers.
7. **Settle** — realized PnL accrues to the vault, lifting `navPerShare` for all share holders.

---

## Features

- **Cross-venue funding capture** — 4 venues: Backpack (CEX), Hyperliquid (perp DEX), Phoenix (Solana orderbook), Pacifica (perp DEX)
- **Delta-neutral by construction** — every position is a paired long/short, no directional exposure
- **On-chain share accounting** — bUSD is a real SPL token; price discovery is purely on-chain via `totalAssets / totalShares`
- **Live dashboard** — funding rates, pairwise spreads, NAV chart, open positions, recent trades, live keeper status
- **Devnet faucet** — mint 50 test USDC every 2 hours to try the vault
- **Operational** — UptimeRobot-monitored, Turso-replicated SQLite so state survives Render restarts

---

## Tech stack

| Layer        | Stack                                                                  |
|--------------|------------------------------------------------------------------------|
| On-chain     | Anchor 0.32 · Rust · Solana program (`basis_vault`)                    |
| Keeper       | Node 20 · TypeScript · Fastify · pino · better-sqlite3 · libsql/turso  |
| Dashboard    | Next.js 14 (App Router) · Tailwind · lightweight-charts · SWR · sonner |
| Wallets      | @solana/wallet-adapter (Phantom)                                       |
| Monorepo     | pnpm workspaces                                                        |
| Hosting      | Vercel (web) · Render (keeper) · Turso (SQLite replica)                |
| Monitoring   | UptimeRobot                                                            |

---

## Project layout

```
basis/
├── anchor/               # Solana program (Anchor / Rust)
│   └── programs/basis_vault/
│
├── keeper/               # Off-chain bot (Node / TypeScript)
│   └── src/
│       ├── venues/       # Backpack, Hyperliquid, Phoenix, Pacifica adapters
│       ├── strategy/     # Spread ranker, position sizer
│       ├── risk/         # Margin and exposure caps
│       ├── executor/     # Position open/close (simulated on devnet)
│       ├── logger/       # SQLite + Turso replication
│       ├── api/          # Fastify routes consumed by the dashboard
│       ├── registry/     # Live venue snapshots
│       └── vault/        # On-chain vault state reader
│
├── web/                  # Next.js dashboard
│   ├── app/              # Routes: dashboard, vault, faucet, api/uptime
│   ├── components/       # Charts, panels, brand mark, etc.
│   ├── hooks/            # useAnimatedNumber, useLiveDots, useChartCrosshair
│   ├── lib/              # API client, Anchor client, formatters, chart theme
│   └── idl/              # Anchor IDL JSON (checked in for Vercel builds)
│
├── shared/               # Types and helpers shared by keeper + web
└── scripts/              # One-off ops (devnet airdrop, USDC mint, etc.)
```

---

## Getting started

### Prerequisites

- Node 20+ and **pnpm** 9+
- Rust + Anchor 0.32 (only if rebuilding the program)
- A Solana devnet RPC URL (the public one works but rate-limits)
- A Phantom wallet on devnet to test the vault UI

### Install

```bash
git clone <this-repo>
cd basis
pnpm install
```

### Environment

**`keeper/.env`** (copy from `keeper/.env.example`):

```bash
# Solana
RPC_URL=https://api.devnet.solana.com
VAULT_PROGRAM_ID=GLfySZNLkrDGLmckY1vpFEiXxHToMJzPtCWQcx4wDgbS
USDC_MINT=BYBc1fivzgzSNRmVXMAq7V2DqP7CqDmPBDC15VYbaup9

# API
PORT=3001
DASHBOARD_ORIGIN=http://localhost:3000

# Keeper wallet (devnet only — never commit a mainnet key)
KEEPER_SECRET_KEY=[1,2,3,...]

# Optional: Turso replication (uses pure local SQLite if disabled)
BASIS_USE_TURSO=0
TURSO_URL=
TURSO_TOKEN=
```

**`web/.env.local`** (copy from `web/.env.local.example`):

```bash
NEXT_PUBLIC_KEEPER_API_URL=http://localhost:3001
NEXT_PUBLIC_CLUSTER=devnet
NEXT_PUBLIC_VAULT_PROGRAM_ID=GLfySZNLkrDGLmckY1vpFEiXxHToMJzPtCWQcx4wDgbS
NEXT_PUBLIC_USDC_MINT=BYBc1fivzgzSNRmVXMAq7V2DqP7CqDmPBDC15VYbaup9
```

### Run everything

```bash
# Terminal 1 — keeper (Fastify API on :3001)
pnpm --filter @basis/keeper dev

# Terminal 2 — dashboard (Next on :3000)
pnpm --filter web dev
```

Open `http://localhost:3000`, connect a devnet Phantom wallet, hit `/faucet` for test USDC, then `/vault` to deposit.

---

## On-chain program

The `basis_vault` Anchor program is intentionally minimal — share accounting only, no trading. The off-chain keeper is the only authority that can update `totalAssets` to reflect realized PnL.

### Accounts

| Account                | Type | Purpose                                                       |
|------------------------|------|---------------------------------------------------------------|
| `Vault` (PDA)          | data | `usdc_mint`, `share_mint`, `total_assets`, `total_shares`     |
| `Vault USDC` (PDA ATA) | spl  | Holds user-deposited USDC                                     |
| `Share mint` (PDA)     | spl  | Mint authority for bUSD                                       |
| `UserPosition` (PDA)   | data | Per-user lifetime deposited total — used to compute yield     |

### Instructions

| Instruction  | Effect                                                                          |
|--------------|---------------------------------------------------------------------------------|
| `initialize` | Creates vault + share mint. One-shot, called once per deployment.               |
| `deposit`    | Pull USDC, mint bUSD at current NAV. `shares = (amount × total_shares) / total_assets`. |
| `withdraw`   | Burn bUSD, return USDC at current NAV.                                          |
| `settle`     | Keeper-only. Updates `total_assets` to reflect off-chain realized PnL.          |

PDA seeds: `["vault", usdc_mint]`, `["vault_usdc", vault]`, `["share_mint", vault]`, `["user_position", user]`.

### Rebuilding

```bash
cd anchor
anchor build
# Then copy anchor/target/idl/basis_vault.json → web/idl/basis_vault.json
```

---

## Keeper deep dive

### Venue adapters

Each adapter implements a small interface — `getFundingRate(asset)`, `getMark(asset)`, `getPositions()`, `openPosition()`, `closePosition()`. All venues currently use **simulated execution** on devnet:

- Marks and funding rates are real (live REST polls)
- Position open/close just records to SQLite at the current mark; no actual orders are sent

Real execution is the production roadmap. Each adapter is already shaped to plug in its real auth + signing.

### Resilience

- **Retry + timeout** on every REST poll. Backpack and Hyperliquid wrap with exponential backoff; Phoenix's `getOverview` is cached to avoid hammering its asset map endpoint.
- **Turso replication** (opt-in via `BASIS_USE_TURSO=1`) — local SQLite acts as a replica synced from Turso. Survives Render's free-tier 50-second cold starts and 15-minute idle restarts.
- **Position rehydration** on boot — open trades are pulled from the DB so a restart doesn't lose state.
- **CORS-locked** API — only the configured `DASHBOARD_ORIGIN` can call the keeper from a browser.

### Public API

All endpoints return JSON, no auth. Consumed by the dashboard via SWR.

| Endpoint                                   | Returns                                       |
|--------------------------------------------|-----------------------------------------------|
| `GET /api/health`                          | `{ ok, uptime, venues }`                      |
| `GET /api/funding-rates`                   | Latest funding per venue per asset            |
| `GET /api/funding-rate-history?lookback=`  | Time series                                   |
| `GET /api/spreads?asset=`                  | Live pairwise spreads                         |
| `GET /api/spread-history?lookback=&asset=` | Time series                                   |
| `GET /api/nav`                             | Current NAV + history                         |
| `GET /api/positions`                       | Open legs with unrealized PnL                 |
| `GET /api/trades?lookback=&limit=&offset=` | Paginated trade legs                          |
| `GET /api/stats`                           | TVL, APR (24h/7d), trade counts               |
| `GET /api/pnl-history?lookback=`           | Cumulative PnL points                         |
| `GET /api/settlement`                      | Last keeper settlement timestamp              |
| `POST /api/faucet`                         | Mint 50 test USDC (2h cooldown per wallet)    |
| `GET /api/faucet/status?address=`          | Cooldown remaining                            |

---

## Dashboard

Next.js App Router. The keeper is the source of truth — the dashboard is a thin read layer plus the deposit/withdraw flow which goes directly on-chain via Anchor.

Notable UI primitives (written for this project):

- `BrandMark` / `StatusPill` — Δ brand mark + live/degraded/offline status with uptime ratio
- `Sparkline` — pure-SVG smoothed sparkline (used under TVL and on the vault)
- `useAnimatedNumber` — rAF-tweened value counter (TVL, NAV, APR)
- `ChartFrame` + `useChartCrosshair` + `useLiveDots` — shared chart shell with crosshair tooltip and pulsing "still-moving" dots at each line's last data point
- `CooldownRing` — radial SVG progress for the faucet timer
- `EmptyState` / `KeeperOfflineBanner` — system-wide loading and offline UX

Style system lives in `web/app/globals.css` — see `--bg-*`, `--text-*`, `--accent`, `--positive`, `--negative`, motion tokens (`--dur-fast/base/slow`), and elevations (`--elev-1/2/3`).

---

## Deployment

### Keeper → Render

- `Dockerfile` at repo root, builds the keeper with `pnpm install --no-frozen-lockfile` (needed for the libsql native binary on Linux x64).
- Service binds to `0.0.0.0:$PORT` so Render's port scan succeeds.
- Set `BASIS_USE_TURSO=1` + `TURSO_URL` + `TURSO_TOKEN` for persistence across restarts.
- Set `DASHBOARD_ORIGIN` to the Vercel URL (or `*` for a public demo).

### Dashboard → Vercel

- **Root directory**: `web`
- **Build command** (handles the workspace):
  ```
  cd .. && pnpm install --no-frozen-lockfile && pnpm --filter @basis/shared build && pnpm --filter web build
  ```
- Set the four `NEXT_PUBLIC_*` env vars **before** the first build (they're inlined into the bundle).
- The Anchor IDL is checked into `web/idl/` so Vercel builds without needing the Rust toolchain.

### Program → Devnet

```bash
cd anchor
anchor build
anchor deploy --provider.cluster devnet
# Then run scripts/initialize-vault.ts to call `initialize` once.
```

---

## Disclaimers

- **Not financial advice.** This is an experimental yield strategy.
- **Devnet only.** Test tokens have no value.
- **Not audited.** Don't deploy to mainnet without a review.
- Funding rates can flip sign — basis trades are *not* risk-free.
