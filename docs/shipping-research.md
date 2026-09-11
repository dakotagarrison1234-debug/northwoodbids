# Shipping — Research & Recommendation

_Researched Sept 2026. Goal: cost-effective, easy to integrate into the Next.js/Stripe stack, easy for staff to use, and fluent for the bidder. This is the reference for when we build it — nothing here is implemented yet._

---

## 1. What we're actually building (recap)

- Each item carries **weight + dimensions** (auto-filled from the Amazon product lookup when we scan; one-tap size presets otherwise).
- Winner chooses **Pickup or Ship** after the auction.
- If Ship: their won lots **auto-bundle** into one shipment → one rate-shopped quote → shown to the buyer → **buyer pays shipping** → label prints → tracking flows back to them.
- Staff confirm/adjust the box at pack time; the API re-quotes so the real number is exact.

The shipping provider we pick has to do four things well via API: **rate-shop, buy labels, validate addresses, and push tracking events**. Everything else is nice-to-have.

---

## 2. The candidates

| Provider | Per-label cost | Monthly fee | API? | Discounted rates | Verdict |
|---|---|---|---|---|---|
| **EasyPost** | **First 3,000/mo free**, then $0.08 | $0 | Yes — excellent, Node SDK | USPS *below* Commercial (Ground Advantage, Priority, Cubic) + UPS via their account | **Recommended** |
| **Shippo** | $0.05 | $0 (pay-as-you-go) | Yes — good, Node SDK | USPS Commercial Plus + Cubic, UPS, DHL | Strong runner-up |
| Pirate Ship | $0 | $0 | **No public API** | Best raw rates (Commercial Plus, Cubic, full UPS discounts) | Can't integrate — manual/benchmark only |
| ShipEngine | tiered | $75–$600 | Yes | Yes | Overkill / expensive for us |
| ShipStation | — | subscription | Yes | Yes | Warehouse-UI product, not API-first — skip |

