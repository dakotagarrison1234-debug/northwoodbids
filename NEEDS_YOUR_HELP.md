# Things That Need Your Help

These are the items Claude can't do for you — they require your login, credentials, or a decision. Go through these one by one.

---

## 🔴 CRITICAL (site won't work correctly without these)

### 1. Set `STRIPE_CONNECT_WEBHOOK_SECRET` in Vercel  ⚠️ UPDATED — this replaced the old item
The old `/api/webhooks/stripe` checkout webhook is GONE (that payment path was dead code and has been deleted).
The webhook that matters now is the **Connect** webhook — it's how the site learns an org finished
Stripe onboarding (`charges_enabled`). There's also a built-in fallback now (the Payments settings
page syncs directly from Stripe on load), but the webhook should still be set up.

Steps:
1. Go to [Stripe Dashboard → Developers → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **"Add endpoint"**
3. URL: `https://northwoodbids.com/api/webhooks/stripe/connect`
4. IMPORTANT: under "Listen to", choose **"Events on Connected accounts"** (not your own account)
5. Select event: `account.updated`
6. Copy the **Signing Secret** (starts with `whsec_`)
7. In Vercel → Settings → Environment Variables, set `STRIPE_CONNECT_WEBHOOK_SECRET` = that secret
8. You can DELETE the old `STRIPE_WEBHOOK_SECRET` var (and the old placeholder in `.env.local`)
9. Redeploy

Without this: org Stripe status only updates when an admin visits Settings → Payments (the fallback sync).

---

### 2. Make sure ALL env vars are set in Vercel (not just `.env.local`)
Your `.env.local` runs locally but Vercel needs its own copy. Check that all of these are in **Vercel → Settings → Environment Variables**:

| Variable | What it does |
|---|---|
| `DATABASE_URL` | Supabase connection (pooler) |
| `DIRECT_URL` | Supabase direct connection |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk auth (public) |
| `CLERK_SECRET_KEY` | Clerk auth (secret) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/register` |
| `CLOUDFLARE_R2_ENDPOINT` | Photo uploads |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | Photo uploads |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | Photo uploads |
| `CLOUDFLARE_R2_BUCKET` | `northwoodbids-photos` |
| `CLOUDFLARE_R2_PUBLIC_URL` | Public photo URL |
| `PUSHER_APP_ID` | Real-time bidding |
| `NEXT_PUBLIC_PUSHER_KEY` | Real-time bidding (public) |
| `PUSHER_SECRET` | Real-time bidding |
| `NEXT_PUBLIC_PUSHER_CLUSTER` | `us2` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe (public) |
| `STRIPE_SECRET_KEY` | Stripe (secret) |
| `STRIPE_WEBHOOK_SECRET` | ⚠️ See item #1 above |
| `NEXT_PUBLIC_APP_URL` | `https://northwoodbids.com` |
| `GHL_OUTBID_WEBHOOK` | GHL outbid alert |
| `GHL_BID_CONFIRM_WEBHOOK` | GHL bid confirmation |
| `GHL_AUCTION_WON_WEBHOOK` | GHL winner notification |
| `GHL_AUCTION_STARTED_WEBHOOK` | GHL auction opened notification |
| `GHL_PAYMENT_RECEIPT_WEBHOOK` | GHL payment receipt |
| `SUPER_ADMIN_IDS` | Your Clerk user ID |
| `CRON_SECRET` | Vercel cron auth token |

---

## 🟡 IMPORTANT (things that affect the bidder/staff experience)

### 3. Verify GHL Webhooks Are Active
You have 4 GHL webhooks configured. Log into GoHighLevel and confirm these 4 workflow triggers are active and published:
- Outbid alert (`XxX0a1AsG6LgLaZ9H25Q`)
- Bid confirmation (`d8da8902-82a2-4362-b6d1-dd5f7dcce8fa`)
- Auction won (`2e76ba0a-a996-45e7-919c-303c0d28e93b`)
- Payment receipt (`45ab070c-f3ce-4a90-a501-29e80737853a`)

If any are paused or in draft, winners won't get notified.

### 4. Test the Full Bidder Flow End-to-End (Before Going Live)
Walk through this yourself as a test bidder:
1. Sign up as a new user → you should land on `/register` to complete profile
2. Browse to a live auction → you should see items
3. Click an item → you should be able to bid
4. Outbid yourself from another account → first account should get an outbid email/SMS
5. Close the auction → winner should get a GHL notification
6. Click Pay → Stripe checkout should load
7. Complete payment → item should move to PENDING_PICKUP in admin
8. Admin marks item PICKED_UP → item should show as picked up in bidder dashboard

### 5. Set Up Stripe Customer Portal (Optional but Recommended)
If bidders want to manage their payment methods or see receipts, enable the Stripe Customer Portal:
[Stripe Dashboard → Settings → Customer Portal](https://dashboard.stripe.com/settings/billing/portal)

---

## 🟢 NICE TO HAVE

### 6. Add Your Organization Logo
Go to `/admin/settings` and upload your org logo. It appears in the admin sidebar.

### 7. Set a Custom Domain (Optional)
Currently the site is at `northwoodbids.com`. If you want a custom domain like `auction.givebid.com`:
1. Go to Vercel → your project → Settings → Domains
2. Add your domain
3. Update `NEXT_PUBLIC_APP_URL` env var to match
4. Update Stripe webhook URL in the Stripe dashboard to match new domain

### 8. Switch Stripe to Live Mode Properly
Your Stripe keys are already live mode (`sk_live_...`). Just make sure:
- Your Stripe account is verified and can accept real payments
- You've completed Stripe's business verification
- You've set up bank account for payouts in [Stripe → Settings → Payouts](https://dashboard.stripe.com/settings/payouts)

### 9. Review Clerk Email Templates
Clerk sends sign-in emails. Customize the branding at:
[Clerk Dashboard → Customization → Emails](https://dashboard.clerk.com)

---

## 📋 QUICK STATUS SUMMARY

What works right now without your help:
- ✅ Bidders can sign up, browse, and bid
- ✅ Popcorn bidding (auto-extends timer)
- ✅ Real-time bid updates via Pusher
- ✅ Admin can create/manage auctions and items
- ✅ Auto-open/close auctions via cron (every minute)
- ✅ Staff invite system
- ✅ Photo uploads to Cloudflare R2
- ✅ GHL outbid + won notifications (if webhooks are active)
- ✅ Status state machines prevent illegal status reversals
- ✅ Pickup tracking with progress bar

What needs your action first:
- ❌ Stripe webhook secret (item #1) — payments silently fail
- ❌ Vercel env vars sync (item #2) — production may be missing vars
