# 🍱 TIFFINO — Smart Tiffin & Cloud Kitchen Management

Production-ready Phase 1: customer management, daily lunch/dinner booking, bulk booking,
payment tracking, dashboards and reports — one Node.js/Express + MongoDB backend serving
a React web console and an Expo (Android/iOS) mobile app.

## Monorepo layout

| Path | Package | What it is |
|---|---|---|
| `apps/api` | `@tiffino/api` | Express + TypeScript REST API, Mongoose models, Vitest suite |
| `apps/web` | `@tiffino/web` | React 18 + Vite + Tailwind owner/staff console |
| `apps/mobile` | `@tiffino/mobile` | Expo SDK 58 + expo-router + NativeWind app |
| `packages/shared` | `@tiffino/shared` | Zod schemas, DTO types, permission catalog, Asia/Kolkata date helpers, brand tokens |

## Prerequisites

- Node.js ≥ 20, pnpm 9 (`corepack enable`)
- MongoDB 6+ running locally (`mongodb://127.0.0.1:27017`) — or any connection string in `MONGODB_URI`

## First run

```bash
pnpm install

# 1. Configure the API
cp apps/api/.env.example apps/api/.env
# fill in JWT_ACCESS_SECRET:  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 2. Create the owner account (prints credentials once)
pnpm seed                 # or: pnpm --filter @tiffino/api seed:demo  (adds demo customers/orders)

# 3. Start everything (separate terminals)
pnpm dev:api              # http://localhost:4000
pnpm dev:web              # http://localhost:5173  (proxies /api to :4000)
pnpm dev:mobile           # Expo dev server (scan QR with Expo Go / dev build)
```

Mobile on a **physical device**: set `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4000` in
`apps/mobile/.env` — `localhost` only works on emulators running on the same machine.

## Tests & checks

```bash
pnpm test                 # 50 Vitest + supertest tests (needs MongoDB running)
pnpm typecheck            # strict TS across all packages
```

## Default roles

- **Owner** — full access; manages staff accounts and their permission grants.
- **Staff** — logs in with own email/password; sees only what the owner granted
  (permission catalog in `packages/shared/src/constants.ts`). Enforcement is
  server-side middleware on every route — UI hiding is cosmetic.

**Forgot password (Phase 1, no email infra):** staff ask the owner (Staff page → Reset
password). The owner account is recovered on the server:
`NEW_PASSWORD='StrongPass123' pnpm --filter @tiffino/api reset-owner-password`.

## Key behaviours worth knowing

- **Booking integrity** — one active order per customer/date/meal, enforced by a partial
  unique index. Cancelling keeps the order in history *and* frees the slot for rebooking.
- **Price snapshots** — orders store the price at booking time; changing a customer's
  rates (always via *Update prices*, which writes dated history) never alters past orders.
- **Revenue vs cash** — expected revenue comes from active orders, collected from the
  payments ledger; *pending = billed − paid*. The two are never mixed.
- **Business dates** — all order/payment dates are `YYYY-MM-DD` resolved in Asia/Kolkata,
  so late-evening bookings never land on the wrong day.

See [DEPLOYMENT.md](DEPLOYMENT.md) for production setup.
# tiffino
