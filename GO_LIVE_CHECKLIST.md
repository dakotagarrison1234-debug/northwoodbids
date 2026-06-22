# Northwood Bids — Go-Live Checklist

Authoritative pre-launch checklist (supersedes the old NEEDS_YOUR_HELP.md, which had wrong Stripe-Connect instructions — you are **direct charge, not Connect**).

## What this final pass fixed (already in code)
- **Payment-failed notification** — when a winner's card declines/SCA/no-card, the app now fires a `GHL_PAYMENT_FAILED_WEBHOOK` (SMS: "we couldn't charge your card, update it"). Biggest collection fix.
- **Payment-receipt notification** — `GHL_PAYMENT_RECEIPT_WEBHOOK` on successful charge (no duplicates: fires once at the real PAID transition).
- **Retry path** no longer marks Stripe `processing` as PAID — it stays PENDING until the webhook confirms.
- **Admin refund** — "Refund" button on each paid winner (Winners & Payments) → refunds in Stripe, marks REFUNDED, returns item to unsold.
- **"Who owes money"** now includes the 15% buyer's premium (was understated).
- **Closing-soon alert** now keys off real item end times (popcorn-aware), not the static auction end.
- **Item status** can no longer be force-moved ACTIVE→SOLD/UNSOLD outside the close pipeline.
- **Donor ("Donated by")** removed from item page/edit form/search (resale, not charity).
- **My Bids** shows an error/retry instead of a blank screen on load failure.
- **Security**: setup-intent IDOR closed, payment-method ownership verified, super-admin error leak fixed, import-image SSRF hardened (DNS/IP validation + no auto-redirect).
- **Schema defaults** made safe (premium 15 / tax 6 / not-exempt / charges-enabled true) so a new/seed org can't silently charge wrong or dead-end.

## DO BEFORE LAUNCH

### 1. Apply the schema change + deploy
```
cd ~/northwoodbids
npx prisma db push
find .git -name "*.lock" -delete
git add -A && git commit -m "Final pre-launch: payment notifications, refund, security, fixes" && git push
```

### 2. Set up the 2 NEW SMS notifications in GHL (same flow as the others)
Build two more workflows (Inbound Webhook → Create/Update Contact → Send SMS body `{{inboundWebhookRequest.smsMessage}}`), then set the env var = the URL:
- `GHL_PAYMENT_FAILED_WEBHOOK` — **do this one for sure**; it's how you get paid when a card declines.
- `GHL_PAYMENT_RECEIPT_WEBHOOK` — optional "payment received" confirmation.

### 3. Stripe webhook — STANDARD, not Connect
In Stripe → Workbench → Webhooks, the endpoint must be:
- URL: `https://northwoodbids.com/api/webhooks/stripe`
- Listen to: **Your account** (NOT connected accounts)
- Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`
- Put its signing secret in Vercel as **`STRIPE_WEBHOOK_SECRET`** (the old doc's `STRIPE_CONNECT_WEBHOOK_SECRET` / `/connect` route do not exist — ignore them).

### 4. Confirm the live org's money config
Run in Supabase SQL editor — it MUST read 15 / 6 / false / true:
```
SELECT name, "platformFeePercent", "taxPercent", "taxExempt", "stripeChargesEnabled" FROM "Organization";
```
If any are wrong, fix that row (the labels and the actual charges read from it).

### 5. MUST-SET env vars in Vercel (Production)
Required (app/payments broken without these):
- `DATABASE_URL`, `DIRECT_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL`
- `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- `PUSHER_APP_ID`, `PUSHER_SECRET`, `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER`
- `CLOUDFLARE_R2_ENDPOINT`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET`, `CLOUDFLARE_R2_PUBLIC_URL`  ← uploads fail silently if missing
- `CRON_SECRET`  ← without it auctions never close & winners never charge
- `NEXT_PUBLIC_APP_URL` = `https://northwoodbids.com`  ← SMS/email links break otherwise
- `SUPER_ADMIN_IDS` = your Clerk user id

Optional (features degrade gracefully): all `GHL_*_WEBHOOK` URLs, `GHL_WEBHOOK_SECRET`, `UPCITEMDB_API_KEY`, `OPENWEBNINJA_API_KEY`, `F2A_API_KEY`.

### 6. Confirm Vercel **Pro** plan
The cron uses `maxDuration: 300`. On Hobby it's capped (10–60s); large auctions would only finish charging across multiple cron ticks (the resumable sweep covers it, but Pro is cleaner).

## Pre-launch test run (real money, small)
1. Create an auction, add 1 cheap item ($1), open it.
2. From a real second account (incognito) with a real card: add card → bid → get outbid → confirm the **outbid SMS** arrives.
3. Let it close (or close manually) → confirm card charged → **won SMS** + **receipt SMS** arrive → item shows in My Bids → Past with invoice.
4. Test a decline (Stripe test card or a card with no funds in test mode) → confirm **payment-failed SMS** + the dashboard Retry works.
5. Admin: refund that payment → confirm Stripe refund + item returns to unsold.
6. Schedule a pickup; if items at another warehouse, request transfer → mark loaded → dropped-off → confirm **items-ready SMS** + scheduling unlocks.

## Recommended soon (non-blocking)
- **Rate limiting** on `bids`, `proxy-bids`, `setup-intent`, and the Amazon/UPC lookup routes (needs Upstash/Vercel KV).
- **Upload size policy** (presigned POST with content-length-range).
- **Pickup confirmation + day-before reminder** SMS (new cron pass).
- **Partial-refund / dispute** reflected in reports (currently full-refund + dispute flag only).
- Security headers / CSP in `next.config.ts`.
