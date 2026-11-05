# Glamora UPI integration

UPI is the default checkout provider. Customer QR creation is separate from bank
verification. The QR and pending-status changes are approved for release with
UPI_VERIFICATION_ENABLED=0. The supplied HDFC credit alert does not contain an
order reference, so secure automatic attribution remains unresolved. Automatic
payment confirmation must remain disabled.

Prior release validation: all 34 tests passed, the production build passed, and
the changed-source secret scan and Git whitespace checks passed. The critical
missing bank-to-order reference prevents enabling automatic payment confirmation
despite these passing tests.

Customer QR creation now works with verification disabled. Orders remain pending,
the UI explicitly warns that verification is unavailable and not to send money,
and no Gmail reads, UTR claims, reconciliation or payment finalization run while
disabled. Do not use this unfinished local flow to collect real customer payments.

## Package and architecture

`codemode-upi-pay` is pinned to commit
`144be72cca2f94a3ffb0fd14c9e56f34339fc2dc`. The server adapter uses its supported
custom Store interface, authenticated-alert parser, public payment format, UPI
links and QR generator. It intentionally replaces the upstream inbox reader and
default SQL matching rules. In particular, there is no amount-only matching or
unverified UTR claim. There is no HTTP simulation endpoint.

Clerk, catalog, addresses, Prisma, guest cart merging and existing shipping rules
remain in place. Both Buy Now and cart checkout send only IDs and quantities.
The server recalculates prices, stock limits, subtotal and shipping. Shipping is
free below Rs 1,000 and Rs 80 at or above Rs 1,000. The Order.total retains this
original total. New customer payment attempts request exactly this total, with no
extra paise. Historical attempts retain their stored amount. Attribution never
uses amount alone; separate same-amount orders still require verified references.

## Environment

Existing secrets remain in the ignored environment file. Never paste them into
source, screenshots, reports or a frontend `VITE_` variable.

| Name | Purpose |
|---|---|
| UPI_ID | The owner's configured receiving address; sole source of the payment destination |
| UPI_NAME | Payee name |
| GMAIL_ADDRESS | Dedicated mailbox receiving bank alerts |
| GMAIL_APP_PASSWORD | Gmail IMAP app password |
| UPI_API_KEY | Server-only fallback authentication for scheduled recovery |
| UPI_ALERT_SENDERS | Comma-separated exact alert addresses; no domains or wildcards |
| UPI_RECEIVING_ACCOUNT_LAST4 | Receiving account suffix shown in alerts |
| UPI_VERIFICATION_ENABLED | Keep `0`; controls Gmail sync, UTR claims and finalization independently of QR generation |
| DATABASE_URL | Existing pooled Neon runtime URL |
| DIRECT_URL | Existing direct URL for explicit migrations |
| CRON_SECRET | Recommended separate secret for the recovery endpoint; UPI_API_KEY is the fallback |
| PAYMENT_PROVIDER | Default UPI; `razorpay` selects backend rollback |
| VITE_PAYMENT_PROVIDER | Default UPI; `razorpay` selects frontend rollback at Vite startup/build |

The local HDFC exact sender and account suffix were added using the owner's
supplied information. The enable flag remains `0`. Existing secret values were
not replaced. `.env.local` takes precedence over `.env`; real process environment
variables take precedence over both. Restart the API after changing settings.

`npm run check:env` prints presence/validation flags only, without making provider
or Gmail calls. The environment example contains blank names only.

## Verification and recovery

1. The authenticated order endpoint calculates the original order total.
2. A durable exact-order-amount attempt is created using a PostgreSQL transaction and advisory lock.
3. React shows the exact amount, destination, reference, QR and UPI app link.
4. Polling uses Clerk bearer authentication and checks order ownership.
5. Gmail sync connects with TLS, opens INBOX read-only, and scans the oldest 100
   outstanding messages. A database lease prevents overlapping inbox readers.
6. The exact sender and Gmail's top Authentication-Results are checked using the
   package. Aligned DKIM or DMARC must pass. The message must identify the
   configured receiving-account suffix and a UPI credit with amount and 12-digit UTR.
7. Only the exact order reference can match an attempt. The credit must arrive
   between attempt creation (with one second of IMAP timestamp precision tolerance)
   and 30 minutes after expiry, and the amount must match
   the exact requested payable amount. Missing references remain unmatched.
