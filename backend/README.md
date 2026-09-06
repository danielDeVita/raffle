# LUK - Backend

GraphQL API built with NestJS, Prisma, and PostgreSQL.

> **Project guide**: See [AGENTS.md](../AGENTS.md) for shared project context, [COMMANDS.md](../COMMANDS.md) for root-level workflows, and [docs/domain-flows.md](../docs/domain-flows.md) for business lifecycle flows.

## Quick Start (Docker - Recommended)

```bash
# From project root
npm run docker:dev:build    # First time
npm run docker:db:push      # Create tables
```

## Quick Start (Local)

Requires Node.js 22 installed globally.

Local Docker PostgreSQL is exposed on `localhost:5433` to avoid conflicts with native PostgreSQL on `5432`.

```bash
# From project root
npm run docker:infra:up

# Backend
cd backend && npm install
cd backend && npx prisma db push
cd backend && npm run db:seed              # Canonical QA/dev dataset
cd backend && npm run start:dev
```

For frontend in local host mode:

```bash
cd frontend && npm install && npm run dev
```

Recommended local payment config in the root `.env`:

```bash
PAYMENTS_PROVIDER="mock"
ALLOW_MOCK_PAYMENTS="true"
MP_ACCESS_TOKEN=""
```

| Command                            | Description             |
| ---------------------------------- | ----------------------- |
| `npm run start:dev`                | Dev server (watch mode) |
| `npx prisma studio`                | Database GUI            |
| `npx prisma db push --force-reset` | Reset DB                |

## Architecture

- **API**: GraphQL (Apollo) + REST for webhooks and payment status sync
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: JWT + Google OAuth (Passport.js) + email verification + TOTP-based 2FA
- **Real-time**: GraphQL Subscriptions
- **Patterns**: Repository layer, Event-driven
- **Background Processing**: Scheduled jobs in backend + dedicated `social-worker`

## Modules

| Module               | Purpose                                                                       |
| -------------------- | ----------------------------------------------------------------------------- |
| `auth/`              | JWT authentication, Google OAuth, email verification, 2FA, guards             |
| `users/`             | User management, profiles, seller reviews, reputation metrics                 |
| `raffles/`           | Raffle CRUD, state management, seller dashboard, buyer experience, analytics  |
| `tickets/`           | Ticket reservation and purchase                                               |
| `wallet/`            | Saldo LUK accounts, ledger entries, buyer credits, and seller payable balances |
| `payments/`          | Mercado Pago/mock Saldo LUK top-ups and Mercado Pago seller payout connections |
| `disputes/`          | Buyer protection system                                                       |
| `notifications/`     | Email (Brevo) + in-app notifications                                          |
| `uploads/`           | Cloudinary upload signatures                                                  |
| `admin/`             | Admin panel, user management, bulk dispute resolution, stats                  |
| `categories/`        | Raffle categories management                                                  |
| `reports/`           | Raffle reporting/flagging system                                              |
| `social-promotions/` | Verifiable seller promotion flow, parsers, scoring, promotion bonus lifecycle |
| `tasks/`             | Scheduled jobs (cron)                                                         |
| `health/`            | Health check endpoints                                                        |
| `questions/`         | Q&A system for raffle pages                                                   |
| `activity/`          | Activity logging                                                              |

### Social Promotions

The social promotion feature is implemented in v1 with:

- seller-created promotion drafts;
- manual permalink submission for `Facebook`, `Instagram` and `X`;
- public-post validation using `fetch` + Playwright fallback;
- metrics snapshots stored in PostgreSQL;
- a separate `social-worker` process for scheduled validation and settlement;
- promotion bonuses for future purchases.

No official Meta/X APIs are used in v1. Metrics come from public content plus Luk attribution events.

## Environment

The backend reads from `backend/.env`. The social worker and Prisma use the same file. Key variables:

