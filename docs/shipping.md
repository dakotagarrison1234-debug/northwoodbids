# Shipping — how a box moves through the system

Spec of record: `docs/shipping-research.md` §9. Numbers (tiers, zones, boxes):
`lib/shipping/tiers.ts`. Engine: `lib/shipping/bundle.ts`. This page is the
operational wiring: what runs when, and what the money does.

## Decisions (final)

- **Both warehouses ship.** Owosso and Gladwin are each a shipping station
  (`PickupLocation.isShippingStation`, a plain per-location toggle — any number
  of locations can be one). A station packs and ships its own boxes; **nothing
  is transferred between stations**.
- **One open box per buyer PER station.** Lots won at Owosso go in the buyer's
  Owosso box, lots won at Gladwin in their Gladwin box (`ShippingBundle.locationId`).
  A buyer with wins at both has two boxes, two tiers, two labels.
- A lot at a location that is **not** a station still rides a transfer to the
  org's default station (`stationForItem` → `transfer: true`).
- **Three listing presets, calibrated to what we actually sell** (`PRESETS` in
  `lib/shipping/tiers.ts`): Small 6 oz 6×4×3 (phone case, charger, pens, hand
  towel), Medium 1 lb 8×8×6 (Nerf pistol, body towel, stuffed animal), Large
  3.5 lb 12×9×6 (bigger than a shoebox). A lister can nudge a preset's weight;
  the dims are fixed. Typical fills in Michigan: 6 Smalls = $7.49, 4 Mediums =
  $7.49, 2 Larges = $10.99 (each extra lot adds its weight + 2 oz fill).
- **All 7 box sizes stay** (`BOXES` in `lib/shipping/tiers.ts`).
- **No minimum order.** One small lot ships on its own if that's what they won.
- **The ship-to address is frozen when a box opens.** Changing the address in
  Account applies to the buyer's *next* box; an open box keeps what it opened with.

## Lifecycle

1. **Bid.** The item page offers a Pickup / Ship switch with this lot's price.
   The mode is **one setting per buyer** (`BidderProfile.lastFulfillment`,
   PICKUP by default): pick Ship on any lot (or on `/shipping`) and every lot
   they win ships until they pick Pickup. `ItemShipChoice` is written only as an
   audit of where the switch was flipped — nothing reads it. A lot that can't
   ship is pickup regardless of the mode. Nothing is charged for shipping until
   the buyer actually wins.