8. A durable credit hash and parsed evidence are stored. Raw message bodies,
   passwords and authentication tokens are not stored in the payment tables.
9. Finalization re-reads evidence and the order under transaction locks. It records
   the unique payment/UTR, marks the order paid, decrements stock and removes
   purchased cart products atomically. Repeats return without repeating stock updates.
10. Every sync also reconciles paid attempts missing a Payment record, covering
    process crashes between credit matching and application finalization.

The browser, a screenshot, a QR, an app redirect or a submitted UTR cannot mark an
order paid. A UTR is only a lookup hint for already authenticated matching evidence.

Underpayments and overpayments require support review and never auto-fulfill.
Top-ups are not automatically combined. Cancelled orders or insufficient stock at
confirmation time produce a `review` payment without fulfillment. Another payment
for an already-paid order is recorded as `duplicate`, without reducing stock again.
Refunds are manual. Admin Payments includes mismatched attempts and unmatched credits.

## Database migration

The upstream package SQL was reviewed but was **not applied**: no upstream `upi_*`
tables/functions were created. Instead, `prisma/upi-migration.sql` adds:

- `glamora_upi_attempts`: SDK-compatible durable attempt payloads.
- `glamora_upi_credits`: authenticated parsed credit evidence, unique UTRs.
- `glamora_upi_inbox`: UID cursor, UID validity, lease and safe sync diagnostics.
- Payment.provider, Payment.upiPaymentId, Payment.utr and Payment.payableAmount.
- Nullable legacy Razorpay payment/order identifiers, retaining all historical values.

The models are represented in schema.prisma so Prisma knows about the new tables.
`npm run db:upi:migrate` is an explicit transactional migration with collision
checks. It is not run during install, startup, polling or a Vercel cold start.
It refuses already-present objects instead of guessing how to overwrite them.
No customer/order data is deleted. No reset, seed or destructive schema push was run.

The migration was tested against a PGlite database built from the original Prisma
schema and then applied to the configured Neon database. Do not rerun it blindly;
its collision checks will refuse a second application.

## Vercel

Reuse api/index.js and the existing /api rewrites. No permanent Node timer is used.
The custom store uses transaction-level locks, compatible with Neon pooling, and
a small pg pool. No upstream filesystem widget/SQL assets are needed at runtime.

`GET /api/cron/upi` performs bounded sync and reconciliation. Require
`Authorization: Bearer <CRON_SECRET>` (or UPI_API_KEY fallback). For recovery when
the customer closes the page, configure an external scheduler or Vercel Cron to
call it every minute or two **after verification is enabled**. No scheduler was
created and no production configuration was deployed. Vercel Hobby does not
support minute-level cron; choose an appropriate scheduler/plan. Vercel Cron uses
GET, which this wrapper supports. Polling while checkout is open also drives sync.
Monitor lastOk/lastError in Admin System. Existing 30-second function duration is
retained; inbox operations are bounded to 15 seconds and DB queries have timeouts.

## Bank validation before enabling

For a local destination-only QR check, open
`http://localhost:5173/checkout?preview=1` while the Vite and Express development
servers are running. No login, shipping address, order creation, Gmail access or
payment confirmation is used. The QR encodes the environment destination and a
Rs 1.01 preview amount with a non-order note. Scan to inspect and cancel; do not
authorize a payment. This is an actual scannable UPI URI, not simulated funds.
The local `/api/dev/upi-preview` endpoint rejects non-loopback requests, non-local
hosts, production and Vercel execution.

The same checkout URL with `?preview=1` now also supports a protected preview in
production builds. It requires Super Admin sign-in in both the UI and the backend.
The frontend calls `GET /api/upi/preview` with the existing Clerk bearer token;
the server enforces `requireAdmin` and a 10-request-per-minute rate limit. Responses
are private and non-cacheable. Destination and preview amount cannot be overridden
by request parameters. Only UPI_ID and UPI_NAME are needed for QR rendering;
Gmail credentials, database payment records and UPI_VERIFICATION_ENABLED=1 are not.
Ordinary customers cannot access this preview. Customer QR creation is a separate
authenticated order flow; preview still creates no order or payment attempt.
Bank verification and all finalization gates stay disabled while
UPI_VERIFICATION_ENABLED=0. An existing attempt, even if expired, is reused while
verification is unavailable rather than issuing a new request for money.

