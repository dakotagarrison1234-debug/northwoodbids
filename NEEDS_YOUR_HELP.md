# ⚠️ This file is out of date

The Stripe-Connect instructions that used to be here are **wrong** — Northwood Bids uses a single
**direct-charge** Stripe account (no Connect, no `/api/webhooks/stripe/connect`, no
`STRIPE_CONNECT_WEBHOOK_SECRET`).

Use **GO_LIVE_CHECKLIST.md** instead. In short, the Stripe webhook is a **standard** endpoint at
`/api/webhooks/stripe` listening to your own account for `payment_intent.succeeded`,
`payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`, with its secret in
`STRIPE_WEBHOOK_SECRET`.
