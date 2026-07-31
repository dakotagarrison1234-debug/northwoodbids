# Northwood Bids — Monthly Cost Tracker

Running list of what the stack costs. Amounts filled in as confirmed; the rest
are TBD until you check them.

| Service | Monthly cost | Billing type | Payment OK? | Notes |
|---------|-------------:|--------------|:-----------:|-------|
| UPCitemdb | $99.00 | Flat monthly | ✅ | Barcode → product lookup |
| Supabase | $75.00 | Monthly plan | ✅ | Database |
| OpenWeb Ninja | $25.00 | Monthly / usage | ✅ | Amazon product search |
| F2A | $19.99 | Flat monthly | ✅ | ASIN/product lookup |
| Vercel | $20.00 | Monthly plan | ✅ | Hosting |
| Clerk | $0.00 (free tier) | Free until ~10k users | ✅ | Login / accounts — watch for tip into paid as you grow |
| GoHighLevel | $20.00 | Monthly (SMS) | ✅ | CRM, texts, Woody, chat widget — SMS portion; confirm if a separate platform/agency fee exists |
| Cloudflare R2 | $0.00 | Free tier | ✅ | Item photo storage — watch as photo volume grows |
| Pusher | $0.00 | Free tier | ✅ | Live bidding — watch as concurrent bidders grow |
| Clerk | $0.00 | Free tier | ✅ | Login — tips into paid ~10k users |
| Stripe | ~2.9% + $0.30 / charge | Per-transaction (no flat fee) | ✅ | Charges winners — scales with sales, not a fixed line |
| Domain (northwoodbids.com) | ~$1–2/mo | Annual renewal | — | Web address (~$12–20/yr) |

### 💰 Fixed monthly total: **~$258.99/mo**
UPCitemdb $99 · Supabase $75 · OpenWeb Ninja $25 · F2A $19.99 · Vercel $20 · GoHighLevel $20 · Clerk/R2/Pusher $0 (free tiers)

**Plus variable:** Stripe fees (~2.9% + $0.30 per sale) and the domain (~$12–20/yr).

**Biggest levers if you ever trim:** UPCitemdb ($99) + OpenWeb Ninja ($25) + F2A ($19.99) = **~$144/mo** on product-lookup APIs — worth a look at whether all three are needed, or if the cheaper ones cover it.

**Notes:**
- **Stripe** isn't a flat monthly cost — it takes a cut per charge (~2.9% + $0.30), deducted from payouts. Track it as a % of sales, not a fixed line.
- **Domain** is usually billed yearly — divide by 12 for the monthly equivalent.
- **OpenAI / SMS number** roll up inside GoHighLevel's bill, not separate lines.