The protected preview changes have only been implemented and tested locally; no
Vercel variables were changed and no push or deployment was performed for them.

The supplied screenshots show HDFC's "has been successfully credited" and
"account ending in" wording. The parser now handles these phrases, with a synthetic
regression test. The displayed UPI reference is the bank UTR, not a Glamora order
note. No GLM order reference is visible in this sample, so this format cannot
automatically settle an order under the strict reference-matching policy.
The subsequently supplied raw email was inspected: Gmail's recorded results report
aligned DKIM, DMARC and SPF success, the exact configured sender and the expected
receiving-account suffix. Its credit format parses, but it still has no Glamora
order note. Independent cryptographic DKIM re-verification was not performed.
Order attribution remains unresolved, so automatic confirmation stays disabled.
No fallback to amount-only matching was enabled.

The bank UTR identifies a bank transaction, but the merchant does not know it when
the order QR is generated. Asking the customer to type a UTR does not prove that
the customer owns that credit. The alert also masks the payer identifier. A
reference-less genuine email therefore remains unmatched, even if an amount or
typed UTR happens to coincide with a pending order. Tests cover two such orders.

Release requires receiver-side evidence that binds the transaction to the order:
for example, a bank-authenticated feed/status API containing the merchant/order
reference, or an actual supported bank alert that echoes the exact QR reference.
No such binding has been demonstrated for the supplied HDFC alert. Adding a URI
note or changing an environment flag cannot manufacture missing bank evidence.

Export a genuine message from Gmail as raw `.eml`. Keep it outside version control.
`node scripts/validate-bank-email.mjs <path>` checks format/authentication/account
flags offline without connecting to Gmail, changing the database or printing mail
contents. This diagnostic alone does not establish that an arbitrary local file is
genuine: confirm it was exported directly from the authenticated mailbox. Review
the real message format, recipient account, exact amount, UTR, reference and
timestamps. Missing reference notes are intentionally not auto-approved. Enabling
live checkout requires changing UPI_VERIFICATION_ENABLED only after that validation.

## Rollback

The original service and client remain at server/services/razorpay.js and
src/lib/razorpay.js. Original routes are preserved in
server/routes/razorpay-orders.js; UI copies are RazorpayCheckout.jsx and
RazorpayPayNowButton.jsx. To roll back, set both provider switches to `razorpay`
and restart/rebuild. Keep the additive database schema: do not delete UPI records.
Old Razorpay webhook and /orders/verify remain available for payments already
started. Existing pending Razorpay orders cannot be silently converted into UPI
attempts; support must resolve them first to avoid duplicate charges.

## Validation

`npm test` uses only synthetic messages and isolated PGlite databases. Tests cover
single/multiple products, server pricing, email rejection, reference/amount/time
matching, duplicates, stock/cart finalization, shortages, crash rollback/recovery,
inbox backlog/leases, expired attempts, Gmail failures and endpoint authorization.
`npm run build` validates the production bundle. No real payments, Gmail login or
real-order status/stock updates are part of this validation.

Implementation validation results: all 27 tests passed in the final push-readiness
review; targeted matching,
finalization, Gmail-failure/retry and authorization checks were rerun after the
last hardening changes. The production build, Prisma schema validation and
`git diff --check` passed. A scan of all changed source files found no configured
secret values. Local frontend/API/catalog health checks passed; protected routes
returned 401 without authentication, and authenticated scheduled recovery returned
503 while the live-verification gate was disabled, as intended.

Read-only Neon verification after migration reported 4 categories, 12 products,
4 users, 8 orders, 3 existing payment records and all 3 new UPI tables. No real-order
payment/stock changes were performed during testing. Retry allocation is blocked
while a known Gmail connection error remains unresolved, preventing a new QR from
encouraging another payment before delayed credits can be checked.

The npm advisory audit reported 11 findings in the existing application toolchain
and dependencies (4 moderate, 5 high, 2 critical); no advisory named the newly added
UPI/IMAP/parser/pg/PGlite packages. No broad audit fix or unrelated major upgrade was
applied. Resolve those advisories separately before production release.

## Changed-file manifest

