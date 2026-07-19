# PureBid MI — Fix Handoff from the Northwood Bids Build

Both Northwood Bids and PureBid MI were cloned from GiveBid. Everything below was found or
reworked in the **Northwood Bids** build after that clone. Unless PureBid MI has already been
patched independently, **assume every Tier 1 item is still broken there**, because none of them
throw an error — they just silently don't happen.

**Scope note:** transfers between locations and per-warehouse reporting are deliberately excluded —
PureBid MI doesn't need them. Everything else is in scope.

**Verification note:** this list was written from the Northwood build. It has **not** been diffed
against the PureBid MI codebase. Check each item before assuming it applies.

**Hard constraint carried over:** PureBid MI must use entirely separate Clerk / Supabase / Stripe /
R2 / Pusher / GHL / Vercel credentials. Never reuse keys or data across builds. Never touch
PurposeBid or GiveBid.

---

## Tier 1 — Silent killers (fix these first)

Every one of these fails quietly. Nothing errors. Money and messages just evaporate.

### 1.1 Clerk is 401'ing your webhooks and cron

**The single most important item in this document.**

`/api/webhooks/*` and `/api/cron/*` authenticate themselves — Stripe signature, GHL, `CRON_SECRET`.
If Clerk's middleware gates them, every single call gets 401'd. That silently kills Stripe async
reconciliation, dashboard refunds, disputes, GHL messaging, and auction auto-close. The app looks
completely fine while none of it works.

In `middleware.ts`, these must be inside `isPublicRoute`:

```ts
const isPublicRoute = createRouteMatcher([
  // ...
  // Machine-to-machine endpoints — they authenticate themselves (Stripe/GHL
  // signature, CRON_SECRET), so Clerk must NOT gate them or it 401s every call.
  "/api/webhooks(.*)",     // Stripe + GoHighLevel webhooks
  "/api/cron(.*)",         // Vercel cron (checks CRON_SECRET internally)
]);
```

**Verify by hitting the endpoints directly in prod, not by reading the code.** A 401 here is invisible
from inside the app.

### 1.2 Fire-and-forget `fetch` is killed by the serverless freeze

This is a **pattern**, not one bug. Vercel suspends the function the instant the route returns its
response. Any `fetch()` still in flight is dropped on the floor.

```ts
// BROKEN in a user-facing route — dies at the freeze
fetch(WEBHOOK, { ... }).catch(err => console.error(err));

// CORRECT — await it, and report what actually landed
const res = await fetch(WEBHOOK, { ... });
if (res.ok) sent++;
```

The tell is nasty: with **one** recipient a single request can squeak out before the freeze, so it
looks like it works in testing. With a real list, none do — the admin sees "sent to 47 bidders" and
nobody gets a text.

**Rule:** inside cron this is survivable (the function stays alive). In any **user-facing route that
returns immediately**, every webhook must be awaited. Use a bounded pool (5 at a time) so a large
list doesn't fan out unbounded:

```ts
async function runPooled<T>(items: T[], worker: (item: T) => Promise<void>, concurrency = 5) {
  for (let i = 0; i < items.length; i += concurrency) {
    await Promise.all(items.slice(i, i + concurrency).map(worker));
  }
}
```

Grep for `fetch(` followed by `.catch(` with no `await`.

### 1.3 Notification blasts reach almost nobody (`preferredOrgId`)

Follower queries gated on `where: { preferredOrgId: org.id }` reach essentially zero people.
That field is only written when someone arrives through an **org-specific link**. Everyone who
signed up normally has it `null` and is silently filtered out.

Symptom: you send the "auction is live" blast and only *you* get the text — because your own profile
happens to have it set.

```ts
const followers = await prisma.bidderProfile.findMany({
  where: {
    OR: [{ preferredOrgId: org.id }, { preferredOrgId: null }],
    NOT: [{ phone: null, email: null }],   // nothing to send to
  },
});
```

Also dedupe by phone/email so a duplicate profile row can't double-text one person, and **return a
count** so the admin sees `sent to N bidders` instead of a confident lie.

### 1.4 Outbid alerts are a spam cannon

One text per outbid event. A $50 max bid nibbled at $1 a time sends the other bidder **49 separate
texts**. The proxy path is worse than the manual path — every nibble triggers an auto-bid, and every
auto-bid fired its own text.

Fix: the bid path **only queues**. A cron pass coalesces.