```bash
DATABASE_URL="postgresql://..."
JWT_SECRET="..."
PLATFORM_FEE_PERCENT="4"
MP_ACCESS_TOKEN="TEST-..."
MP_OAUTH_CLIENT_ID=""
MP_OAUTH_CLIENT_SECRET=""
MP_OAUTH_REDIRECT_URI="http://localhost:3001/payments/account/callback"
MP_PAYOUTS_ENABLED="false"
BACKEND_URL="http://localhost:3001"
FRONTEND_URL="http://localhost:3000"
PAYMENTS_PROVIDER="mercado_pago"  # or "mock" for local QA
ALLOW_MOCK_PAYMENTS="false"
TURNSTILE_ENABLED="false"
TURNSTILE_SECRET_KEY=""           # Backend-only secret key
SENTRY_DSN=""                     # Optional, leave empty in local
SENTRY_RELEASE=""                 # Git SHA or deploy release id

# Social promotions
SOCIAL_PROMOTION_ENABLED="true"
SOCIAL_PROMOTION_ALLOWED_NETWORKS="facebook,instagram,x"
SOCIAL_PROMOTION_CHECK_CRON="0 */12 * * *"
SOCIAL_PROMOTION_BROWSER_ENABLED="false"   # backend web service

# Google OAuth (optional)
GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxx"
GOOGLE_CALLBACK_URL="http://localhost:3001/auth/google/callback"
```

Mercado Pago setup notes:

- `MP_ACCESS_TOKEN` comes from Mercado Pago Developers -> `Tus integraciones` -> your app -> `Pruebas > Credenciales de prueba` or `Producción > Credenciales de producción`.
- `MP_OAUTH_CLIENT_ID`, `MP_OAUTH_CLIENT_SECRET`, and `MP_OAUTH_REDIRECT_URI` are only required for seller account connection and live payouts.
- Real Mercado Pago webhook delivery requires an `HTTPS` `BACKEND_URL`; `http://localhost:3001` works for local app wiring but not for external Mercado Pago webhook callbacks.

If Cloudflare Turnstile is enabled for auth, production should set both backend vars above and the matching frontend vars `NEXT_PUBLIC_TURNSTILE_ENABLED` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. The site key is public; `TURNSTILE_SECRET_KEY` must stay backend-only. See the production guide: [docs/turnstile-production.md](../docs/turnstile-production.md).

### Mock top-ups for local QA

If you want to test Saldo LUK loads and top-up refunds without Mercado Pago:

```bash
PAYMENTS_PROVIDER="mock"
ALLOW_MOCK_PAYMENTS="true"
```

In that mode:

- `createCreditTopUp` returns a local `redirectUrl` under `/checkout/mock/...`;
- the mock checkout page can approve/pending/reject the top-up;
- full and partial top-up refunds can be simulated from the mock page;
- `GET /payments/status` works for top-up ids.

### Canonical QA/dev seed

`prisma/seed.ts` is the canonical manual-QA dataset. It includes deterministic users, seller reputation tiers, admin-only buyer reputation flags, public seller reviews, raffle Q&A threads, disputes in every major status, mock purchases, refunds, payouts, wallet top-up receipts, ticket purchase receipts, social promotion fixtures, and simple-pack scenarios.

### Random purchase packs

Random purchases include a global pack incentive:

- buy `5`, receive `6`;
- buy `10`, receive `12`.

The pack:

- applies only to `RANDOM` purchases;
- emits real tickets that count toward raffle completion and the buyer cap;
- is subsidized by LUK, not by the seller;
- does not stack with social-promotion `bonusGrantId`;
- falls back to a normal purchase when the full pack cannot be honored because of stock or buyer-limit constraints.
- enriches the existing buyer/seller purchase notifications so both sides can see paid quantity, bonus tickets, total emitted tickets, and LUK subsidy when applicable.

### Seller reviews and buyer reputation signals

Seller reputation is public-facing and buyer reputation is internal:

- winners can create one seller review per raffle after `deliveryStatus = CONFIRMED`;
- reviews carry a `1..5` rating and optional comment;
- creating a review recalculates seller reputation and sends the seller email + in-app notifications in best-effort mode;
- admin moderation can hide only the public comment while keeping the rating in reputation averages;
- buyer metrics (`totalTicketsComprados`, `totalRifasGanadas`, completed purchases, buyer disputes) feed admin-only flags such as `HIGH_DISPUTE_RATE`, `NEW_WITH_DISPUTE`, `HEAVY_BUYER`, and `WINNER_WITH_HISTORY`;
- buyer reputation is not exposed publicly and is not visible to sellers.

