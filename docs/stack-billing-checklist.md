# Northwood Bids — Stack & Billing Checklist

Every third-party service the business depends on (found in the codebase: SDKs,
env keys, and outbound API calls). After a card issue, check that each one's
payment method is current. Ordered by how badly it hurts if the bill lapses.

Legend: 🔴 confirmed problem · 🟠 customer-facing if it lapses · 🟡 admin/back-office only

| # | Service | What it runs for you | If the payment lapses | Where to check |
|---|---------|----------------------|------------------------|----------------|
| 1 🔴 | **GoHighLevel** (via your "A Eye Agency" account) | ALL customer texts/emails (won, outbid, payment, transfer alerts), **Woody** the AI concierge, the web chat widget, SMS number/A2P | Customers stop getting auction texts; Woody can't reply | **This one is already showing "failed payments."** Fix first — GHL agency billing settings |
| 2 🟠 | **Vercel** | Hosts and serves northwoodbids.com | Whole site can go down | vercel.com → your project → Settings → Billing |
| 3 🟠 | **Supabase** | Your database (all auctions, bids, users, orders) | Site errors / data unreachable if the project is paused | supabase.com → project → Settings → Billing |
| 4 🟠 | **Cloudflare R2** | Stores all item **photos** | Item images break across the site | dash.cloudflare.com → R2 / Billing |
| 5 🟠 | **Clerk** | Sign-up / sign-in / accounts | Bidders can't log in or register | dashboard.clerk.com → Billing |
| 6 🟠 | **Pusher** | Real-time live bidding (prices update without refresh) | Bids stop updating live; countdowns feel stale | dashboard.pusher.com → your app → Billing |
| 7 🟠 | **Stripe** | Charges auction winners; your payouts | Can't charge winners = no revenue (note: Stripe pays *you*, so a personal-card issue usually doesn't hit this — but confirm the account isn't restricted) | dashboard.stripe.com → account status |
| 8 🟠 | **Domain — northwoodbids.com** | Your web address | Site unreachable if the domain expires | Your registrar (whoever you bought the domain from) — check auto-renew + card |
| 9 🟡 | **UPCitemdb** | Barcode → product info when you add items | Barcode lookups fail (manual entry still works) | upcitemdb.com account/plan |
| 10 🟡 | **OpenWeb Ninja** | Amazon/product search + ASIN lookup when adding items | Product auto-fill fails (manual entry still works) | openwebninja.com (or RapidAPI) account |
| 11 🟡 | **F2A** | Secondary product-lookup provider (ASIN) | Falls back / lookup degrades | F2A API account |

## Not a separate bill (so you can skip them)
- **OpenAI (GPT-4.1)** — powers Woody, but it's billed *inside* GoHighLevel, not a separate account.
- **Twilio / A2P SMS** — your texting number and registration run *through* GoHighLevel's phone system, billed on the GHL account (#1).
- **Google Fonts, the filesafe.space / leadconnector CDNs** — free / part of GHL.

## Suggested order to check
1. **GoHighLevel first** — it's the confirmed failure and it silences customer texts + Woody.
2. Then the "site stays up" group: **Vercel, Supabase, Cloudflare R2, Clerk, Pusher** — a lapse here can take the site down or break core features.
3. **Stripe** and the **domain** — confirm both are active (revenue + reachability).
4. The three **product-lookup APIs** last — admin convenience only, nothing customer-facing.

## Tip
If the same card expired everywhere, update it on GoHighLevel, Vercel, Supabase,
Cloudflare, Clerk, and Pusher (and your registrar). Those six + the domain are the
ones that keep the lights on.