- New `OutbidAlert` model: `clerkUserId`, `itemId`, `createdAt`, `sentAt?`
- Bid paths call `queueOutbidAlert(userId, itemId)` and never send
- Repeat outbid on the same item **bumps `createdAt`** rather than stacking a second row
- Cron flush every minute:
  - **Quiet window (30s)** — hold until the bidder has gone 30s with no new outbid
  - **Max hold (3 min)** — never sit on one longer, so a long war still gets told in time
  - **Still-losing re-check** — at send time, re-check each item. If they retook the lead (their own
    max fired back) or the item closed, drop it silently. *This also fixes people being told they're
    outbid on a lot they're currently winning.*
  - One item → deep link to the item. Several → one text to `/dashboard#outbid`
  - Webhook failure leaves the row pending; next minute retries

Worst case becomes one text per bidder per minute. Reference implementation: `lib/outbidAlerts.ts`.

### 1.5 Cross-org Bid Bucks minting

Real security hole — credits could be minted across organizations. Audit the referral/credit paths
for missing org scoping.

### 1.6 Expired-item bid race

The end guard allowed bids to land on items that had already ended. An item with no per-item end
falls back to the auction end, so the `itemEndAt: null` branch is only valid while the auction itself
is still open:

```ts
const nowTx = new Date();
const endGuard: Prisma.ItemWhereInput["OR"] =
  auctionEndAt > nowTx
    ? [{ itemEndAt: null }, { itemEndAt: { gt: nowTx } }]
    : [{ itemEndAt: { gt: nowTx } }];
```

Applies in **both** `app/api/bids/route.ts` and `lib/proxyBidResolver.ts` (`placeProxyBid`).

### 1.7 Other money-path hardening

Charge-once idempotency (deterministic key per auction+user+item-set, so cron double-ticks reuse one
PaymentIntent), partial per-item refunds, credit reserve/release with a split retry key, and coupon-book
netting. Verify each independently.

---

## Tier 2 — Platform gotchas that look like broken buttons

### 2.1 Native `confirm()` is silently blocked in the installed PWA webview

No error, no dialog — the button just does nothing. This is why "Mark Collected" / "Mark Dropped Off"
appeared dead. **Grep for `confirm(` across all of admin** and replace every one with an in-app modal.

Also wrap notify calls in the pickup actions in try/catch — a notification failure should never 500
the drop-off itself.

### 2.2 Clerk `forceRedirectUrl` overrides `redirect_url`; `fallbackRedirectUrl` does not

This broke staff invites: `<SignIn forceRedirectUrl="/register" />` hijacked the invite round-trip, so
after signing in the user landed in the wrong place and the invite was never accepted. Use
`fallbackRedirectUrl`, and make `/join` **auto-accept on load** rather than requiring an extra click.

### 2.3 Clerk CAPTCHA fails in the Facebook / Instagram in-app browser

Bot-protection CAPTCHA can't load (CORS) inside in-app browsers. If most traffic clicks in from
Facebook — as it does for this business — signup is dead for most users.

Fix is in the **Clerk dashboard**, not code: Configure → Protect / Attack protection → Bot sign-up
protection → OFF.

Do **not** solve this with an "open in your real browser" banner. Making the customer leave Facebook
is not an acceptable answer.

### 2.4 `crossOrigin="anonymous"` makes images refuse to render

It doesn't degrade — the browser hard-refuses any image from a host that sends no CORS headers.
Fingerprint: **the same photo displays fine elsewhere on the site but is blank here.**

If you need to read pixels back (e.g. html2canvas export), **proxy the images through your own origin**
instead of setting `crossOrigin`. A small staff-authed route that fetches the bytes server-side and
re-serves them removes CORS from the equation entirely. See `app/api/admin/image-proxy/route.ts`.

### 2.5 `flex-1` on an `<input>` without `min-w-0`

An `<input>` has an intrinsic minimum width, so a flex row physically cannot shrink below it. On a
narrow phone the row stays wider than its container and the `shrink-0` button next to it gets pushed
**off screen**. This was the Place Bid button leaking out of the bid card.

```tsx
<div className="flex gap-2 w-full">
  <input className="flex-1 min-w-0 ..." />
  <button className="shrink-0 whitespace-nowrap ...">Place Bid</button>
</div>
```

It only manifests "sometimes" because it depends on placeholder length. **Grep for `flex-1` on inputs.**

### 2.6 `xs:` breakpoint doesn't exist in default Tailwind

Silently does nothing. Remove any usage.

---

## Tier 3 — Bidder-facing correctness

- **Bidders could see auction totals.** Admin-only. Check every total on public pages.
- **No-bid items displayed the $2 starting bid.** An experienced bidder reads "$2" as *"I must bid $3
  to win"*. Show **$0** until a real bid lands; reflect the real price once bidding starts.