### Google OAuth Setup

To enable Google login:

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add redirect URI: `http://localhost:3001/auth/google/callback` (or production URL)
4. Copy Client ID and Secret to `.env`
5. In OAuth consent screen, add your email as Test user (required while app is in Testing mode)

On startup, check logs for:

- `✅ Google OAuth configured` - Success
- `⚠️ Google OAuth NOT configured` - Missing credentials

## API Endpoints

### GraphQL

- `POST /graphql` - Main API
- `WS /graphql` - Subscriptions

### REST (Webhooks & Sync)

- `POST /payments/webhook` - Payment-provider webhooks
- `GET /payments/sync/:paymentId` - Manual payment sync
- `GET /payments/status?payment_id=X` - Payment status check
- `GET /social-promotions/track/:token` - Promotion click attribution redirect

### REST (Seller Payment Account)

- `GET /payments/account` - Start seller payment-account connection flow (requires auth token)
- `GET /payments/account/callback` - Provider callback (public)
- `GET /payments/account/status` - Get connection status (requires auth)
- `POST /payments/account/disconnect` - Disconnect seller payment account (requires auth)

### Health Check

- `GET /health` - Full health check (database, version, uptime)
- `GET /health/ready` - Readiness probe for k8s
- `GET /health/live` - Liveness probe

## Social Worker

The `social-worker` is a separate process that runs in Docker/Render and should stay enabled alongside the backend.

Responsibilities:

- validate due social promotion posts;
- use Playwright fallback when simple HTML is not enough;
- persist metric snapshots;
- settle closed promotion posts and emit promotion bonuses.

Local Docker stack:

```bash
npm run docker:dev:build
docker compose -f docker-compose.dev.yml logs -f social-worker
```

## Saldo LUK And Payment Provider Integration

Ticket purchases do not open an external checkout. Buyers first load Saldo LUK through Mercado Pago or the local mock provider, then buy tickets with internal balance.

- `1 Saldo LUK = $1 ARS`.
- Mercado Pago is used for `CreditTopUpSession` and, when enabled, seller payouts from Luk to connected seller MP wallets.
- The provider-facing top-up copy is Saldo LUK only (`Carga de saldo LUK`, descriptor `LUK SALDO`).
- Mercado Pago does not process ticket purchases and does not receive raffle, ticket-number, prize, or winner metadata.
- Ticket refunds and dispute refunds credit Saldo LUK.
- External Mercado Pago refunds apply only to loaded balance that has not been used.
- Seller payable balance is internal and separate from buyer spendable balance until Luk runs a payout.
- Approved top-ups mark `receiptVersion` / `receiptIssuedAt` and expose a wallet receipt.
- Ticket purchases persist an immutable `TicketPurchaseReceipt` snapshot plus buyer acknowledgement state.
- Seller liquidations require a connected Mercado Pago seller account, confirmed delivery, and the seven-day buyer-protection window with no active dispute.

REST routes under `/payments/*` are split by responsibility:

- `POST /payments/webhook` - Mercado Pago top-up webhooks
- `GET /payments/status?payment_id=X` - top-up status check
- `GET /payments/sync/:id` - force top-up sync
- `GET /payments/account` - start seller Mercado Pago OAuth
- `GET /payments/account/callback` - complete seller Mercado Pago OAuth
- `GET /payments/account/status` - read connected seller payout account status
- `POST /payments/account/disconnect` - disconnect the seller payout account

For local QA, set `PAYMENTS_PROVIDER="mock"` and use `/checkout/mock/:id` to approve, reject, expire, or refund a top-up without hitting Mercado Pago.

For random pack purchases, the backend still calculates seller economics on the gross value of all emitted tickets and records a separate `SUBSIDIO_PACK_PLATAFORMA` transaction for the Luk-funded bonus portion.

### Top-Up Webhook Processing

