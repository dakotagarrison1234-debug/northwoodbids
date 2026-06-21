# Northwood Bids — Launch-Readiness Audit

Full-codebase review across five areas: data model & scaling, security & authorization, payments, the bidding engine, and UX/flows. Each item is tagged with severity and the fix status as of this pass.

## What's already solid (verified, keep as-is)
- **Bid races are safe** — bids use an atomic conditional update (`updateMany where currentBid < amount`) inside a transaction; two simultaneous bids can't both win.
- **Auction close is double-close safe** — cron and manual close both atomically claim the auction status before acting.
- **Payment double-charge protection** — `@@unique([itemId, clerkUserId])` on Payment + a stable Stripe idempotency key per winner per auction.
- **Card-on-file is enforced server-side before bidding**; reserve price, min increments, and auction/item status are all checked server-side, not just in the UI.
- **Money is `Decimal` end-to-end** with integer-cent arithmetic; super-admin act-as cookie is safe; cron is locked behind `CRON_SECRET`; no secrets leak to the client.

---

## CRITICAL — fix before launch

| ID | Area | Issue | Status |
|----|------|-------|--------|
| P1 | Payments | 3DS/SCA card retry is unreachable (Connect-era `stripeAccountId` gate) — winners whose card needs authentication get a dead end and can never pay | fixed |
| P2 | Payments | Retry can double-charge if an auto-charge PI is still `processing` (different idempotency key, only checks status PAID) | fixed |
| P3 | Payments | Auto-charge records PAID without checking `paymentIntent.status === "succeeded"` — a `processing` PI that later fails is treated as paid | fixed |
| B1 | Bidding | Bid transaction guards only on `currentBid`, not item status — a bid can land on an item the cron is closing (close-vs-bid race) | fixed |
| B2 | Bidding | Proxy resolver can let a lower max win / not lead, and can auto-raise the current leader against a lower competing proxy (overpay) | fixed |
| B3 | Bidding/Privacy | Pusher channels are public and broadcast raw (truncated) user IDs — bidder activity is correlatable by anyone | fixed |
| S1 | Security | Invoice IDOR — any staffer can read any buyer's receipt/PII via `?user=` (not scoped to the auction's org) | fixed |
| D1 | Data | Live-item edit can overwrite `startingBid`/`currentBid` to 0 mid-auction | fixed |
| D2 | Data | Payment→Item is `onDelete: Cascade` — deleting an item destroys real financial records | fixed (schema) |

## HIGH

| ID | Area | Issue | Status |
|----|------|-------|--------|
| P4 | Payments | No Stripe webhook — async declines/refunds/disputes never reconcile Payment status | fixed (webhook added) |
| P5 | Payments | Post-charge Payment + item-status writes aren't in one transaction — crash mid-write leaves charged-but-unrecorded items | fixed |
| B4 | Bidding | Non-winning ACTIVE bids aren't terminalized at close — stale "you're winning" state | fixed |
| SC1 | Scaling | Hottest public page loads every item + full bid history; should load top bid only | fixed |
| SC2 | Scaling | Unbounded `findMany` + JS aggregation on dashboard/winners/reports/my-bids — won't hold at scale | fixed |
| SC3 | Scaling | Auction close charges winners serially; large auctions can hit the 5-min cron limit and leave winners uncharged with no retry | fixed |
| S2 | Security | `canAccessOrg` checks membership but not role — STAFF can close auctions (charge cards), edit settings | fixed (role gate on financial/destructive routes) |
| S3 | Security | Raw `err.message` returned to clients across many routes | fixed |
| UX1 | UX | Card-input text is near-white on cream (nearly invisible) — the single most critical input | fixed |
| UX2 | UX | Sign-up has no brand chrome and no `forceRedirectUrl` → phone capture skipped | fixed |
| UX3 | UX | Help/FAQ still says "the business will contact you" about pickup — contradicts the live self-scheduler | fixed |
| UX4 | UX | No bulk/"Save & Add Another"/clone for items — painful catalog entry | fixed |
| UX5 | UX | Settings is read-only — owner can't change tax/premium without a developer | fixed |

## MEDIUM / POLISH (selected)
- Missing indexes (Bid.placedAt, Payment by user/status, Item by org+status, Auction by status+endAt) — **fixed (schema)**
- Money/date/status-pill formatting duplicated ~95× with inconsistent output — **fixed (shared helpers)**
- Broken `rgba(108, 77, 57, …)` shadow (space breaks the utility) in 16 places — **fixed**
- Team page shows raw Clerk IDs; "who owes money" split across two screens — **fixed**
- Missing error/retry states on pickup + invoice; inconsistent loading/success feedback — **fixed**
- Input validation (negative prices, bad dates, photo URLs); GHL inbound webhook unauthenticated; SSRF blocklist gaps — **fixed**
- Palette strays (off-brand global-error, stray emerald/purple/yellow) — **fixed**

## Innovations added
- In-app urgency ("closing soon") cues, slot-scarcity hints, add-to-calendar for pickups
- "Save & Add Another" + duplicate item + quantity for fast catalog building
- One canonical "who owes money" view with one-tap reminder / email / call
- Shared design-system primitives (Card, StatusPill, EmptyState, money/date formatters) for consistency at scale

> Note: GHL notification wiring is intentionally excluded from this pass per your instruction.