| File | Change |
|---|---|
| `.env.local` (ignored) | Added missing strict bank sender, account suffix and disabled verification flag; existing secrets preserved |
| `.env.example` | Blank variable names only |
| `.gitignore` | Exclude environment files/backups, raw emails, private keys and local AWS credentials |
| `package.json` | Pinned UPI package, direct dependencies and test/migration commands |
| `package-lock.json` | Locked dependency graph |
| `prisma/schema.prisma` | UPI models and optional/provider-neutral payment metadata |
| `prisma/upi-migration.sql` | Additive reviewed DDL |
| `scripts/migrate-upi.mjs` | Transactional migration and collision checks |
| `scripts/check-env.mjs` | Safe, offline environment-presence checks |
| `scripts/validate-bank-email.mjs` | Offline raw-email format diagnostic |
| `server/app.js` | UPI default routing, recovery endpoint, retained legacy verification |
| `server/index.js` | Close UPI pool during shutdown |
| `server/routes/orders.js` | Server pricing, authenticated UPI initiation and automatic status polling |
| `server/routes/upi-preview.js` | Local QR endpoint plus rate-limited Super Admin production preview; no order or confirmation operations |
| `server/routes/razorpay-orders.js` | Original routes preserved for rollback and outstanding payments |
| `server/routes/admin.js` | UPI payment metadata, system diagnostics and review API |
| `server/services/upi-security.js` | Exact sender/account, email parsing and matching checks |
| `server/services/upi-inbox.js` | Bounded TLS IMAP reader with safe checkpoints |
| `server/services/upi-store.js` | Atomic durable SDK custom store and inbox lease |
| `server/services/upi-finalize.js` | Evidence-backed transactional order/stock/cart finalization |
| `server/services/upi.js` | Server adapter, QR output, gating and reconciliation |
| `src/App.jsx` | UPI default and explicit rollback UI switch |
| `src/components/UpiPayment.jsx` | Exact-amount QR, payee details, instructions and authenticated polling |
| `src/components/PayNowButton.jsx` | UPI retry/check flow and explicit rollback selection |
| `src/components/RazorpayPayNowButton.jsx` | Original retry UI backup |
| `src/lib/api.js` | Authenticated UPI and admin API calls |
| `src/lib/chatbot.js` | Direct-UPI support wording |
| `src/pages/Checkout.jsx` | UPI single/cart checkout and purchased-item cleanup |
| `src/pages/UpiPreview.jsx` | Checkout destination preview using the local endpoint or authenticated production API |
| `src/pages/RazorpayCheckout.jsx` | Original checkout UI backup |
| `src/pages/OrderConfirmation.jsx` | UTR, exact received amount and review status |
| `src/pages/Account.jsx` | UTR history and review-aware retry availability |
| `src/pages/Admin.jsx` | UPI references, diagnostics and unmatched/mismatched-credit review |
| `src/pages/Home.jsx` | UPI payment label |
| `src/pages/ProductDetail.jsx` | UPI payment label |
| `src/pages/Policies.jsx` | Accurate payment-evidence/privacy/adjustment wording |
| `test/fixtures/baseline.sql` | Original Prisma schema for isolated migration tests |
| `test/upi.test.js` | Mocked payment, authorization and transactional PostgreSQL tests |
| `test/upi-preview.test.js` | Destination encoding, local restrictions, production admin authorization/rate limits and disabled real-checkout tests |
| `docs/upi-payments.md` | Configuration, operation, validation, limitations and this manifest |

The production build also regenerated ignored `dist/` output and Prisma generated
its ignored client under `node_modules/`. The pre-existing untracked PDF under
`images/mktools/` was not changed. No commits were created.

## Customer QR-only checkout update

The payment dialog has no UTR field, manual submission button or payment-app
redirect button. It shows the server-generated QR, payee details, exact payable
amount, instructions and pending status. The customer UTR HTTP endpoint has been
removed; internal bank UTR deduplication and admin review remain intact.

Polling can trigger bounded Gmail reconciliation only when verification is
explicitly enabled and configured. With UPI_VERIFICATION_ENABLED=0, no Gmail
monitoring or automatic finalization occurs. Existing bank-reference, authenticated
credit, amount, timing and idempotency checks are unchanged. No production
credentials, database changes or new dependencies are needed for this UI update.

Full automation requires a bank/acquirer API or authenticated notification that
binds a merchant-generated order reference to the verified transaction, or a
provider-issued per-order payment identifier with authenticated status lookup.
The supplied HDFC email does not supply that binding. A QR note is not proof
that an ordinary UPI app will preserve it in a bank email. Until this external
requirement is satisfied and validated end to end, keep verification disabled.