Sources: [EasyPost pricing](https://www.easypost.com/pricing/), [EasyPost Wallet/BYOCA plans](https://support.easypost.com/hc/en-us/articles/39984592062605-EasyPost-Wallet-and-Bring-Your-Own-Carrier-Account-Plans), [EasyPost 2026 plan update](https://1teamsoftware.com/2026/02/09/easypost-new-pricing-plans-2026/), [Shippo USPS pricing overview](https://goshippo.com/shipping/usps-pricing-overview), [Shippo Node client](https://github.com/goshippo/shippo-node-client), [Pirate Ship integrations (no API)](https://www.pirateship.com/integrations/shipping), [2026 API comparison](https://revaddress.com/blog/shipping-api-comparison-2026/), [EasyPost vs Shippo 2026](https://www.aftership.com/blog/easypost-vs-shippo).

---

## 3. Why EasyPost

**Cost.** The first **3,000 labels a month are free** with no monthly fee. At our current pace that's simply $0. Even at high volume it's $0.08/label — $80 per 1,000 shipments — which is noise next to postage. Tracking is free when bundled with a label; address verification is free when bundled with a label. There is no cheaper *integrable* option.

**Rates.** EasyPost has a USPS agreement that prices **below Commercial** on Ground Advantage, Priority, flat-rate and **Cubic** tiers (the sweet spot for small, dense auction items — Cubic prices by box size, not weight, up to 20 lb / 18"). UPS discounts come through their carrier account with no setup. That's the same "big shipper" pricing Pirate Ship brags about, but with an API.

**Integration.** Clean REST API + official Node SDK, exactly the shape we need: `Shipment.create(from, to, parcel)` → returns all carrier rates → `buy(rate)` → label URL + tracking number. Webhooks for tracking events. One account, multiple "from" addresses (Owosso + Gladwin).

**Why not Shippo?** It's a perfectly good second choice — $0.05/label is cheaper *per label above 3k/mo*, but there's no free tier, so EasyPost wins until we're shipping thousands a month, and even then the difference is $0.03 a label. Equivalent rate discounts and SDK quality. If EasyPost ever changes its free tier, Shippo is the drop-in fallback — the integration shape is nearly identical.

**Why not Pirate Ship?** Best raw rates and truly free, but **no API**, so it can't power the auto-bundle → quote → charge flow. Keep it as a manual backup and as a rate benchmark to sanity-check EasyPost's numbers.

---

## 4. Rate reality (what buyers will actually pay)

Rough commercial-tier expectations for our typical lots (buyer pays these, we never eat postage):

- Small/light (under ~1 lb, fits a small box): **USPS Ground Advantage ~$5–7**.
- Small but dense/heavy (up to 20 lb, all sides under 18"): **Priority Mail Cubic ~$8–12** — often *cheaper* than weight-based for heavy small items. This is our secret weapon for tools/electronics.
- Medium (2–5 lb): **Ground Advantage or UPS Ground ~$9–15**.
- Large/heavy/oversized: **UPS Ground**, or **pickup-only**.

Rule of thumb for the ship-eligible flag: **under 20 lb and under 18" on every side = ship; bigger = pickup/transfer only** (unless we deliberately opt a big item in).

---

## 5. Design decisions (locked in during planning)

1. **Buyer pays actual shipping.** Never a flat "free shipping" — that's where auction margins die. Show an estimate at bid time, exact at checkout.
2. **Always show the number before charging.** No surprise second charge on the saved card. Quote → buyer taps Pay (or approves) → then we charge via Stripe → then we buy the label. Charging a blind amount is a chargeback magnet.
3. **Bundle per winner per warehouse.** One box per (winner × warehouse). If a winner's lots are split across Owosso and Gladwin: either two shipments, or transfer to consolidate first (our existing transfer flow) — decide per order by cost.
4. **Weight + dims on every item**, captured at listing. Auto-fill from product lookup; presets (Envelope / Small / Medium / Large / Oversize / Pickup-only) for the rest. Manual override always available.
5. **Auto-bundle math:** sum weights; estimate the box by total volume snapped up to the next standard box, floored at the largest single item. Staff confirm or bump the box at pack → API re-quotes → exact. (Carriers use dimensional weight, so dims can't just be added — the box estimate is what makes this accurate.)
6. **Insurance** on items over ~$100 declared value (EasyPost insurance ≈ 1% of value, buyer's option or baked into the quote for high-value lots).
7. **Packaging:** free USPS Priority/Cubic boxes for Priority; stock a few standard box sizes for Ground Advantage/UPS. The "standard box" list is what the bundle math snaps to.

---

## 6. What we'll need to add (plumbing)

- **Item:** `weightOz`, `lengthIn`, `widthIn`, `heightIn`, `shipEligible`, `sizePreset`.
- **Bidder:** shipping address (validated via EasyPost on save).
- **Shipment model:** winner, warehouse, items[], rate quoted, carrier/service, label URL, tracking #, status (QUOTED → PAID → LABELED → IN_TRANSIT → DELIVERED), Stripe PaymentIntent for the shipping charge.
- **Flow:** post-auction "Pickup or Ship?" → quote → pay → label → tracking webhook → SMS "shipped" / "delivered" (reuse the GHL webhooks).
- **Admin:** a Ship queue (like the pickup board) — pack, confirm box, print label, mark shipped.

---

## 7. Cost summary

| Item | Cost |
|---|---|
| EasyPost account | $0/mo |
| Labels | $0 (first 3,000/mo), then $0.08 |
| Tracking + address verification | $0 (bundled with labels) |
| Postage | Paid by the buyer at discounted commercial rates |
| Insurance (optional, high-value) | ~1% of declared value |
| Packaging | Free USPS boxes for Priority; a few bulk standard boxes for the rest |

**Net cost to run shipping: effectively $0 in software.** The only real costs are packaging and labor, and postage is passed through.

---

## 8. Open questions to settle before building

- Do we offer **shipping on every eligible item by default**, or opt items in per listing? (Recommendation: eligible-by-default using the size rule, with a per-item override.)
- **Return policy** for shipped items — auction sales are typically final; we should say so plainly on the item and at checkout.
- **Handling time** promise (e.g., "ships within 2 business days of payment").
- Whether to let buyers **combine multiple auctions** into one shipment (hold-and-combine) — great for savings, adds a holding-period rule.

---

_Decision: **EasyPost**, with Shippo as the documented fallback. Pirate Ship stays as a manual backup / rate sanity-check. Nothing built yet — this is the plan of record._
