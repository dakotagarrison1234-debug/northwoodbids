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

## 4. Rate reality — July 12, 2026 USPS pricing (what a label actually costs us)

USPS changed prices twice in 2026 (Jan +7.8% on Ground Advantage, plus an 8% "transportation" surcharge Apr 26 → Jan 17 2027) and restructured on July 12. Anything older is stale. A **holiday surcharge is proposed Oct 4 2026 → Jan 17 2027** (+$0.40 to +$20.80 by zone/weight, pending PRC) — re-check numbers in October.

**Zones from mid-Michigan (Owosso 48867 / Gladwin 48624).** Zone 1–2 ≈ Michigan. Zone 3 ≈ OH/IN/IL/WI/W-PA/KY. Zone 4 ≈ NY/NJ/E-PA/MN/IA/MO/TN. Zone 5 ≈ New England, VA→GA, AL/MS/AR/OK/KS/NE/Dakotas. Zone 6 ≈ FL/TX/CO/MT/WY. Zone 7 ≈ UT/AZ/NM/ID/NV. Zone 8 ≈ CA/OR/WA + AK/HI.

**USPS Ground Advantage — commercial (what EasyPost buys at or slightly below):**

| Packed weight | Zone 1–2 (MI) | Zone 4 | Zone 8 | Notes |
|---|---|---|---|---|
| Under 1 lb (any oz) | ~$5.50 | $7.46 | ~$8.40 | July 2026 killed the 4/8/12 oz tiers — every sub-1-lb parcel bills at the old 15.99 oz price per zone |
| 1 lb | $7.61 | ~$8.30 | ~$10 | |
| 2 lb | $7.99 | | | |
| 3 lb | $8.64 | | | |
| 5 lb | $9.70 | ~$12 | ~$19 | |
| 10 lb | $11.91 | ~$15 | ~$25 | |
| 15 lb | $15.23 | ~$20 | ~$35 | |
| 20 lb | $16.46 | ~$24 | ~$40+ | retail is $55–69 at zone 7–8 |

Weight rounds **up to the next whole lb** over 1 lb. 2–5 business days, tracking + $100 insurance included, 70 lb max. **No dimensional weight under 1 cu ft (1,728 cu in).** Over 1 cu ft: billable = max(actual, L×W×H ÷ 139), dims rounded **up** to whole inches. USPS has no residential / fuel / delivery-area surcharges.

**Cubic pricing (the secret weapon for small heavy stuff).** Priced by outside box volume, weight ignored up to 20 lb. Limits: ≤ 22" longest side (raised from 18" in July 2026), ≤ 20 lb. *Ground Advantage Cubic* goes to 1.0 cu ft in ten 0.1 tiers; *Priority Mail Cubic* (1–3 day) to 0.5 cu ft in five tiers. Cubic only rose 8% this year while sub-1-lb GA rose up to 40%, so it wins more often than it used to. Rule: **cubic beats weight-based once packed lbs > (tier in tenths)** — a 0.2 cu ft box wins above 2 lb, a 0.5 cu ft box above 5 lb, a 1.0 cu ft box above 11 lb. Tier = L×W×H ÷ 1728 rounded **up** to the next 0.1, so box choice literally sets the price — an inch on one side can bump a tier. Priority Cubic often buys 1–3 day service for roughly what Ground Advantage costs.

**Priority Mail (weight-based)** commercial from $9.04 (1 lb) / $11.39 (5 lb) / $14.50 (10 lb) / $20.56 (20 lb) near-zone; far-zone heavy is brutal ($94–109 retail for 20 lb to zone 8). Only worth it via Cubic or when speed matters.

**UPS Ground Saver** (UPS line-haul, USPS last mile, no residential surcharge): loses to Ground Advantage under ~8–10 lb; starts competing **above 10–15 lb on far zones**. Always dim-weighted (÷139 on every box). EasyPost rate-shops it automatically, so we don't hand-pick — we just let the cheapest valid rate win.

**Practical read for our lots:** most opted-in items will be sub-5-lb → **$5.50–$12 anywhere in the country, $5.50–$9.70 in Michigan.** Heavy (10–20 lb) is fine in-state ($12–16) and gets expensive west of the Rockies ($25–40). Over 20 lb or over 22" on a side falls out of Cubic and into weight+dim pricing — that's the natural "pickup-only unless deliberately opted in" line.