- **Live bid count was frozen** — rendering `item.bids.length` (a static server array) instead of a
  `bidCount` state incremented on every `new-bid` Pusher event.
- **Upcoming auctions redirected to home.** "Coming Soon" cards linked to `/${orgSlug}`, which
  redirects to `/`. Link to the auction, and render DRAFT auctions as a read-only preview.
- **Real-time hardening** on the item page: debounced + signed-in-gated proxy refresh (500ms),
  reconnect + `visibilitychange` catch-up, and a **monotonic `Math.max` price guard** so a late/stale
  event can't walk the displayed price backwards.
- **Winners board:** clicking a sold item must open that winner's **invoice**, never the item editor.
  You should never be able to edit a sold item.

### Bid increments

Slow growth, matching live auction convention. Starting bid defaults to **$2** (editable).

```ts
export function getIncrement(currentBid: number): number {
  if (currentBid < 12)   return 1;
  if (currentBid < 100)  return 2;
  if (currentBid < 500)  return 5;
  if (currentBid < 1000) return 10;
  if (currentBid < 5000) return 25;
  return 50;
}
export function getNextValidBid(currentBid: number): number {
  return Math.floor(currentBid) + getIncrement(currentBid);  // floor: no stray cents
}
```

Proxy max suggestions are deliberately spaced far apart (1.5x, 2x, 3x, 5x…, rounded up to $5) so a
suggestion can never land on a competing proxy's exact max and leak it. **Update the visual bid table
in the help screen to match** — it's easy to forget and then it lies to customers.

---

## Tier 4 — Flow & layout reworks

The theme is the same throughout: **fewer decisions, less scrolling, nothing important hidden.**

### Create item — the big one

Rebuilt as a **single column of five numbered, color-coded steps**. Each step's number chip becomes a
✓ when satisfied, so missing fields are visible at a glance.

1. **Scan** (brown) 2. **Photos** (green) 3. **Details** (amber) 4. **Price** (blue) 5. **Location** (olive)

Critical behaviors:

- **A successful scan auto-fills the form.** No "apply to form" button. The *only* confirm step is the
  name-**search** path — a scan is exact, a search is a guess.
- Scan card **collapses** once a scan lands, so the filled form is what you're looking at.
- **"Save + next" scrolls to top and re-arms the camera automatically** — no tapping "Scan" again.
- Photos near the **top**, not the bottom. Condition defaults to **New**. Warehouse **required**.
- Condition as **buttons**, not a dropdown.
- **Whole title visible** (auto-growing textarea) — long titles are where naming problems hide.
- Imported descriptions **truncated to 2–3 sentences** — they arrive as walls of marketing copy.
- **Sticky** warehouse / shelf / condition / auction across saves.
- **Tag # pinned next to the Save buttons**, plus a quiet **"Last saved: #code"** line — the code is
  usually written *after* saving, and people hit save before writing it down.
- **All the "weird tips" stripped.** No "which warehouse the item…", "where it sits inside…", "scan or
  type barcode…". They eat the whole screen and nobody reads them.

### Everything else

- **Manage auction:** all controls consolidated under one **Edit auction** control board — details
  (incl. description), actions (open / send live text / closing soon / settle), flyer, active max
  bids. Header keeps only back / title / status / View.
- **Manage auction item list:** dense, **7–10 items visible**, tap to edit. Long titles made it 1–2
  before, which is unusable.
- **Admin auctions list:** closed collapsed behind a toggle, live shown, upcoming behind a button.
- **Pickup admin:** collected/completed collapsed behind a dropdown; upcoming as a compact accordion
  (name / time / items, tap to expand).