2. **Win → box.** The instant a lot's winner is known (`closeItem` in
   `lib/closeAuction.ts`, used by both the cron close and the manual close),
   `routeWonLot` runs **before any charge**:
   - `stationForItem(orgId, item.locationId)` picks the station: the lot's own
     warehouse when it ships (`transfer: false`), else the org's default station
     (`transfer: true`).
   - `joinBundleOnWin` copies the choice onto the lot (`Item.fulfillment`),
     opens the buyer's box **at that station** if they don't have one
     (`ShippingBundle`, OPEN, `locationId` = station, `closesAt = now + 7 days`,
     address frozen) or joins their open box at that station, and writes the
     lot's **delta** to `Item.shipChargeCents`. An Owosso lot never joins a
     Gladwin box.
   - Only when `station.transfer` is true (the lot sits at a warehouse that
     doesn't ship) and the lot isn't already there, it's put on a transfer to
     the default station via `attachItemsToTransfer` (`lib/pickup.ts`) — the
     same one-cart-per-buyer-per-destination mechanic pickup transfers use.
     The team text is suppressed at close (same as pickup); the transfer board
     shows it.
   - Any failure in here is logged and the lot is treated as pickup. A
     shipping problem never stops a close or a charge.
3. **Charge.** Every charge path adds the lot deltas to the bill (see math
   below) and writes each lot's own delta to `Payment.shippingAmount`.
4. **Box closes** 7 days after it opened (cron) or when the buyer taps
   *Ship it now* (`shipItNow`). Wins after that open a new box (same station).
5. **Transfer lands** at the station (existing transfer board: drop-off clears
   `transferRequestId`, sets `locationId` = station, flags "place it").
6. **CLOSED → PACKING** when every lot in the box is PAID, at **the box's own
   station** (`ShippingBundle.locationId`; the org default for boxes opened
   before per-station boxes) and not on a transfer (`advanceClosedBundles`).
   The admin ship queue takes it from there (P3: confirm box, rate-shop, buy
   label, mark shipped) — at whichever warehouse the box belongs to.

Shipped lots are **never** part of the pickup pipeline: they are excluded from
the customer's "waiting to book" list, the admin waiting list, the pickup
magnet (`consolidatePickup`), auto-transfer-to-preferred, and the org-wide
sweep. The filter is `shippingBundleId: null` (`NOT_SHIPPED` in
`lib/pickup.ts`). Switching a buyer's preferred pickup warehouse never drags a
shipped lot along — `switchPreferredCascade` re-attaches each one to **its
box's** station.

A lot leaves that pipeline only through **Move to pickup** on the ship queue
(`POST /api/admin/shipping/[id]/remove-lot`, below) or Cancel box.

## What the buyer sees

- **Item page / Quick Bid** (`app/components/ShipChoice.tsx` →
  `ShipModeSwitch`) — `[ Pickup  Free ] [ Ship  $5.49 ]`. The Ship segment is
  the live number for this lot: the exact first-lot tier, the delta (`+$2.00`),
  **Free** when it rides in the open box at this lot's station, or `from $5.49`
  with no address. Under it, one optional line only with Ship selected and an
  open box to join: a slim band meter + "3 more Smalls ride free" (`roomLine`:
  Medium if one fits, else Small), "Next lot opens the next band (+$3.50)", or
  "Full — the next lot starts a new box". "How shipping works" → `/shipping#how`.
  The delta is worked out against the buyer's open box **at that lot's
  station** (`quoteForViewer` gets the lot's `locationId` + `organizationId`
  and returns `box` = that open box's weight + headroom). A Gladwin lot shows
  the full first-lot tier even if they have an open Owosso box.
- **`/shipping`** (`app/shipping/page.tsx`, client) — the one page: the global
  mode switch + address (Change opens the address modal; "Open boxes keep their
  address" while one is open), one card per open / closed / packing box
  (`OpenBoxCard`: warehouse, "Closes in 3 days", lots with `+$X` / Free, the
  **band meter** (`BandMeter`: four equal segments, the fill moves through the
  current band, this band's price over it, the next band's price at the next
  breakpoint; breakpoint labels hidden under 400px), "Room: about 3 Smalls or 1
  Medium ride free" / "Over that: +$3.50 (up to 10 lb)", Ship it now, and a
  Waiting on payment / Waiting on a transfer / Packing pill), shipped boxes
  (`ShippedBoxCard`: Shipped / Out for delivery / Delivered, tracking link,
  weight, box, paid), every shipping charge (`GET /api/shipping/charges`), and
  How it works (`HOW_IT_WORKS` + the price table). Signed out it shows the
  explainer and a Sign in button.
- **Dashboard "Your box"** (`app/components/YourBoxCard.tsx`) — one compact
  card per box on Overview; the **Shipping** tab (`ShippingTab` in
  `ShippingBoxFull.tsx`) is the short version: the open-box cards + "See all
  shipping" → `/shipping`. Headroom comes from `headroom(weightOz, zone)` in
  `lib/shipping/tiers.ts`, exposed per box by `GET /api/shipping/box`
  (`?all=1` → up to 50 boxes incl. every delivered one, for `/shipping`).
- **Account → Shipping address** — opens the same address modal. `POST
  /api/shipping/address` returns `appliesToNextBox: true` whenever the buyer
  has an OPEN box, and the modal then says the change applies to their next
  box before closing. The open box's frozen address is never edited.

### Customer routes

| Route | Does |
|---|---|
| `GET /api/shipping/quote?itemId=` | `{ eligible, fromCents, exactCents, joinsOpenBox, zone, needsAddress, box: { id, weightOz, zone, headroom } \| null, signedIn, mode, howItWorks }` |
| `GET /api/shipping/choice` | `{ mode: "PICKUP" \| "SHIP" }` |
| `POST /api/shipping/choice { choice, itemId? }` | sets the mode; SHIP without an address → 422 `{ needsAddress: true }` |
| `GET /api/shipping/box[?all=1]` | the buyer's boxes with headroom |
| `POST /api/shipping/box/[id]/ship-now` | close an OPEN box today |
| `GET /api/shipping/charges` | `{ charges: [{ id, itemId, title, cents, createdAt, status, refunded, box }] }` — every Payment with `shippingAmount > 0` (refunded ones included, `refunded: true`), newest first, 50 max |
| `GET` / `POST /api/shipping/address` | the saved address + zone |

## The cron — `/api/cron/shipping`, every 15 minutes

`CRON_SECRET`-guarded like the others (`vercel.json`). Each tick, in order:

| Step | What | Text (via `GHL_CUSTOM_SMS_WEBHOOK`) |
|---|---|---|
| (a) day 6 | `bundlesDueForDay6Text` — OPEN boxes closing within 24 h, not yet notified. Stamps `day6NotifiedAt` whether or not the text went out. | event `shipping_closing`: "Northwood Bids: your box ships tomorrow — N lots, about X lb. Anything you win today rides in the same box (you only pay a difference if it moves up a weight band)." |
| (b) day 7 | `closeDueBundles` — OPEN boxes past `closesAt` → CLOSED. | event `shipping_closed`: "Northwood Bids: Your box is closed and heading to packing — ships in 3 to 5 business days." If a lot is still in transit to the box's station (§9.15): "…One of your lots is still on its way to our Owosso warehouse — it ships 3 to 5 business days after it lands." (`closedMessage(waiting, stationName)` — the box's location name; "our shipping station" only when a box has none.) |
| (c) advance | `advanceClosedBundles` per org — CLOSED → PACKING when every lot is paid and physically at the box's own station. | none |

No money moves in the cron. Every delta was charged with the win.

## Charge math (delta model)

Per lot, at win time: `delta = tier(bundle weight after) − tier(bundle weight
before)`, floored at 0, for the buyer's zone. First lot in a box pays the full
tier; later lots pay only when they push the box into a higher weight band.

Example, Michigan buyer, four lots over the week:

| Win | Box weight → band | Tier | Delta charged on that win's bill |
|---|---|---|---|
| Lot 1 | 12 oz → under 1 lb | $5.49 | **$5.49** (say "$7" in the spec's round numbers) |
| Lot 2 | 26 oz → 1–5 lb | $7.49 | **$2.00**, or $0 if it stayed in band |
| Lot 3 | 40 oz → 1–5 lb | $7.49 | **$0** |
| Lot 4 | 90 oz → 5–10 lb | $10.99 | **$3.50** |

Spec shorthand: "$7 / free / free / +$7". If they lose lot 4, they've only
ever paid for the three. Lost lots never touch the box.

On every bill (`chargeOneWinner`, `/api/retry-payment`, `/api/retry-payment/all`,
`/api/admin/charge-owed`, and the 3DS confirms via `settleItemsPaid`):

```
items     = bid + buyer's premium + tax          (unchanged)
credit    = reserveReferralCredit(items)        (Bid Bucks — items only, never shipping)
shipping  = Σ Item.shipChargeCents for the lots being billed   (NOT taxed)
net       = items − credit + shipping
```

- `shipping = 0` for every pickup lot, so a pickup-only bill is byte-for-byte
  what it was before shipping existed.
- "Fully covered by Bid Bucks" (skip Stripe) only happens when `net ≤ 0`, i.e.
  never when there's shipping to collect — the card is charged for the
  shipping even if the items were covered.
- `Payment.shippingAmount` = that lot's own delta (not split across lots).
  PENDING / FAILED rows carry it too, so a retry bills the same number.
- Comped admin wins: shipping comped as well (`shippingAmount` 0, the lot's
  delta and the box's `chargedCents` are zeroed).
- Receipts show the net amount the card was charged.
- A FAILED charge does **not** remove the lot from its box — they may still
  pay on retry, and the box keeps its weight.

## Forfeit / refund — how it unwinds

`/api/admin/items/[itemId]/forfeit`, `/api/admin/payments/[id]/refund`, and
the Stripe `charge.refunded` (whole-charge) webhook all:

1. Refund the lot's share: `amount + fee + tax − credit`, **plus its
   `shippingAmount` while the label hasn't been bought**
   (`shippingRefundableForItem`: box OPEN/CLOSED/PACKING, no label). Once a
   label exists, shipping is non-refundable (§9.10).
2. Set the item UNSOLD and detach it from any appointment / transfer (as before).
3. `leaveBundle(itemId)`: the lot leaves the box, the box is re-weighed and
   re-snapped, and the lot's delta comes off `chargedCents` only if it was
   refundable (no label yet). If the box is now empty it's CANCELLED. Once a
   label exists (or the box is SHIPPED/DELIVERED) the lot is merely detached —
   no re-weigh, no money movement, the box is never cancelled from here.

Note the remaining lots keep the deltas they paid, so a box can end up having
collected less than its current tier (e.g. lot 1 paid the base and was
forfeited). The admin ship queue's charged-vs-actual column shows this; it's
accepted spread, not a bug.

## Env

| Var | Used for |
|---|---|
| `CRON_SECRET` | guards `/api/cron/shipping` (already set) |
| `GHL_CUSTOM_SMS_WEBHOOK` | day-6 / closed buyer texts (same hook as door codes; events `shipping_closing`, `shipping_closed`) |
| `GHL_TRANSFER_REQUESTED_WEBHOOK` | team text when a station transfer is created outside of close (already set) |
| `EASYPOST_API_KEY` | P3 — labels (not needed for anything on this page) |

Flag every warehouse that ships (`isShippingStation = true` on Owosso **and**
Gladwin, Settings → Locations → "Shipping station"; the card reads "Ships its
own boxes."). `shippingStation()` — the *default* station, used only for lots
at a non-shipping location and for boxes with no `locationId` — is the first
flagged location, falling back to the oldest active one, so boxes still route
somewhere even if nothing is flagged.

## Labels & tracking (P3 / P4)

Client: `lib/easypost.ts` (plain `fetch` against `https://api.easypost.com/v2`,
Basic auth with the key as the username, 20 s timeout, never logs the key).
Queue: `/admin/shipping` ("Ship" tab under Pickup) backed by
`/api/admin/shipping/**`. Texts: `lib/shippingNotify.ts`. Tracking:
`/api/webhooks/easypost`. Everything no-ops with a clear message on the board
while `EASYPOST_API_KEY` is unset — staff can still pack, print the pull list
and **Mark shipped** with a tracking number bought elsewhere.

### EasyPost account (one-time, Dakota)

1. Sign up at easypost.com (free; the first 3,000 labels a month cost $0 — only postage is billed).
2. Add a payment method under **Billing** (postage is charged to it as labels are bought).
3. **USPS is built in** — nothing to add. **UPS (optional):** Carrier Accounts → add UPS → sign in with the UPS.com account; EasyPost's own UPS discounts apply with no setup. FedEx is never rate-shopped (ground only, §9.7).
4. **API Keys → Production → create** and paste it into Vercel as `EASYPOST_API_KEY`. (A **Test** key creates fake labels with fake tracking — handy for trying the board; never use it in production.)
5. **Webhooks → Add webhook:** URL `https://northwoodbids.com/api/webhooks/easypost`, mode Production, and set a **webhook secret** — paste the same string into Vercel as `EASYPOST_WEBHOOK_SECRET`. Subscribe to `tracker.updated` (and `tracker.created`, harmless).
6. The return address on a label is **the box's own warehouse's** `PickupLocation.address` (Settings → Locations) — an Owosso box ships from Owosso, a Gladwin box from Gladwin — so each needs street, city, state and zip — commas optional; a multi-word city is recognised when it matches the location name. `fromAddressFor(orgId, bundle.locationId)`: the box's location, else the default station, else the `SHIP_FROM_*` env vars; the board says which station's address is missing.

### Env

| Var | Used for |
|---|---|
| `EASYPOST_API_KEY` | rate-shop, buy, refund labels (`easypostConfigured()` gates every call) |
| `EASYPOST_WEBHOOK_SECRET` | when set, `/api/webhooks/easypost` verifies `X-Hmac-Signature` (`hmac-sha256-hex=<hex>` over the raw body). When unset, **production refuses every post** (`VERCEL_ENV === "production"`); preview/dev accept unsigned posts for trying things out. Either way the route only ever updates boxes whose tracking code it already holds — it never creates anything. |
| `SHIP_FROM_NAME` `SHIP_FROM_STREET` `SHIP_FROM_CITY` `SHIP_FROM_STATE` `SHIP_FROM_ZIP` `SHIP_FROM_PHONE` | return address fallback when the box's warehouse address can't be parsed (one fallback for every station — fix the location address instead); `SHIP_FROM_PHONE` is also sent as the from-phone (UPS wants one) |
| `GHL_CUSTOM_SMS_WEBHOOK` | buyer texts, events `shipping_shipped`, `shipping_out_for_delivery`, `shipping_delivered` (same payload shape as door codes — no new GHL workflow) |

### How the queue works

Every box on `/admin/shipping` carries `location { id, name }` — the warehouse
it ships from — and the card says **"Ships from Gladwin"**. The header has the
same warehouse scope as the Pickup board (**All / Owosso / Gladwin**, with
To-pack counts, remembered per device in localStorage `nb-ship-warehouse`):
you pack one building at a time, so pick yours and every tab is filtered to
it. "Here" / `canShipNow` / CLOSED → PACKING all mean *at this box's station*,
never the org default.

Tabs:

- **To pack** (PACKING) — every lot paid and at the box's warehouse. Open the card →
  the lots with photos/codes + **Print pull list** (the 4×6 label PDF,
  `type=bundle`), then the pack controls: **Box** (standard box list from
  `lib/shipping/tiers.ts`, prefilled with the engine's snap) and **weight**
  (prefilled from the engine; put the box on the scale and type what it says).
  **Get rate** creates the EasyPost shipment with those dims + weight and shows
  the cheapest ground rate — USPS Ground Advantage (Cubic when the box
  qualifies), USPS Priority (Cubic / flat rate) or UPS Ground / Ground Saver;
  Express / Overnight / Next-Day are never considered. **Buy label** buys it,
  stores label + tracking on the box, flips it to SHIPPED, marks its lots
  PICKED_UP (they leave every pickup list) and texts the buyer the tracking
  link. **Print label** opens the 4×6 PDF label in the PDF viewer — print at
  actual size on the Rollo like the pull-list labels. Under **More**: Mark
  shipped (bought elsewhere), Notes, Cancel box (only while there's no label;
  lots go back to Pickup, paid lots get their shipping refunded automatically —
  see Move to pickup below — and the buyer is texted once).
- **Waiting** (CLOSED) — the box closed but a lot is still on a transfer (from
  a warehouse that doesn't ship) or unpaid. Each lot shows "Here" / "On
  transfer from …" / "Unpaid"; the pill says "2 of 3 here". A lot still unpaid
  **more than 3 days after the box closed** gets a red **"Unpaid 4 days"**
  pill next to its Move-to-pickup button (`UNPAID_NUDGE_DAYS`,
  `app/admin/shipping/types.ts`) — that lot is what's holding the box.
  Loading the board also runs `advanceClosedBundles`, so a box moves to To
  pack the moment its last lot is dropped off.
- **Collecting** (OPEN) — still taking wins, closes on the date shown.
- **Shipped** — last 14 days. Tracking status pill (`lastTrackingStatus`,
  fed by the webhook), tracking number (links to the carrier page), and
  **charged vs label**. Under More: **Refund label** — voids the label on
  EasyPost (USPS refunds unscanned labels in ~2 weeks; UPS voids at once),
  clears every label field, puts the box back in To pack and its lots back on
  PENDING_PICKUP. A refunded shipment can't be re-bought, so Get rate creates
  a fresh one.

**Bulk** (To pack and Shipped): tick the boxes (checkbox on each card, or
**Select all** for the tab), then work the bar left to right — **Print pull
lists** (`/api/admin/shipping/pull-list.pdf?ids=` — every ticked box's pull
list in one PDF, one 4×6 page per box), pack and weigh them, **Rate all**
(`POST /api/admin/shipping/bulk { action: "rate", ids }` — each card fills in
with its rate and spread, and a problem shows on the card instead of stopping
the run), **Buy all labels** (confirm modal with the count and the total of the
rates shown → `{ action: "buy", ids }`; only boxes that already have a rate are
bought, the rest are skipped with a reason), then **Print all labels**
(`/api/admin/shipping/labels.pdf?ids=` — the carrier labels merged into one
4×6-per-page PDF in the order ticked; lights up once every ticked box is
SHIPPED, and a label that can't be fetched becomes a page that says so, so the
stack still lines up). The selection is a set of box ids on the page, so it
survives a Refresh and follows a box from To pack to Shipped. The bulk route
runs the boxes one at a time (EasyPost rate limits) and takes at most 25 ids
per call; the page sends 5 at a time so cards fill in as it goes. Rate all uses
whatever is typed in a card's Box / Pounds / Ounces; a box nobody opened uses
its last rated box + weight, else the engine's estimate — so put the box on the
scale first if the estimate is likely off.

**Move to pickup** (under More, one button per lot, only while the box has no
label): pulls that one lot out of the box and hands it to the normal pickup
pipeline — the fix for a box stuck in Waiting on a lot the buyer never paid
for, or a lot that turned out not to ship. `leaveBundle` semantics: the box is
re-weighed and re-snapped, the lot's delta comes off `chargedCents` only while
it was refundable (no label), and an emptied box is CANCELLED (the card
disappears). The lot's `fulfillment` becomes PICKUP so it shows on the Pickup
board and the buyer's pickup list. Money: a **paid** lot's shipping is
refunded automatically (`refundShippingForItem`, `lib/shipping/refund.ts`):
card → Stripe partial refund of `Payment.shippingAmount` (idempotency key
`shipref:<paymentId>`); cash → no Stripe call, the box notes say "cash shipping
to hand back $X". Either way `shippingRefundedAt` is stamped (the amount stays
so /shipping shows it struck through; every money total treats it as 0) and the buyer gets one
text (event `shipping_moved_to_pickup`: "We moved your lot NB-123 to pickup
and refunded $X shipping."). A Stripe failure stops the move with the box
untouched. An **unpaid** lot keeps its PENDING / FAILED Payment row (they
still owe the item) but no longer owes shipping — `Item.shipChargeCents` is
zeroed and the row's `shippingAmount` is nulled, so a retry bills items only.
A dated line is appended to the box notes either way. **Mark paid (cash)** on
the Winners page does the same for any lot still in a label-less box — cash at
the counter means they're picking up, so no shipping is collected
(`movedToPickup` in the response).

Double taps are safe: Buy on an already-shipped box returns the label it has,
and if EasyPost says a shipment was already purchased we fetch and store that
label instead of buying twice.

### Charged vs actual (the spread)

`chargedCents` is what the buyer paid across every delta (the tier table is a
hard ceiling, §9.13). `labelCostCents` is what the cheapest ground label
actually cost us. The board shows the difference per box — green when we kept
money (packaging + labor), red when we ate it (usually a heavy box going west).
It's informational: the buyer is never charged or refunded on the actual
label. Watch the Shipped tab for a few weeks; if a band/zone is consistently
red, nudge that cell in `TIERS` (`lib/shipping/tiers.ts`).

### Tracking texts

| EasyPost tracker status | What we do |
|---|---|
| `pre_transit`, `in_transit`, `available_for_pickup`, … | store `lastTrackingStatus` (pill on the Shipped tab) |
| first `out_for_delivery` | text "Your box is out for delivery today." |
| `delivered` | `deliveredAt`, status DELIVERED, text "Your box was delivered — enjoy!" |

Matching is by `trackingCode`, falling back to `easypostTrackerId`. Unknown
tracking codes are ignored.

### Routes

| Route | Body | Does |
|---|---|---|
| `GET /api/admin/shipping` | — | the board: `configured`, `configMessage`, `station` (the org default), `stations[]` (every warehouse that ships — the scope chips), `boxes`, `packing[]`, `closed[]`, `open[]`, `shipped[]`; every box carries `location { id, name }` and `daysSinceClosed` |
| `POST /api/admin/shipping/[id]/rate` | `{ boxCode, weightOz }` | creates the EasyPost shipment, stores `easypostShipmentId/packedWeightOz/packedBoxCode`, returns `{ rate: { id, carrier, service, label, cents, days }, chargedCents, spreadCents, rates[] }`. If the box's existing shipment already has a label (a Buy that died before saving) → 409 "tap Buy label" and the label fields are stored |
| `POST /api/admin/shipping/[id]/buy` | — | buys the cheapest ground rate → SHIPPED, lots PICKED_UP, buyer texted; idempotent |
| `POST /api/admin/shipping/[id]/refund-label` | — | EasyPost refund, label fields cleared, back to PACKING, lots back to PENDING_PICKUP; 409 once `lastTrackingStatus` is past `pre_transit` (carrier scanned it) |
| `POST /api/admin/shipping/[id]/mark-shipped` | `{ carrier?, trackingCode?, labelCostCents? }` | manual fallback → SHIPPED, lots PICKED_UP, text only if a tracking code was given |
| `POST /api/admin/shipping/[id]/remove-lot` | `{ itemId }` | one lot out of a label-less box → PICKUP (paid: shipping refunded + buyer texted; re-weigh, delta off `chargedCents`, unpaid rows lose `shippingAmount`); returns `refundedCents` + the fresh box (`status: "CANCELLED"` if it emptied) |
| `PATCH /api/admin/shipping/[id]` | `{ notes?, status?: "CANCELLED" }` | notes; cancel only while there's no label (paid lots refunded, PENDING/FAILED rows lose `shippingAmount`, one text) |
| `POST /api/admin/shipping/bulk` | `{ action: "rate" \| "buy", ids: string[] (≤25), pack?: { [id]: { boxCode, weightOz } } }` | the two above, one box at a time, never failing the call for one box → `{ results: [{ id, ok, error?, rate?, chargedCents?, spreadCents?, packedBoxCode?, packedWeightOz?, label?, texted?, bundle? }] }`. `rate` uses `pack[id]`, else the box's `packedBoxCode/packedWeightOz`, else the engine's `boxCode/weightOz`; `buy` skips boxes with no shipment ("No rate yet") |
| `GET /api/admin/shipping/pull-list.pdf?ids=a,b,c` | — | every box's `type=bundle` pull list in one PDF, one 4×6 page per box, in the order given (≤100) |
| `GET /api/admin/shipping/labels.pdf?ids=a,b,c` | — | every SHIPPED box's carrier label merged into one PDF (`labels-<date>.pdf`), one 4×6 page per box in the order given; a label that can't be fetched (20 s timeout) or isn't bought yet becomes a page that says so (≤100) |
| `GET /api/admin/label?type=bundle&bundle=<id>` | — | the 4×6 pull-list PDF for a box |
| `POST /api/webhooks/easypost` | EasyPost Event | tracking → status + texts (public route, HMAC-checked when the secret is set) |

All admin routes require an OWNER / ADMIN / STAFF membership and are org-scoped.