Sources: [I'd Ship That — Ground Advantage 2026](https://idshipthat.app/shipping-rates/usps-ground-advantage/), [I'd Ship That — Priority Mail 2026](https://idshipthat.app/shipping-rates/usps-priority-mail/), [String — Cubic pricing July 2026](https://www.meetstring.com/blog/usps-cubic-pricing-what-you-need-to-know/), [Pirate Ship — Priority Mail Cubic](https://www.pirateship.com/usps/priority-mail-cubic), [UPS vs USPS 5 lb 2026](https://www.atomixlogistics.com/blog/ups-vs-usps-5lb-shipping-costs), [UPS Ground Saver 2026](https://shippinglabel.co/blog/ups-ground-saver).

---

## 4b. How Whatnot does it (the model we're copying)

- **Shipping profile = packed weight** (item + box/mailer + fill), chosen at listing from suggested weight bands, or a custom profile with weight + optional dims + optional *max bundle size* + optional *incremental weight* ("first item 20 oz incl. packaging, each additional 15 oz").
- **Buyer price is a flat tier table, not the raw label:** under 1 lb by ounce band ($4.47–$6.75 incl. fees); **1–5 lb flat $7.75 regardless of distance**; over 5 lb by weight + distance; Flat Rate $12.99 (Whatnot subsidizes it). Buyers see the number before checkout.
- **Smart Bundling:** same buyer + same seller → items merge into one shipment automatically. Shipping is charged as each item is bought, but when a new item joins an open bundle, its shipping is **recalculated on the combined weight and the buyer only pays the delta** (sweatshirt 2 lb = $7.75 → add a 1 lb tee, still 1–5 lb, +$0 → add a 12 oz hat, still +$0). Bundles can also be *split* when that's cheaper. Bundling continues until the seller prints the label.
- **Incremental weights by category** (cards 0.5 oz, comics 2.5 oz, diecast 3 oz) so a stack of light items doesn't get charged full packaging each time.
- **Weekly Bundling** (intl markets): buyer opts in, seller holds all week, ships within 2 days of Sunday close; buyer pays the difference if the bundle moves up a weight class.
- **Ship-time promise:** sellers ship within 2 business days; buyers told 5–14 days door-to-door.
- **Delivery surcharges:** AK/HI/PR/military at plain commercial; packages over 1 cu ft priced on dim weight.

Sources: [Whatnot — shipping profiles](https://help.whatnot.com/hc/en-us/articles/4407962164621-Choose-shipping-profiles-for-your-listings), [Whatnot — buyer shipping costs](https://help.whatnot.com/hc/en-us/articles/16369289657741-Shipping-for-buyers-in-the-US), [Whatnot — Smart Bundling](https://help.whatnot.com/hc/en-us/articles/16285911553677-How-Smart-Bundling-works), [Whatnot — Weekly Bundling](https://help.whatnot.com/hc/en-us/articles/36574693132173-Weekly-Bundling-Feature).

---

## 4c. Proposed Northwood model (to confirm)

**Listing — 3 quick presets + custom.** One tap during item creation; product lookup pre-selects when it knows weight/dims.

| Preset | Packed weight | Box it snaps to | Cubic tier | Typical stuff |
|---|---|---|---|---|
| **Small** | under 1 lb | padded mailer or 8×6×4 (0.11 cu ft) | 0.2 | phone cases, cables, cosmetics, small kitchen gadgets |
| **Medium** | 1–5 lb | 12×9×6 (0.38 cu ft) | 0.4 | small appliances, shoes, toys, most Amazon-return-size items |
| **Large** | 5–15 lb | 16×12×8 (0.89 cu ft) | 0.9 | tool sets, small electronics, multi-packs |
| **Custom** | exact oz + L×W×H | computed | computed | anything odd; > 20 lb or > 22" is automatically pickup-only unless you flip the override |

Each preset stores `weightOz`, `lengthIn/widthIn/heightIn` (staff can nudge), plus `incrementalOz` (default: item weight + 2 oz fill, i.e. the box is only counted once per bundle).

**Buyer-facing price = flat tier table (Whatnot-style), zone-aware, slightly under our expected cost on far zones and slightly over in-state so it averages out with a customer lean.** Shown as "Ships from $X" on the card, exact tier at checkout once we know the address.

| Bundle packed weight | Michigan (Z1–2) | Midwest / East (Z3–5) | West / Far (Z6–8) |
|---|---|---|---|
| under 1 lb | $5.49 | $6.99 | $7.99 |
| 1–5 lb | $7.49 | $9.99 | $12.99 |
| 5–10 lb | $10.99 | $14.99 | $19.99 |
| 10–20 lb | $14.99 | $21.99 | $29.99 |
| over 20 lb / over 22" | pickup-only (or actual UPS rate if opted in) | | |

Expected margin per label: in-state −$0.50 to +$1 (we're at or a hair under cost), Z3–5 roughly break-even, Z6–8 we eat $1–5 on heavy bundles. That's the "slight favor for the customer" — the tier table is the **ceiling**: at label time EasyPost rate-shops GA vs GA-Cubic vs Priority-Cubic vs UPS Ground Saver and buys the cheapest; if the real label comes in under the tier we still charge the tier (that's our packaging + labor), if it comes in over, we eat it. Admin sees the spread per shipment so the table can be tuned.

**Bundling rule.** One open bundle per (winner × warehouse). First item = its full packed weight; each additional item adds its `incrementalOz`. Box = smallest standard box whose volume ≥ sum of item volumes × 1.15 fill factor, floored at the largest single item's dims. Tier = bundle weight band × buyer's zone. **When a new win joins an open bundle, shipping is recomputed on the combined weight and the buyer only ever pays the difference** (usually $0 — that's the whole pitch: *"win more, ship for free"*).

**Hold-to-combine: 7 days** from the first ship-eligible win. Bundle closes at day 7 (or earlier if the buyer taps *Ship it now*), then **ships within 3–5 business days**. Text at close + at label scan + at delivery (existing GHL webhooks).

**Standard box list** (what the snap math uses, all under 1 cu ft so no dim weight, all under 22"): 6×4×4 (0.06), 8×6×4 (0.11), 10×8×6 (0.28), 12×9×6 (0.38), 14×10×8 (0.65), 16×12×8 (0.89), 18×14×8 (1.17 — dim-weighted, Large-only). Plus free USPS Priority boxes when Priority Cubic wins the rate shop.

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

- **Item:** `shipEligible` (default false), `sizePreset` (SMALL/MEDIUM/LARGE/CUSTOM), `weightOz`, `lengthIn`, `widthIn`, `heightIn`, `incrementalOz`.
- **ShippingBundle model:** winner, warehouse, items[], status (OPEN → CLOSED → LABELED → SHIPPED → DELIVERED), opensAt/closesAt (7-day), tier charged, Stripe PaymentIntent, EasyPost shipment id, label URL, tracking #, actual label cost (for the margin report).
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

## 8. Decisions so far (Sept 11, 2026)

- **Eligibility: off by default — Dakota opts items in** per listing (toggle next to the size preset). Over 20 lb / over 22" can't be opted in without the custom override.
- **Pricing: Whatnot-style tier estimates**, sizes/weights captured at listing via 3 presets + custom, with bundling that leans toward the customer (we'll eat small overages rather than lose a sale to scary shipping).
- **Combining: hold up to 7 days** to bundle wins across auctions.
- **Handling: ships within 3–5 business days** after the bundle closes.
- EasyPost stays the provider (rate-shop → buy → tracker webhook → refund unused labels; refunds take 2–4 weeks; insurance ~1% of declared value, $1 min; address verification free when tied to a label, $0.02 standalone).

## 9. Final decisions (Sept 11, 2026) — build to this

**Buyer flow**
1. **Item page shows two boxes before bidding: `Pickup` (free) and `Ship` (with the price).** Ship box shows the buyer's zone-exact tier if they have an address on file, otherwise "from $5.49". Items not opted in show Pickup only.
2. **First tap on Ship:** modal asks for a shipping address (EasyPost-verified on save, lower 48 only) and explains how shipping works in three lines (one price per box, extra wins ride free until the box fills up, we hold 7 days to combine, ships 3–5 business days after). Choice is remembered per item and defaults to their last choice on the next item.
3. **The choice is tied to the lot when it ends.** Nothing is charged for shipping until they actually **win**. Lost lots never count toward anything.
4. **Charging (delta model):** on a win with Ship selected, the item joins the buyer's open bundle. First win pays the tier for the bundle's weight band. Later wins recompute the bundle: same band → **$0**; band moves up → charge only the **difference**. Example: 4 lots, first = $7, lots 2–3 = free, lot 4 pushes the band = +$7. If they lose lot 4, they've only ever paid $7 for the 3. (Charge is attached to the win invoice, so it flows through the existing pay/retry/claim-lock path.)
5. **Bundle life:** opens at first shipped win, **closes 7 days later** or when the buyer taps *Ship it now*. Day 6 text: "Your box ships tomorrow." Day 7: auto-close (nothing new to charge — deltas were already taken at each win), move to the pack queue, **ships within 3–5 business days**. Texts at label scan + delivery.
6. **Ship-to: lower 48 only.** AK/HI/PR/APO addresses are rejected at address entry with a pickup-only note.
7. **Speed: ground only** — no upgrade menu. EasyPost picks the cheapest of GA / GA-Cubic / Priority-Cubic / UPS Ground Saver at label time; Priority Cubic winning is a free speed bonus for the buyer.
8. **Insurance: none.** No add-on, no auto-insure, no insurance UI. Carrier-included coverage is whatever it is.
9. **Bid Bucks / referral credit: items only** — never applied to shipping.
10. **Returns wording:** all sales final (already policy); shipping charges are non-refundable once the label is bought.

**Operations**
11. **Eligibility: opt-in per item** (default off). Toggle sits next to the size preset in item create/edit. > 20 lb or > 22" can't be toggled on without the Custom override.
12. **Sizes: 3 presets + Custom** (Small < 1 lb / Medium 1–5 lb / Large 5–15 lb / Custom oz + L×W×H), each with packed weight, snap box, and incremental weight (§4c). Product lookup pre-selects when it knows weight/dims.
13. **Price: the tier table in §4c is a hard ceiling.** Buyer always pays the tier; we buy the cheapest real label; we keep the spread when under, eat it when over. Admin ship queue shows charged vs. actual per box so the table can be tuned.
14. **Mixed warehouses → consolidate at Owosso, always.** Gladwin wins in a Ship bundle auto-transfer to Owosso using the existing transfer flow (same mechanics as preferred-location pickup transfers). One shipping station, one box stock.
15. **Transfer not landed at day 7:** bundle still closes on day 7; the 3–5 day handling clock starts when the last item reaches Owosso; buyer texted "waiting on transfer."
16. **Standard box stock (Owosso):** 6×4×4, 8×6×4, 10×8×6, 12×9×6, 14×10×8, 16×12×8, 18×14×8 + free USPS Priority boxes. Snap math uses exactly this list.

**Build order (phases, each shippable alone)**
- **P1 Schema + listing:** Item ship fields + `ShippingBundle` + `BidderProfile.shippingAddress*`; presets UI in item create/edit; opt-in toggle. No buyer-facing change yet.
- **P2 Item page + bundle engine:** Pickup/Ship boxes, address modal, tier engine (`lib/shipping/tiers.ts`), bundle engine (`lib/shipping/bundle.ts`: join / recompute / delta / close), delta charge wired into close-auction win invoicing, dashboard "Your box" card with live price + *Ship it now*, 7-day cron close + day-6 text.
- **P3 Labels + admin queue:** EasyPost client (`lib/easypost.ts`), Owosso consolidation transfers, admin `/admin/shipping` pack queue (confirm box, rate-shop, buy label, 4×6 print via existing label PDF path, mark shipped), charged-vs-actual margin column, refund-label action.
- **P4 Tracking:** EasyPost tracker webhook → bundle status → GHL texts (shipped / out for delivery / delivered), buyer tracking link on dashboard.

Env needed from Dakota before P3: `EASYPOST_API_KEY` (create the account, add the key in Vercel; I never see it).

---

_Decision: **EasyPost**, with Shippo as the documented fallback. Pirate Ship stays as a manual backup / rate sanity-check. §9 is the locked spec; §4c has the numbers. Nothing built yet — this is the plan of record._