- **Dashboard:** Recent Bids removed, quick links moved to the top.
- **Removed entirely:** Close Auction button, "50 min out" / "1 min out" test buttons, standalone Save
  end time, the 3-days/1-week/2-weeks chips on auction creation, "assign to auction" when creating
  inside an auction (it's pre-assigned).
- **Staff/admin edit pencil** on the public auction and item pages — edit listings while browsing.
- **Reassign the main photo** when editing an existing listing (index 0 = primary; move-to-front).

---

## Tier 5 — Features worth porting

- **Silent open + manual live text.** Opening an auction sends **nothing**. A separate deliberate
  "Send 'Auction is Live' text" button does the blast. It's **claimed atomically** (`updateMany where
  liveNotifiedAt: null`) so two admins or a double-tap can't text the whole list twice, and the button
  greys to "✓ Live text sent" afterwards. If nothing actually sends, the claim is **released** so it
  can be retried.
- **No "bid confirmed" notification.** Bidders see it live on screen. Only the outbid alert is worth a
  text. (Marketing-type messages → email; important/time-sensitive → SMS.)
- **Recent bids panel** — last 10 bids per auction: item, bidder, amount, time, leading-vs-outbid, and
  auto-bids tagged `· auto-bid` so a proxy war is distinguishable from real activity. Live via the
  existing `auction-updated` channel.
- **Active Max Bids panel** — owner/admin only. Max amounts are competitive info; staff below admin
  must not see them.
- **Premium / featured items** — sort to top + pulsing border.
- **Combo lots** — N items, one lot, one code, photo collage. Scan each, pick **one** photo from each.
- **Pickup blackout dates** — recurring normal hours plus block-off ranges for vacations.
  (`PickupBlackout` model; `getAvailableSlots` / `getSlotCapacity` skip the ranges.)
- **Staged shelf/spot shown to the customer** on their pickup screen ("Find it at Box 1"), reset on
  collection.
- **Social flyer generator** — top 6 items, live prices, 1080×1080. See the html2canvas notes below.
- **30-day win-back text** — daily cron, `INACTIVE_DAYS=30`, `COOLOFF_DAYS=45`, `MAX_PER_RUN=100`,
  gated on its own webhook env var.
- **Avatar prompt after signup** so it's locked in. In-profile avatar switcher kept quiet; no "remove".
- **One-click bidder → staff upgrade** on the Bidders screen.

### html2canvas notes (if you port the flyer)

It is fussy and will waste your time. Everything here was learned the hard way:

- **It ignores `object-fit` entirely.** It draws the image stretched to whatever box you gave it. Do
  **not** size images `width:100%; height:100%` — size them naturally with `max-width/max-height: 100%`
  inside a centered flex box, so the element's own box *is* the right aspect ratio.
- Use **`contain`, never `cover`** for product photos — cover crops the item's head off.
- **Absolutely-positioned overlays clip badly.** Move badges inline.
- **An outer `box-shadow` on the captured element gets clipped.** Put the shadow on a *wrapper*.
- **Build at true export size (1080×1080) and display it shrunk** with a CSS transform. Drop the
  transform for the moment of capture, then restore it. Fit-to-screen also means the admin can just
  screenshot it without scrolling — which is what they'll actually do.
- Avoid `aspect-ratio`; use hard pixel values in the captured tree.
- Proxy all images same-origin (see 2.4).

---

## Grep checklist

Fast triage — run these against the PureBid MI tree:

```
confirm(                     # PWA-blocked native confirms (2.1)
fetch(.*\n.*\.catch          # fire-and-forget webhooks (1.2)
preferredOrgId               # notification blasts reaching nobody (1.3)
forceRedirectUrl             # invite/redirect hijack (2.2)
crossOrigin                  # images that refuse to render (2.4)
flex-1                       # on inputs, missing min-w-0 (2.5)
xs:                          # non-existent breakpoint (2.6)
bids.length                  # frozen live counts (Tier 3)
GHL_OUTBID_WEBHOOK           # should only be called from the cron flush (1.4)
```

And confirm in `middleware.ts` that `/api/webhooks(.*)` and `/api/cron(.*)` are public (1.1).

---

## Build / environment notes

- Next.js 16 App Router (Turbopack). **The build runs `tsc`, not ESLint** — type errors block, lint
  doesn't.
- Prisma 6 + Supabase Postgres, **`prisma db push` workflow, no migrations dir**. Schema changes need
  `npx prisma db push` — a git push alone will not apply them, and you'll get confusing "property does
  not exist on PrismaClient" errors until it runs.
- Stripe **direct charges**, off_session auto-charge batched per winner per auction, buyer's premium %
  + tax % on top.
- Pusher channels: `item-${id}` (`new-bid`, `proxy-update`, `item-closed`), `auctions`
  (`auction-updated`).
- GHL inbound webhooks for SMS. Each payload carries a **pre-composed `smsMessage`**. All are no-ops if
  the env var is unset — which means a **missing env var fails silently**. Verify they're set.
- Vercel cron: `/api/cron/close-auctions` (`* * * * *`), `/api/cron/winback` (`0 17 * * *`).

---

## Excluded by request

Not needed for PureBid MI, listed only so it's clear they were skipped on purpose:

- Transfers between locations (`autoTransferToPreferred`, `attachToPendingTransfers`, transfer
  notifications, non-transferable / warehouse-only item flag)
- Per-warehouse reporting (item counts and bid totals split by warehouse)