1. Receives webhook at `POST /payments/webhook`
2. Parses Mercado Pago top-up payloads
3. Records `PaymentProviderEvent` for idempotency
4. On `approved` top-up:
   - credits Saldo LUK once
   - creates `CARGA_SALDO`
   - stores provider ids on `CreditTopUpSession`
   - emits wallet-receipt fields for new top-ups

### Self-Healing Sync

When webhooks fail (no tunnel), the frontend calls `/payments/sync/:paymentId` to manually sync top-up status.

## Email Notifications

Emails are sent using [Brevo](https://brevo.com) via HTTP API (works on cloud platforms like Render).

### Styling

- **Source**: Email styles are defined inline within `src/notifications/notifications.service.ts`.
- **Palette**: Colors match the frontend `globals.css` (Teal/Amber/Warm White).
- **Fonts**: Emails use `DM Sans` (Body) and `Fraunces` (Headings) loaded via Google Fonts.

## Seller Dashboard & Buyer Experience

### Seller Dashboard Queries/Mutations

```graphql
# Get seller statistics (revenue, tickets sold, views, conversion rate, monthly chart data)
query {
  sellerDashboardStats {
    totalRevenue
    totalTicketsSold
    activeRaffles
    completedRaffles
    totalViews
    conversionRate
    monthlyRevenue {
      year
      month
      revenue
      ticketsSold
    }
  }
}

# Cancel multiple raffles at once
mutation {
  bulkCancelRaffles(raffleIds: ["id1", "id2"]) {
    successCount
    failedCount
    errors
  }
}

# Extend deadline for multiple raffles
mutation {
  bulkExtendRaffles(raffleIds: ["id1"], newDeadline: "2025-02-01T00:00:00Z") {
    successCount
    failedCount
  }
}

# Increment view count (called when viewing raffle page)
mutation {
  incrementRaffleViews(raffleId: "...")
}
```

### Buyer Experience Queries

```graphql
# Get buyer statistics (tickets, wins, win rate, total spent)
query {
  buyerStats {
    totalTicketsPurchased
    totalRafflesWon
    winRate
    totalSpent
    activeTickets
    favoritesCount
  }
}

# Get personalized recommendations based on purchase history
query {
  recommendedRaffles(limit: 6) {
    id
    titulo
    precioPorTicket
    product {
      imagenes
      categoria
    }
  }
}

# Get favorites that are ending soon (within 48 hours by default)
query {
  favoritesEndingSoon(hoursThreshold: 48) {
    id
    titulo
    fechaLimiteSorteo
  }
}
```

### Price Alerts

```graphql
# Seller updates raffle price (triggers notifications if price dropped)
mutation {
  updateRafflePrice(raffleId: "...", newPrice: 100.00) {
    id
    precioPorTicket
    lastPriceDropAt
  }
}
```

### Email Verification

```graphql
# Register returns user without tokens (requires verification)
mutation { register(input: {...}) { user { id } requiresVerification message } }

# Verify email with 6-digit code
mutation { verifyEmail(userId: "...", code: "123456") { token user { id emailVerified } } }

# Resend verification code (rate limited to 3 per hour)
mutation { resendVerificationCode(userId: "...") }
```

### Login Continuation and 2FA

```graphql
# Login may return tokens directly, or require an extra step
mutation {
  login(input: { email: "...", password: "..." }) {
    token
    refreshToken
    requiresVerification
    requiresTwoFactor
    twoFactorChallengeToken
    message
  }
}

# Complete the second factor with TOTP or a recovery code
mutation {
  completeTwoFactorLogin(
    challengeToken: "..."
    code: "123456"
    recoveryCode: null
  ) {
    token
    refreshToken
    user {
      id
      email
    }
  }
}
```

Behavior summary:

- `requiresVerification = true` means the client must finish email verification before tokens are issued.
- `requiresTwoFactor = true` means the client must continue with the 2FA challenge using `twoFactorChallengeToken`.
- 2FA uses authenticator-app TOTP codes and supports one-time recovery codes.
- Activating 2FA, disabling it, and logging in with a recovery code trigger security notifications by email and in-app.
- Auth observability stores 2FA activation/deactivation, recovery-code usage, rejected second-factor attempts, and known-user captcha rejects in `ActivityLog`.
- Expected 4xx auth rejects remain out of Sentry; only infrastructure/code failures should be captured there.

### Price History

```graphql
# Get price change history for a raffle
query {
  priceHistory(raffleId: "...") {
    id
    previousPrice
    newPrice
    changedAt
    percentChange
  }
}
```

### KYC Verification

```graphql
# Submit/update KYC data (sellers must do this before creating raffles)
mutation { updateKyc(input: { documentType: DNI, documentNumber: "12345678", cuitCuil: "20-12345678-5", street: "Av. Corrientes", ... }) { id kycStatus } }
```

### Raffle Relaunch

```graphql
# Relaunch cancelled raffle with suggested price
mutation {
  relaunchRaffleWithSuggestedPrice(
    input: { originalRaffleId: "...", priceReductionId: "..." }
  ) {
    id
    titulo
    precioPorTicket
    estado
  }
}

# Optional: override suggested price
mutation {
  relaunchRaffleWithSuggestedPrice(
    input: {
      originalRaffleId: "..."
      priceReductionId: "..."
      customPrice: 150.00
    }
  ) {
    id
  }
}
```

When a raffle is cancelled (<70% sold):

1. System calculates optimal price reduction
2. Creates `PriceReduction` record with `precioSugerido`
3. Sends email to seller with one-click relaunch button
4. Seller clicks button to instantly create new ACTIVA raffle with same product + suggested price

## Project Structure

```
src/
├── app.module.ts          # Root module
├── main.ts                # Entry point
├── common/
│   ├── constants/         # Fee rates, etc.
│   ├── decorators/        # @CurrentUser, @Public
│   ├── guards/            # JWT, Roles, Throttler
│   ├── events/            # Event emitter for decoupled architecture
│   ├── repositories/      # Repository pattern (BaseRepository + entity repos)
│   ├── utils/             # Encryption, full-text search utilities
│   ├── logger/            # Winston structured logging
│   └── scalars/           # DateTime, Decimal
├── auth/                  # Authentication
├── users/                 # User management
├── raffles/               # Core raffle logic
├── tickets/               # Ticket management
├── wallet/                # Saldo LUK accounts and ledger
├── payments/              # Mercado Pago/mock top-ups and seller payout connections
├── disputes/              # Dispute system
├── notifications/         # Email + in-app
├── uploads/               # Cloudinary
├── admin/                 # Admin features
├── tasks/                 # Cron jobs
└── prisma/                # DB client module

prisma/
├── schema.prisma          # Database schema
└── seed.ts                # Canonical QA/dev seed (E2E + manual QA + social promotion grant)
```

Pre-production workflow note:

- local development currently uses `schema.prisma` + `prisma db push`;
- migration files are intentionally not tracked until production rollout planning starts.

## Testing

### Running Tests

```bash
# Unit tests
npm run test              # Run all tests once
npm run test:watch       # Watch mode (re-run on changes)
npm run test:cov         # With coverage report (HTML at coverage/index.html)
npm run test:debug       # Debug mode with debugger

# Integration tests
npm run test:integration # Integration tests only (real database)

# All tests
npm run test:e2e         # E2E tests (from root)
```

### Test Infrastructure

The project uses **Jest** for unit/integration testing with pre-built utilities:

**Test Utilities** (`test/integration/setup.ts` and `test/integration/factories.ts`):

- `createTestApp()` - Complete NestJS application bootstrap for tests
- `cleanupTestApp()` - DB cleanup that respects model dependencies
- `generateTestToken(userId)` - JWT token generation for authenticated requests
- Factories: `createTestUser()`, `createTestSeller()`, `createTestRaffle()`, `createTestTicket()`, etc.

**Example Test Structure:**

```typescript
describe('AuthService', () => {
  let app: INestApplication;
  let authService: AuthService;

  beforeAll(async () => {
    app = await createTestApp();
    authService = app.get(AuthService);
  });

  afterAll(async () => {
    await cleanupTestApp(app);
  });

  it('should register a user', async () => {
    const user = await authService.register({ email: 'test@test.com', ... });
    expect(user.emailVerified).toBe(false);
  });
});
```

### Current Coverage

- **Overall:** 42%+ coverage with 770 passing tests across 49 spec files
- **Key modules tested:** auth, payments, raffles, tickets, disputes, notifications, users, and more

Run coverage report:

```bash
npm run test:cov
# Open coverage/lcov-report/index.html for detailed report
```

### Adding Tests

1. Create `.spec.ts` file next to the service/controller
2. Use test utilities from `test/integration/`
3. Import factories for test data
4. Run `npm run test:watch` while developing

See existing tests in `src/payments/` for examples.

## Admin Queries/Mutations

```graphql
# Get users with filters
query {
  adminUsers(filters: { role: USER, search: "email", onlyBanned: false }) {
    id
    email
    role
    isBanned
    deletedAt
  }
}

# Get user activity log
query {
  adminUserActivity(userId: "...") {
    id
    action
    entityType
    entityId
    createdAt
  }
}

# Ban/unban users
mutation {
  banUser(userId: "...", reason: "TOS violation") {
    id
    isBanned
  }
}
mutation {
  unbanUser(userId: "...") {
    id
    isBanned
  }
}

# Bulk resolve disputes
mutation {
  bulkResolveDisputes(
    disputeIds: ["..."]
    resolution: RESUELTA_COMPRADOR
    justification: "..."
  ) {
    successCount
    failedCount
  }
}
```

## Key Services

| Service              | File                                         | Purpose                                                             |
| -------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| AuthService          | `src/auth/auth.service.ts`                   | Registration, login, email verification                             |
| RafflesService       | `src/raffles/raffles.service.ts`             | Core raffle CRUD, seller dashboard, buyer experience, price history |
| WalletService        | `src/wallet/wallet.service.ts`               | Saldo LUK balances, ledger entries, buyer debits/refunds, seller payable |
| PaymentsService      | `src/payments/payments.service.ts`           | Credit top-up sessions, provider webhooks, top-up refunds, status sync |
| NotificationsService | `src/notifications/notifications.service.ts` | Email (Brevo) + in-app notifications + verification emails          |
| ActivityService      | `src/activity/activity.service.ts`           | Audit logging for all actions                                       |
| AdminService         | `src/admin/admin.service.ts`                 | Admin-only operations                                               |
| DisputesService      | `src/disputes/disputes.service.ts`           | Buyer protection workflow                                           |

## Database Schema

The Prisma schema is at `prisma/schema.prisma`. Key models:

| Model                 | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| User                  | Users with roles, seller payment-account status, email verification |
| Raffle                | Raffles with state machine                                 |
| Ticket                | Paid/refunded ticket records                               |
| Product               | Product details for raffles                                |
| WalletAccount         | Buyer spendable balance and seller payable balance         |
| WalletLedgerEntry     | Immutable Saldo LUK/payable movements                      |
| CreditTopUpSession    | Mercado Pago/mock loads of Saldo LUK                       |
| SellerPaymentAccount  | Connected Mercado Pago seller account for payouts          |
| TicketPurchaseReceipt | Immutable receipt snapshot for grouped ticket purchases    |
| Transaction           | Internal accounting records                                |
| Dispute               | Buyer protection disputes                                  |
| Notification          | In-app notifications                                       |
| ActivityLog           | Audit trail                                                |
| Category              | Raffle categories                                          |
| PaymentProviderEvent  | Webhook idempotency                                        |
| RaffleQuestion        | Questions asked by users on raffles                        |
| RaffleAnswer          | Seller answers to questions                                |
| EmailVerificationCode | 6-digit codes for email verification (15 min expiry)       |
| PriceHistory          | Track price changes on raffles                             |

## PII Encryption

All personally identifiable information (KYC data) is encrypted at rest using AES-256-GCM:

**Encrypted fields:**

- Document number (DNI, Passport, etc)
- CUIT/CUIL (tax ID)
- Street address
- City, province, postal code
- Phone number
- seller payout account identifiers

**Encryption Service:** `src/common/services/encryption.service.ts`

**How it works:**

1. When KYC data is submitted, all PII fields are encrypted before saving to database
2. When admin reviews KYC, data is decrypted on-the-fly for display
3. Data stored in DB is unreadable without the `ENCRYPTION_KEY`
4. Encryption auto-disables if `ENCRYPTION_KEY` is not set (development only)

**Important:**

- Use same `ENCRYPTION_KEY` across all deployments
- If key is lost, existing encrypted data cannot be recovered
- Generate with: `openssl rand -hex 32`

## Seller Payment Accounts And Payouts

Seller onboarding uses Mercado Pago OAuth for payout readiness.

- sellers connect Mercado Pago from `Configuración > Pagos`;
- KYC verified, address, CUIT/CUIL, and a connected Mercado Pago account are required before `sellerPaymentAccountStatus` becomes `CONNECTED`;
- ticket purchases credit an internal seller payable balance;
- payout processing runs only after delivery is confirmed and `confirmedAt + 7 days` has passed with no active dispute;
- when `MP_PAYOUTS_ENABLED=true`, payout processing calls Mercado Pago and transfers from Luk to the seller MP wallet;
- seller payable is debited only after Mercado Pago accepts the payout request;
- if Mercado Pago returns `pending` or `in_process`, the payout remains `PROCESSING` and can be synced until it becomes `COMPLETED` or `FAILED`.

## Environment Variables

| Variable               | Description                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | PostgreSQL connection string                                                                                                                 |
| `JWT_SECRET`           | Secret for JWT tokens (min 32 chars)                                                                                                         |
| `PLATFORM_FEE_PERCENT` | Luk platform fee percentage applied to ticket sales                                                                                          |
| `MP_ACCESS_TOKEN`     | Mercado Pago access token for Saldo LUK top-ups and Luk seller payout execution                                                             |
| `MP_OAUTH_CLIENT_ID`  | Mercado Pago OAuth app client id for seller payout-account connections                                                                       |
| `MP_OAUTH_CLIENT_SECRET` | Mercado Pago OAuth app client secret for seller payout-account connections                                                               |
| `MP_OAUTH_REDIRECT_URI` | Mercado Pago OAuth callback URL, usually `${BACKEND_URL}/payments/account/callback`                                                       |
| `MP_PAYOUTS_ENABLED`  | Enables live seller payouts through Mercado Pago. When `true`, missing MP payout/OAuth credentials fail backend bootstrap                    |
| `PAYMENTS_PROVIDER`   | `mercado_pago` for live top-ups or `mock` for local QA                                                                                       |
| `BREVO_API_KEY`        | Brevo email API key (must be REST API key `xkeysib-...`, not SMTP key)                                                                       |
| `CLOUDINARY_*`         | Cloudinary credentials                                                                                                                       |
| `FRONTEND_URL`         | Frontend URL for redirects                                                                                                                   |
| `BACKEND_URL`          | Backend URL for webhooks                                                                                                                     |
| `TURNSTILE_ENABLED`    | Enables Cloudflare Turnstile validation for email/password login and register                                                                |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key (backend only). See [docs/turnstile-production.md](../docs/turnstile-production.md)                         |
| `SENTRY_DSN`           | Backend/worker Sentry DSN (optional)                                                                                                         |
| `SENTRY_RELEASE`       | Backend/worker release identifier (optional, recommended in prod/staging)                                                                    |
| `ENCRYPTION_KEY`       | **64 hex chars** - Encrypts PII: KYC data (DNI, CUIT, addresses, phone) + seller payout account identifiers using AES-256-GCM. Generate with: `openssl rand -hex 32` |

## Troubleshooting

```bash
# TypeScript errors after schema change
npx prisma generate

# Reset database
npx prisma db push --force-reset

# Check circular dependency issues
# Use forwardRef pattern (see Module Dependencies above)
```

### Google OAuth 401 invalid_client

This error means OAuth credentials are misconfigured in Google Cloud Console:

1. Verify redirect URI matches `GOOGLE_CALLBACK_URL` exactly (including http vs https)
2. Ensure Client ID and Secret are correct
3. If app is in "Testing" mode, add your email as a Test user
4. Check credentials haven't been deleted or regenerated

See the `Google OAuth Setup` section above for the full local setup flow.
