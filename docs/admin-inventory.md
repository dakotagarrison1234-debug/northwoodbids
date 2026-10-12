# Admin inventory — app/admin/**

Read-only catalog of every admin route as it stood BEFORE the Oct 2026 condense pass (see admin-condense-brief.md for the rules that replaced it).
Context: 3-person liquidation team (owner + 2 staff). Daily jobs: list lots, run/close auctions,
stage + hand over pickups, chase unpaid winners, text customers, glance at sales.

Total admin source: ~14,170 lines across 57 files. Line counts below are `wc -l`.

Legend used below:
- `[dup]` = this number also appears on another admin page (see section A).
- `[owner]` = gated to OWNER/ADMIN by nav.ts or in-page role check.
- Quoted strings are the literal labels in the JSX.

---

## 0. Shell (layout, nav, sidebar, mobile nav)

### app/admin/layout.tsx (75 lines)
- Auth gate; auto-provisions the single org ("Northwood Bids", 15% premium, 6% MI tax) for a super-admin with no membership.
- Renders `MobileNav` (phone) + `AdminSidebar` (desktop) + children with `pb-[68px]` on mobile for the fixed tab bar.
- Hardcoded `BUSINESS_LOGO_URL` (same constant duplicated in flyer/page.tsx).

### app/admin/nav.ts (143 lines) — single source of IA
Seven groups (comment says "down from twelve"):

| Group | href | Pages (section tabs) | ownerOnly |
|---|---|---|---|
| Today | /admin/dashboard | Today | no |
| Auctions | /admin/auctions | All auctions, New auction, Add a lot, Unsold & relist [owner] | no |
| Pickup | /admin/pickup | Board | no |
| Money | /admin/winners | Winners & payments, Reports | yes |
| People | /admin/bidders | Bidders, Referrals, Welcome codes, Team, Text a group | yes |
| Giveaways | /admin/giveaways | Giveaways | yes |
| Settings | /admin/settings/payments | Payments, Doors | yes |

Each group carries a `blurb` string ("What needs you right now.", "Build, run and close auctions.",
"Appointments, transfers, warehouses.", "Who owes, who paid, how it's going.", "Bidders, referrals, your team.",
"Free prizes that grow the crowd.", "Payments, doors and business setup."). The blurb field is defined but
NOT consumed by PageHeader — every page re-types its own `sub` string, often identical to the blurb.

Staff (role STAFF) see only: Today, Auctions (minus Unsold), Pickup. So most of the inventory below is owner-only.

### app/admin/AdminSidebar.tsx (116 lines)
- Logo card (links to public home), "Workshop" eyebrow (text-[10px]), role (text-xs), "View site" link (text-[11px]).
- Group links (text-[15px]); active group expands to show page links (text-[13px]).
- Divider + "My bids" link to /dashboard (customer dashboard).
- Account footer: avatar, first name, org name (text-[11px]), sign-out icon button.

### app/admin/MobileNav.tsx (134 lines)
- Top bar: logo, active group label (text-[11px] uppercase), hamburger.
- Drawer: "Workshop" eyebrow, org name, role, all groups + page links, "View the site", "My bids", "Sign out".
- Bottom tab bar: Today, Auctions, Pickup, Money (+ "More" opens drawer). Labels text-[11px].
  Note: "Money" tab is in TAB_KEYS but group is ownerOnly, so staff get a 3-tab bar + More.

### app/admin/ui.tsx (356 lines) — design kit
Exports: `tone`, `PageHeader`, `SectionTabs`, `PageBody`, `Pill`, `Eyebrow`, `StatCard`, `Panel`, `Btn`, `BtnLink`,
`Input`, `SearchBox`, `Segmented`, `Toolbar`, `Empty`, `Row`, `ActionCard`, `Progress`, `Notice`, `Money`, `Initials`.
Font sizes are in section C.

### Shared helpers
- `app/admin/format.ts` (16): `fmtMoney`, `fmtMoney0`. (Reports pages re-declare their own `money`/`money0` locally
  instead of importing these — 4 separate copies: reports/page.tsx, reports/[auctionId]/page.tsx, CashReportView, BidderReportView.)
- `app/admin/AdminNavIcon.tsx` (18): icon switch.
- `app/admin/RefreshButton.tsx` (47): **unused** — zero imports anywhere under app/admin.
- `app/admin/settings/SettingsNav.tsx` (11) + `settings/layout.tsx` (7): **effectively dead** — SettingsNav has zero
  imports; layout is a pass-through div.
- `app/admin/PrintLabelButton.tsx` (33): `<a target=_blank>` to `/api/admin/label?...`. Used in pickup + AuctionResults.
- `app/admin/RelistControl.tsx` (131): "Relist" button -> expands to "List into" select (Save to drafts / Live — X / X),
  "Warehouse" select (Keep current / Move to X), Relist / Cancel. Used in unsold + AuctionResults.
- `app/admin/MessageSheet.tsx` (156): bottom-sheet "Text customer" modal. 4 template chips ("Pick a time",
  "Pick a location", "Ready to grab", "Payment issue"), 480-char textarea, "Sent by SMS", Cancel / "Send text".
  Used by pickup (waiting list), winners (who owes), bidders.

---

## 1. /admin/dashboard — "Today"
File: `app/admin/dashboard/page.tsx` (217 lines, server component)

Blocks in order:
1. **PageHeader** — eyebrow = today's date; title = "Good morning/afternoon/evening."; sub = "A few things need you." or
   "Nothing's on fire. Nice."; actions: "Add a lot" (outline), "New auction".
2. **Pulse strip** (2x2 / 4-col grid, hand-rolled cards not StatCard):
   - "Sold this week" = sum of PAID payments last 7d (dark card, links /admin/reports) `[dup: Reports "You made" w/ Week range]`
   - "Bids today" = bid count since Detroit midnight
   - "New bidders · 7d" = `+N` bidderProfile count last 7d (links /admin/bidders) `[dup: Reports>Bidders "New (30 days)" — different window]`
   - "Giveaways running" = count ACTIVE/ENDED giveaways (links /admin/giveaways)
3. **"Needs you"** eyebrow + ActionCards (conditional):
   - "Money not collected" = `$unpaidTotal` + "N people haven't paid — card declined or pending" (red, -> /admin/winners)
     `[dup: Winners "Not collected"/owedTotal, Reports "Still owed to you", AuctionResults "Unpaid"]`
   - "Late pickups" = count SCHEDULED > 1h past (red, -> /admin/pickup) `[dup: Pickup "Late" pills]`
   - "Pickups today" / "No pickups today" = count + "N still need staging" / "All staged and ready" (-> /admin/pickup)
     `[dup: Pickup "Today" header card "N pickups · M items", "staged X/N"]`
   - "Paid, waiting to be booked" = PENDING_PICKUP items w/o appt or transfer (-> /admin/pickup)
     `[dup: Pickup "Not booked yet" totals People/Items]`
   - "Transfers to move" = REQUESTED/LOADED transfers (-> /admin/pickup) `[dup: Pickup Transfers tab badge / "Active transfers"]`
4. **Panel "Today's schedule"** (only if today>0): sub "N pickups", action "Open board"; list of up to 8 rows: time,
   "N items · Location", Pill Late / stagedSpot / "Stage". "+N more today" footer. `[dup: Pickup board Today section]`
5. **Panel "Live now"** (right col): action "All auctions"; rows per OPEN/CLOSING auction: title, "N lots · $X bid so far",
   Pill time-left (red if <=24h), Progress bar. Empty: "Nothing live right now." / "Open an auction and the board lights up." /
   "Create an auction". `[dup: /admin/auctions Live cards show lots/bids/bid-so-far + same progress bar]`
6. **Panel "On deck"** (only if drafts with future start): up to 3 rows: title, "N lots · opens Day", Pill "Draft".
   `[dup: /admin/auctions Upcoming]`

Sub-nav: none (single-page group). Live refresh via PusherRefresh.

---

## 2. /admin/auctions — "All auctions"
Files: `app/admin/auctions/page.tsx` (113, server) + `AuctionsList.tsx` (160, client)

Blocks:
1. **PageHeader** title "Auctions", sub "Build, run and close auctions." (identical to nav blurb), action "New auction".
2. Section tabs (from nav): All auctions · New auction · Add a lot · Unsold & relist.
3. **Segmented** "Live (n)" / "Upcoming (n)" / "Closed (n)" / "Archived (n)" (Archived only if any).
4. **AuctionCard** list per group. Each card: title; Pill ("X left" red/amber/green | "opens X"/"ready" | status);
   "N lots", "N bids", "$X bid so far"/"$X sold"; Progress (live only); "Mon D to Mon D" (text-xs).
   `[dup: lots/bids/raised also on auction detail StatCards + dashboard Live now]`
5. Closed capped at 6 + "Show more (N older)" button. Archived has helper line "Hidden from reports, winners and the public site."
6. Empty states: "Nothing live right now." + "Your next auction is on deck under Upcoming." / "Open an auction and it shows up here.";
   "Nothing upcoming." + "Drafts and scheduled auctions land here."; "No closed auctions yet." + "Once an auction ends it moves here.";
   page-level "No auctions yet." + "Create your first one and start adding lots." + "Create your first auction".

Note: page does a full `item.findMany` of every item with an auctionId just to roll up bid counts (comment admits
the previous version was worse; this one still loads all item ids).

---

## 3. /admin/auctions/new — "New auction"
File: `app/admin/auctions/new/page.tsx` (154, client)

Blocks:
1. PageHeader title "New auction", sub "Name it, set when it runs, then add lots.", back "All auctions". Section tabs shown.
2. Red Notice on error.
3. **Panel "Set it up"** sub "Shown to bidders on the auction page.":
   - "Name" Input (placeholder "e.g. Weekly Overstock — Sept 12") — free text, NO auto-naming, no template, no date suggestion.
   - "Description (optional)" textarea rows=3 ("What's in this one? Shown to bidders.")
   - Eyebrow "When it runs": "Opens" datetime-local, "Closes" datetime-local. Defaults: tomorrow 9:00 AM, +7 days.
   - Live summary dark card: "Runs for" / "N days" / "Mon, Sep 12, 9:00 AM to ..." (or red Notice if end <= start).
   - Helper paragraph: "It opens and closes on its own at these times. Nothing is texted to bidders when it opens —
     you send that yourself from the auction's controls when you're ready."
   - "Create auction" full-width Btn (disabled until title + valid range). POST /api/auctions -> push to detail page.
4. Fetches `/api/me` on mount just to get orgId (also done in items/new and items/[itemId]).

Fields total: title, description, startAt, endAt. That's it — no location, no category, no premium override.

---

## 4. /admin/auctions/[auctionId] — manage auction
Files: `page.tsx` (518, server) + `EditAuction.tsx` (212) + `AuctionItemsList.tsx` (87) + `ProxyBidsPanel.tsx` (122)
+ `RecentBidsPanel.tsx` (88) + `ArchiveButton.tsx` (78) + `DeleteAuctionButton.tsx` (58) + `AuctionResults.tsx` (659)
+ shared `app/components/AuctionStatusButtons.tsx` (178). Total ~2,000 lines for one route.

The page has TWO modes: live/draft (editor) and ended (fulfillment board). Shared top half:

1. **PageHeader** (tabs off, back "All auctions"): title = auction title; sub = status Pill ("open"/"closing"/"Scheduled"/...)
   + optional "Starting shortly" + "Archived · hidden" + "Closes/Closed <date>"; actions: "View" (public page, new tab),
   "Edit" (anchor #edit-auction, hidden when ended), "Flyer", `ArchiveButton` ("Archive" -> "Hide from reports & site?"
   Archive/Cancel; or "Un-archive").
2. **Hero dark card**: eyebrow "Bid so far" (live) / "Sold for" (ended); big `$totalRaised` (gold); helper
   "Winning bids only — before premium & tax." + optional "Includes $X comped (N of your own wins), which Reports leaves out."
   `[dup: AuctionsList card raised; AuctionResults "Gross"; Reports per-auction "Hammer"]`
3. **3 StatCards**: "Lots" (items.length), "Bids" (sum bid counts), "Live" (ACTIVE items count, green if >0).
   `[dup: Lots/Bids on AuctionsList card]`
4. **Panel (timeline)**: eyebrow "Opens" + date + Pill "opened"; eyebrow "Closes" + date + Pill "closed"; Progress bar if live;
   helper for DRAFT: "This auction will go live automatically at its start time." / "The start time has passed — this auction
   will go live in a moment."
5. **Panel "By warehouse"** (pin icon) sub "Current bids"/"Sold"/"No bids yet": 2-col grid of warehouse name, "N lots", `$total`.
   `[dup: Reports "What each warehouse made"; reports/[auctionId] "By warehouse" — different basis (bid vs net)]`

### 4a. Live / draft mode (below the shared blocks)
6. **EditAuction Panel** "Edit auction" sub "Open it, announce it, change the name or times." — collapsed by default
   (chevron toggle; opens if URL hash is #edit-auction). When open:
   - Eyebrow "Actions": `AuctionStatusButtons` — DRAFT: "Open Auction" (confirm: "Open this auction now? Items go live immediately.
     No text is sent — use "Send live text"..." / "Open silently"). Live: "Send "Auction is Live" text" (once; becomes
     "Live text sent"), OPEN: "Mark Closing Soon", live: "Un-open (back to draft)" (long confirm text). + "Social flyer" BtnLink.
   - Eyebrow "Details": "Auction name" Input, "Description" textarea, "Opens at" (draft only) + "Closes at" datetime-local,
     helper "The auction opens and closes automatically at these times. To end it early, set the close time to now.",
     "Save changes" Btn + inline Notice.
7. **ProxyBidsPanel** `[owner]` "Active max bids (N)" sub "Private to staff" — collapsed; header shows "Headroom $X" even collapsed.
   Open: amber card "Headroom on the table" $X + paragraph ("Across N items, this is how far the current prices sit below what
   the top bidders would secretly pay — biggest single gap is $X. You capture it only if another bidder competes before close.");
   helper "The hidden maximum each bidder is willing to pay. The system auto-bids up to this amount."; rows: item title,
   "bidder · now $X", "Gap +$X" (text-[10px] label), "Max $X". Empty: "No active max bids right now." / "When a bidder sets a
   maximum, it appears here." `[dup: Reports "Money left on the table" headroom; reports/[auctionId] "Left on the table"]`
8. **RecentBidsPanel** "Recent bids" sub "Last N across every lot" — open by default, chevron toggle; rows: item, "bidder · auto-bid ·
   date", $amount, Pill "Leading"/"Outbid". Empty: "No bids on this auction yet." / "They show up here the moment they land."
9. **Panel "Lots (N)"** action "Add a lot" (-> /admin/items/new?auctionId=). `AuctionItemsList`: SearchBox
   ("Search lots by title or shelf…") only when >10 items; Row per item: thumb, title, "shelf · N bids", $currentBid, StatusPill
   (hidden on phone). Empty: "No lots yet" / "Add lots to this auction so bidders can start bidding." / "Add the first lot".
10. **Panel "Danger zone"** (DRAFT only, red): "Deleting this draft auction cannot be undone. Items in it will be unlinked and
    saved as drafts." + "Delete Auction" (in-app confirm modal).

### 4b. Ended mode (CLOSED/SETTLED)
6. **Panel (slate)** "This auction has ended" / "Bidding is closed — manage collection below." + `AuctionStatusButtons`
   (renders nothing useful for CLOSED — no buttons match that status, so this is an empty action slot).
7. **AuctionResults** — "Results & fulfillment" Panel sub "Who won what, who's paid, who's collected."; actions "Reports",
   "Winners" ghost links. 4 mini-stats: "Sold" (count), "Gross" ($), "Unpaid" (count, red if >0), "Picked up" N/M + Progress.
   `[dup: Gross = hero "Sold for"; Unpaid = dashboard/winners/reports owed; Picked up = pickup board]`
   SearchBox "Search orders by name, email or phone…" if >5 orders.
   Then collapsible section buttons (all closed by default): "Pickup scheduled (n) — Has a booked collection time",
   "No pickup booked (n) — Has a location — waiting on the customer to pick a time",
   "No location set (n) — Pick their pickup location to start fulfillment", and green "All set — picked up (n)" (capped 5).
   Each **order card**: Initials, name, "phone · email", "N items", Pills "N unpaid"/"Gathered"/"X/N picked up",
   warehouse chips "Owosso ×2" / "N transferring to X", `$total`, "View items"/"Hide items"; green banner "Pickup <when> · loc";
   "Picks up at X" or "No pickup location chosen yet — the customer sets it on their pickup page."; buttons "Print 4×6 label",
   "Gather N here"/"Gathered — undo". Expanded items: thumb, code+title, $, PaidPill (Paid/Comped/Unpaid), status line
   (Picked up / Transferring to X / Gathered · off shelf / X · ready to gather / No warehouse set); per-item buttons
   "Gather"/"Gathered", "Picked up" (ghost) or green "Picked up" (undo) or Pill "Awaiting transfer"; "Forfeit item" link ->
   "Refund this item & relist"/"Forfeit & relist" + Cancel. Footer "Mark whole order picked up".
   `[dup: the entire gather/picked-up/label workflow is ALSO on /admin/pickup (appointments + waiting list)]`
8. **Panel "Didn't sell (N)"** sub "Relist straight into another auction." action "All unsold": rows thumb, code+title,
   "warehouse · shelf · high bid $X", `RelistControl`, "Edit". `[dup: /admin/unsold is the same list grouped by auction]`

Sub-nav: none (tabs=false). Live refresh via PusherRefresh.

---

## 5. /admin/auctions/[auctionId]/flyer — "Social post"
Files: `flyer/page.tsx` (187, server) + `FlyerStudio.tsx` (76) + `FlyerMotion.tsx` (387) + `FlyerStage.tsx` (61)
+ `DownloadFlyerButton.tsx` (85). ~800 lines.

Blocks:
1. Custom header (NOT PageHeader): "← Auction / Social post" (h1 text-2xl/3xl). Off-kit styling.
2. **FlyerStudio** toggle buttons "Video" / "Image" (hand-rolled, not Segmented). Video is default.
3. Video tab: tan help box "Post it in 3 steps" (ol: open screen recorder / tap Play & record / let it loop…) + text-xs
   "A screen recording is a clean MP4 that uploads perfectly to Facebook & Instagram — nothing to download."
   Then `FlyerMotion`: inline poster + "Play & record" button + helper "Tap play, start your phone's screen recorder when the
   countdown hits GO, let it run one full loop, then stop." -> fullscreen overlay, 3-2-1 countdown, 2-per-scene item loop,
   progress bar, loop-complete flag.
4. Image tab: "Download image" button (loads html2canvas from CDN; falls back to `alert()`), helper "Top items with live prices,
   1080×1080. Download, or screenshot below."; `FlyerStage` scaled 1080x1080 static flyer (logo, "Live Auction" pill, title,
   "Closes …", 3x2 item grid w/ price + retail, footer "Bid • Win • Pick up local / northwoodbids.com / New auctions every week —
   sign up free and start bidding.").
5. "This auction has no items with photos yet — add some items first." when empty.

Reachable from: header "Flyer" button AND EditAuction "Social flyer" button (two entry points to the same page).

---

## 6. /admin/items/new — "Add a lot"
File: `app/admin/items/new/page.tsx` (1,201, client). Detailed flow analysis in section E.

Blocks in order:
1. **Fullscreen "filling" overlay** (while a scan auto-fills): spinner, eyebrow "Write this on the item", `#CODE` (text-5xl/6xl),
   "Filling the form…", "Pulling in the title, price & photos".
2. **PageHeader** "Add a lot"; sub "Goes straight into this auction." (if ?auctionId) else "Scan it, tag it, save it. Next.";
   back "Auction"/"Auctions"; tabs hidden when preselected; action "Start fresh" (outline, reset icon).
3. Notice banner (green/red by regex on text: /saved|filled|ready/).
4. **Dark tag card**: eyebrow "Write this # on the item", `#nextCode` (font-mono 5xl/6xl), "Last saved #X · title" (text-[11px]);
   right: "Combo"/"Combo on" toggle Btn.
5. **Combo size picker** (if combo): eyebrow "Lot size", chips 2/3/4/5/6, "N/M photos · one code".
6. **BarcodeScanner Panel**: "Scan"/"Stop" Btn, Input "or type barcode / FNSKU / ASIN", "Go" Btn; camera preview w/ "Point at barcode";
   "Looking it up…"; amber Notice errors; link "Can't scan it? Search by name" -> search Input ('e.g. "Ninja air fryer 5.5qt"') +
   "Search" Btn + results list (thumb, title, brand, $price, "Use"); result card "Confirm this is it"/"Add to combo", image picker
   ("Tap a photo to use it as the main photo"), "Use this — fill the form" / "Not it" / "Skip / scan next".
   Collapsed state: one-line button "Scan another barcode".
7. **Panel "Details"**: auto-growing title textarea (placeholder 'Title * — e.g. Apple iPad Pro 12.9"'); "Condition" 5 chips
   New/Like new/Good/Fair/Poor; row: "Size (optional)" Input + "Feature"/"Featured" star chip; "Description (optional)" textarea rows=2.
8. **Panel "Pricing"**: 3-col "$" inputs: "Retail", "Start *" (default 2), "Reserve".
9. **Panel "Location"**: "Warehouse *" select (or "Set one up" link to /admin/pickup if none), "Shelf / spot" Input; chip row of
   previously-used spots (up to 12); "Can transfer" / "Pickup only" chips; "Save as draft / <auction>" select (hidden when preselected).
10. **Panel "Photos"** sub "N of 10 · first one is the main photo": horizontal 80px thumb strip, "Main" badge (text-[9px]),
    corner X remove, dashed "+" tile (file input, multiple).
11. **Sticky footer**: "Save + next" (outline) / "Save & done".

Hidden-but-posted fields: `taxDeductible`, `itemCode`, `packSize`, `isPremium`, `transferable`. Query-param prefill for
title/description/condition/size/retailValue/startingBid/reservePrice/taxDeductible/storageLocation/locationId.

---

## 7. /admin/items/[itemId] — "Edit item"
File: `app/admin/items/[itemId]/page.tsx` (531, client)

Blocks:
1. Skeleton loading state (3+2 panels).
2. **PageHeader** "Edit item" (tabs off, back Auction/Auctions); sub: Pill Sold/Live now/status + "$X · N bids" +
   "Careful — people are bidding on this".
3. Left column (2/3):
   - **Panel "Photos"** sub "The main photo is what bidders see first. Tap Make main on any photo to change it." / "Up to 10":
     2/4-col grid, each tile has "Main" Pill, bar with "Shown first" / "Make main" + trash button; dashed "Tap to add photos".
   - **Panel "Details"**: "Item title *", "Description" rows=3, "Condition" 5 chips, "Size (optional)", "Featured" chip
     ("Mark as Premium"/"Premium item" — different label from items/new "Feature"/"Featured").
   - **Panel "Pricing"**: "Retail value", "Starting bid", "Reserve price" (labels differ from items/new "Retail/Start/Reserve").
4. Right column:
   - **Panel "Location"**: "Item code" read-only ("auto-assigned"), "Shelf / spot", "Warehouse *" select, "Transfer" chips
     "Transferable" / "Pickup at warehouse only" (items/new says "Can transfer"/"Pickup only").
   - **Panel "Auction"**: select "Save as draft" / auctions.
   - **Panel "Staff notes"** sub "Bidders never see these." textarea (field `notes` — NOT on the create form).
   - **Panel "Danger zone"** (red): sold -> "This item has been sold. To reverse it, refund it from Winners & Payments."
     (Winners page has no refund button; forfeit lives on AuctionResults). Else "Remove from auction" (amber) + helper
     "Pulls it out of the auction and back to Drafts. Bids are cancelled. Nothing is deleted."; "Delete item permanently" (red)
     + helper. In-app confirm modal.
5. Sticky "Save changes" footer.
6. Uses native `alert()` in 9 places (upload cap, upload failures, missing warehouse, save/remove/delete errors) — the rest of
   the admin deliberately avoids alert() because it is blocked in the installed PWA. Form state also carries `category`,
   `donorName`, `taxDeductible` which have no inputs.

---

## 8. Redirect-only routes
- `/admin/items` -> /admin/auctions (5 lines). "Remove from auction"/"Delete item" push here, landing on the auctions list.
- `/admin/dashboard/new` -> /admin/items/new (5 lines).
- `/admin/bidders/report` -> /admin/reports (7 lines).
- `/admin/settings` -> /admin/settings/payments (5 lines).

---

## 9. /admin/unsold — "Unsold & relist" `[owner]`
Files: `unsold/page.tsx` (79, server) + `UnsoldList.tsx` (106)

Blocks:
1. PageHeader "Unsold & relist", sub "Everything that didn't sell. Relist an item straight into another auction, or save it to
   drafts for later." Section tabs shown.
2. SearchBox "Search unsold by title or location…" (only if >8).
3. One **Panel per source auction** "Title (n)" action "Manage auction": rows thumb, title, "warehouse · shelf · high bid $X",
   `RelistControl`, "Edit".
4. Empty: trophy icon, "Nothing unsold right now." / "Every lot found a buyer." / "All auctions".
`[dup: AuctionResults "Didn't sell" panel shows the same items per auction with the same controls]`

---

## 10. /admin/pickup — "Pickup" board
Files: `pickup/page.tsx` (2,479, client — the largest file) + `DoorCodePanel.tsx` (87)

Loads 4 endpoints on mount (appointments, locations, transfers, waiting). ~40 useState hooks in one component.

Blocks:
1. **PageHeader** "Pickup", sub "Appointments, transfers, warehouses." (identical to nav blurb); actions = warehouse scope
   Segmented "All warehouses (n) / Owosso (n) / …" (persisted to localStorage; hidden on Locations tab).
2. **Toolbar**: Segmented "Pickups (waiting n) / Transfers (active n) / Locations" + SearchBox "Find an item — tag #, title, or
   customer…" with a dropdown of results (code+title, owner · phone, colored "where" chip, "Jump") that switches tab/scope/scroll.
3. Notice flash (4s).

### Tab "Pickups" (3/5 + 2/5 grid)
4. **TODAY header card** (hand-rolled, colored by state): eyebrow "Today · Owosso", "N pickups · M items" or "No pickups today",
   right "X/N" + eyebrow "staged", progress bar, "Everything's boxed and labeled. You're ready for the day." /
   "N orders still to gather and label." `[dup: dashboard "Pickups today" ActionCard + "Today's schedule" panel]`
5. **Today appointment rows**: time (lg) + AM/PM (text-[10px]), name, email/phone, "N items", `ApptChips` (LocationBadge,
   "Late" red chip, "Gathered" Pill), right: green "✓ Box 4" or amber "Stage" button. Tap expands `ApptDetail`.
6. **ApptDetail** (shared by Today / Coming up): email/phone; `DoorCodePanel` (if location has locks): eyebrow "Door code", big
   code, Pill No code/On the locks/Failed/Programming, "locks · texted <when>", buttons Resend / New code / Make code / Check,
   "Unlock <door>" per lock, "Remove code"; gather list: eyebrow "Gather N items" + "X/N" + Progress, tick rows (checkbox, 48px photo,
   code chip, shelf chip, "Just arrived · place it" Pill, title w/ strikethrough) each with a per-item "Picked up" Btn;
   "Everything's gathered — stage it below."; if already staged: green "Staged & ready / Box 4 / N items boxed for pickup." + list.
   Action row: "Stage order"/"Staged in X", "Print label", "Reschedule", "Order picked up" (green), "Cancel" (red outline).
   Reschedule editor: "Date & time (Michigan)" datetime-local, "Location" select, Save/Cancel.
   Stage editor: "Where is this order boxed up?" + "The customer sees this on their pickup screen. It clears itself once collected."
   + Input "Box 4" + "Stage order"/"Update spot" + Cancel + "Un-stage this order".
7. **Panel "Coming up"** sub "N booked beyond today": SearchBox "Search customer or item…"; compact rows (name, contact, date,
   chips, staged chip, item-count badge, chevron) -> same ApptDetail. Empty: "No upcoming appointments yet." /
   "Winners book their own slot once they've paid." or "Nothing scheduled beyond today."
8. **Panel "Picked up"** sub "N collected", Show/Hide toggle, SearchBox "Search picked-up orders by name, email or phone…",
   "Showing the 5 most recent · search to find older ones.", rows w/ Pill "Picked up"; expanded: items list +
   "Reopen — this wasn't picked up".
9. **Panel "Not booked yet"** (right col) sub "N people paid, no slot yet": 3 mini-stats "People" / "Items" / "No location"
   (unscoped totals even when warehouse-scoped) `[dup: dashboard "Paid, waiting to be booked"]`; SearchBox (if >5);
   per-person card: name, email, phone, big item count + eyebrow "items", LocationBadge or Pill "No location picked",
   Pill "Gathered: X"/"Gathered", "waiting N days"; buttons "Gather X/N"/"Hide", "Print label", "Text" (MessageSheet) or
   "No phone"; blue full-width "Add N items to their <when> pickup at X"; expanded gather checklist (same tick rows, transferring
   rows "— awaiting transfer", "— at <warehouse> · <spot>") + per-item "Picked up"; gather-spot editor "Gather spot — e.g. Shelf B"
   + "Set spot"/"Update" + Cancel + Clear, or button "Set gather spot"/"Gathered in X".
   Empty: check icon, "Nobody's waiting." / "Nothing waiting at X." + "Everyone with won items has booked a pickup."

### Tab "Transfers"
10. **Panel "Active transfers"** sub "N to move" / "N of M · gathering at X"; action "Print all transfers to pull" /
    "Print all to pull · X". Rows: name, contact, "From -> To · N items", Pill "Gathered: X"/"Gathered", Pill "Requested"/"In transit".
    Expanded: email/phone, "Requested <date>", amber "Gathered — ready to load / X / Set aside for the team. Load & drop off on
    transfer day.", eyebrow "N items to gather at X", tick rows ("— now at <loc> · <spot>"), "Print 4×6 label", gather-spot editor
    ("Gather spot — e.g. Bay 3"), "Mark Loaded" (outline) / "Mark Dropped Off" (green), "Undo "loaded" — back to gathering".
    Empty: "No transfers waiting." / "When a bidder asks for their items to be moved to another location, it shows up here."
11. **Panel "Recently completed"** sub "N dropped off", Show/Hide, SearchBox (if >5), rows w/ Pill "Dropped off", expanded items
    + "Undo — these weren't dropped off"; "Showing 5 most recent. Search above…" (text-[11px]).

### Tab "Locations"
12. **Panel "Add a pickup location"** (collapsed accordion): Inputs "Location name (e.g. Main Warehouse)", "Address (optional)",
    textarea "Instructions for bidders (optional)", "Add location".
13. **LocationCard** per location: name, Pill "Hidden from bidders", address, instructions; buttons Edit (inline name/address/
    instructions editor) / Hide|Show / Delete. Eyebrow "Weekly hours": rows "Wed 9:00 AM–5:00 PM · 30-min slots · 2 per slot"
    + "Remove". "Add hours" form: Day select, Start time, End time, "Slot length" (15/30/60), "Capacity" number, "Add".
    Eyebrow "Block off dates (vacations & holidays)": rows + Remove; form From / To (optional) / Reason (optional) /
    "Block off these dates"; helper "Bidders can't schedule pickups on blocked days. Leave "To" empty to block a single day."
    Empty: "No pickup locations yet." / "Add one above and set its weekly hours."

14. `MessageSheet` + in-app confirm modal at page bottom.

Sub-nav: in-page Segmented (Pickups / Transfers / Locations). Nav group has one page.
Note: the Locations tab is "Settings" content (warehouses, hours, blackouts) living inside the daily-work board.

---

## 11. /admin/winners — "Winners & payments" `[owner]`
File: `app/admin/winners/page.tsx` (409, client). Single fetch `/api/admin/winners?q&skip&filter`.

Blocks:
1. **PageHeader** "Winners & payments", sub "$X still to collect." / "Everyone's paid up." Section tabs: Winners & payments · Reports.
2. **ActionCard** (if owed) red: `$owedTotal` "Not collected" "N people owe you — card declined or pending" (-> #owed).
   `[dup: dashboard "Money not collected"; Reports "Still owed to you"; reports/[auctionId] "Still owed on this auction"]`
3. **2 StatCards**: "Total won" `$totalWon` sub "N items" (green); "Winners" count sub "$avg average".
   `[dup: Reports "Buyers paid"/"Items sold" (different basis); Reports>Bidders "Total customer spend"]`
4. **"Collected" ratio card**: eyebrow "Collected", "NN%", Progress. `[dup: Reports "Kept per dollar paid" — different ratio, same shape]`
5. **"Biggest win ever"** dark card: trophy, `$amount`, "name · title". (Vanity.)
6. **Segmented** "Wins & payments" / "Leaderboards".
7. Leaderboards tab: 4 `Board` panels (rank, Initials, name, Progress bar, value): "Top spenders — Most money won, all time",
   "Most wins — Items taken home", "Most bids placed — Who's most active", "Leading right now — Winning live items — money in the air".
   Empty: "Nothing here yet." / "Leaders show up once people win and bid."
   `[dup: Reports>Bidders "Top spenders" panel is the same list]`
8. Wins tab: **Panel "Who owes you"** (red) sub "N people": per person Initials, name, "N items", `$amount` (2xl red);
   buttons "Retry charge" (green) + "Text" (blue outline, MessageSheet); "Mark paid — cash" -> "Confirm cash $X" / Cancel;
   inline Notices ("Charged" / "Covered by Bid Bucks" / "Marked paid in cash").
9. SearchBox "Search winner or item…" + Segmented "All / Unpaid / Paid".
10. **Panel "Wins"** sub "N total": Row per win -> /invoice/<auction>?user=: photo or Initials, title, name, `$amount`, Pill
    Paid/Comp/Unpaid. Pagination "Prev / 1–50 of N / Next". Empty "No wins yet." / "Wins land here as auctions close."

---

## 12. /admin/reports — "Reports" `[owner]`
Files: `reports/page.tsx` (550) + `BidderReportView.tsx` (299) + `CashReportView.tsx` (152) + `Charts.tsx` (200). ~1,200 lines.
Header action = Segmented "Sales / Bidders / Cash" (3 views with independent fetches and range state).

### View "Sales" (default, fetch `/api/admin/reports?range=`)
1. PageHeader "Reports" sub "What you made, and where it went."
2. Segmented range "Week / 30d / 90d / Year / All" (default 90d).
3. **Hero dark card**: eyebrow "You made", `$net` (5xl/6xl gold), "N items sold across M auctions · $X average", `Scope` pill row
   ("✓ Premium", "✗ Tax", "✗ Your wins"), inner card with trend title + `AreaTrend` chart.
   `[dup: dashboard "Sold this week" (7d PAID sum, different basis)]`
4. **4 StatCards**: "Buyers paid" `$` sub "N charges"; "Items sold" sub "$X average"; "Sales tax held" (amber) sub "passed to Michigan";
   "Stripe's cut" (red) sub "estimated 2.9% + 30¢".
5. **"Best auction"** callout card (trophy): auction label, "$X from N items" -> /admin/reports/<id>.
6. Section "What each auction made" + "Biggest earner first. Tap one for the breakdown." + Scope row; `EarnerCard` list (rank
   circle, label, "N items · date · $avg", `$net`, "Full report ›", share bar); capped 5 + "Show all N auctions".
   Empty "No sales in this period." / "Widen the range or wait for the next auction to close."
7. Section "What each warehouse made" + "Same money, split by where the items were stored." + Scope row; expandable EarnerCards
   -> "Hammer / Premium / Stripe" mini-stats + "By auction" split. `[dup: auction detail "By warehouse"]`
8. **Panel "Where the money went"** sub "Everything buyers paid you, and who ended up with it.": Scope row; `MoneyBar` = Donut
   (center "$buyersPaid / buyers paid") + legend "In your pocket / Sales tax (to Michigan) / Stripe's cut / Bid Bucks used" w/ % ;
   paragraph "Buyers paid $X in total across N card charges. The green slice is what's actually yours — tax was never your money,
   and Stripe takes its cut before you see it."; optional cash line; "Kept per dollar paid NN%" + Progress.
   `[dup: reports/[auctionId] has the identical donut + legend]`
9. **Panel "Money left on the table"** (amber): paragraph "Winners with a max bid usually pay less than their max — the lot stops one
   increment over the runner-up. That gap is demand you had but didn't capture."; `$headroom`; mini-stats "Lots / Avg gap / Biggest";
   text-xs "A big number here means lots are closing cheap — too few bidders in the room, increments too small, or reserves set too low."
   `[dup: ProxyBidsPanel headroom (live); reports/[auctionId] "Left on the table"]`
10. **Panel "Still owed to you"** (red) sub "Cards that didn't go through. Not counted above." action "Collect" (-> winners):
    Scope row, `$owed`, rows Initials/name/"N items · phone"/$due. `[dup: winners "Who owes you" — same people, no actions here]`
11. **Panel "What the tags on each report mean"**: 3-row dl explaining ✓ Premium / ✓ Tax / ✓ Your wins.
12. Footer paragraph: ""You made" = winning bids + your 15% premium, minus Stripe's cut and any Bid Bucks spent. Sales tax isn't
    included — you collect it and pass it to Michigan. Stripe's fee is estimated at 2.9% + 30¢ per charge; everything else is exact."

### View "Bidders" (`BidderReportView`, fetch `/api/admin/bidders/report`, no range)
1. Hero dark: "Total customer spend" `$`, "N paying bidders · $X avg each · N total bids placed". `[dup: winners "Total won"]`
2. **6 StatCards**: "Total bidders" sub "N have bid"; "New (30 days)" (green) "just signed up" `[dup: dashboard "New bidders · 7d"]`;
   "Never bid" (amber) "signed up, no bids"; "Active (30d)" (green); "Active (60d)"; "Stale" (red) "bid before, quiet 60d+".
3. **Panel "Your bidder base"** sub "N of M have ever bid": Donut (Active/Cooling/Stale/Never bid), "Have placed a bid NN%" Progress,
   "Chasing the stale and never-bid groups is where re-engagement lives."
4. **Panel "New signups"** sub "Last 12 weeks": AreaTrend.
5. **Panel "Top spenders"**: ranked bars. `[dup: winners Leaderboards "Top spenders"]`
6. Segmented filter "All / New (30d) / Active 30d / Active 60d / Stale / Never bid / Top spenders" (with counts); Toolbar: SearchBox
   "Search name, email, phone…" + eyebrow "Sort" + Segmented "Spend / Bids / Newest / Last bid".
7. **Panel "N bidders"** action "Manage bidders": Row per bidder (Initials, name + StatusTag Pill + "Blocked", email · phone,
   "Joined <date> · Nd ago · last bid X", `$spend`, "N bids · N won"). `[dup: /admin/bidders list — same people, no actions here]`

### View "Cash" (`CashReportView`, fetch `/api/admin/reports/cash?range=`)
1. Own Segmented range (Week/30d/90d/Year/All) — state separate from Sales range.
2. Hero dark "Cash collected in person" `$` + "Full amount handed over, tax included."
3. 2 StatCards "Items" (green) "paid in cash" / "Customers" "paid at the counter".
4. **Panel "Who paid cash"** sub "Tap a name for the items.": Row per person (name, "N items · last <date> · phone", `$`, "Details"/
   "Hide"); expanded lines (code, title, auction · date · note, $total, "$h + $p prem + $t tax").
5. Footer paragraph "Cash payments are counted as real revenue in the Sales report (with no Stripe fee…)".
   Empty "No cash payments in this period." / "Mark a balance paid in cash from Winners & payments and it lands here."

---

## 13. /admin/reports/[auctionId] — per-auction report `[owner]`
File: `reports/[auctionId]/page.tsx` (344, server). Also handles `auctionId === "none"` ("Items with no auction").

Blocks:
1. PageHeader eyebrow "Auction report", title, sub "<start> to <end> · status", back "Reports", tabs off.
2. Hero dark "You made" `$net`, "N items sold · $X average". `[dup: auction detail hero "Sold for" (hammer, not net)]`
3. **6 StatCards**: "Hammer (bids)", "Premium (15%)" (green), "Stripe fees" (red, "−$"), "Bid Bucks used" (amber, "−$"),
   "Sell-through" NN% sub "N of M offered", "Card charges".
4. **Panel "Sales tax"** sub "Collected from buyers and passed to the state — never counted as your earnings.": 5 rows Hammer /
   Buyer's premium / Taxable subtotal / Tax rate / Tax collected + paragraph "Buyers paid $X total (hammer + premium + tax) across N charges."
5. **Panel "Where the money went"**: Donut + legend (identical to Reports). `[dup]`
6. **Panel "By warehouse"** sub "This auction's net, split by where items were stored.": label, $net, Progress. `[dup: auction detail]`
7. **Panel "Sell-through"** sub "NN% of what was offered found a buyer.": Progress + mini-stats "Sold / Didn't sell / Offered".
   (Sell-through also appears as a StatCard two blocks up on the same page.) `[dup within page; AuctionResults Sold + Didn't sell counts]`
8. **Panel "Left on the table"** (amber): `$`, paragraph "On N items the winner set a max bid higher than what they paid…". `[dup]`
9. **Panel "Still owed on this auction"** (red) sub "Cards that haven't gone through. Not counted above." action "Collect": `$`, rows. `[dup]`
10. Empty "No paid sales recorded for this auction yet." / "Figures fill in as winners pay."

Nav/active-state: isActivePage lights "Reports" tab for this path; but `tabs={false}` so no tabs render.

---

## 14. /admin/bidders — "Bidders" `[owner]`
File: `app/admin/bidders/page.tsx` (323, client). Fetch `/api/admin/bidders?q=` (cap 200) + `/api/me`.

Blocks:
1. PageHeader "Bidders", sub "Block someone, or make them staff." Section tabs: Bidders · Referrals · Welcome codes · Team · Text a group.
2. SearchBox "Search name, email, or phone…".
3. Segmented "Everyone (n) / Blocked (n) / Staff (n)".
4. Notice "Showing the 200 most recent bidders. Use search to find anyone else." (at cap).
5. **Panel**: Row per bidder (Initials, name or "Unnamed bidder", "email · phone", Pills Owner/Admin/Staff + "Blocked");
   blockedReason line; "Pickup" eyebrow + select of locations ("Not set — choose…") (owner/admin override);
   buttons "Text" (blue), "Make staff", "Make admin" (owner), "Remove staff" (owner), "Block"/"Unblock".
   Empty: "Nobody is blocked." / "No staff yet." / "No bidders found." with matching subs.
6. MessageSheet + in-app confirm modal. (Block/role errors still use native `alert()`.)

`[dup: role management also on /admin/staff (Team); bidder list also in Reports>Bidders; pickup-location override also implied
by AuctionResults "No location set" bucket (read-only there)]`

---

## 15. /admin/referrals — "Referrals" `[owner]`
File: `app/admin/referrals/page.tsx` (342, client). Fetch `/api/admin/referrals`.

Blocks:
1. PageHeader "Referrals", sub "Bid Bucks — who's earned credit, and what you owe."
2. **2 StatCards**: "Credit outstanding" `$` sub "Bid Bucks people can still spend" (amber/green); "Waiting to earn" count sub
   "N blocked"/"No blocked referrals". `[dup: Reports "Bid Bucks used" is the spent side of the same ledger]`
3. **Panel "Negative balances"** (red) sub "These need correcting" (conditional).
4. SearchBox "Search name, email or code…".
5. **Panel "Balances"** sub "N people": Row (Initials, name, "earned $X · used $Y", balance, "Adjust"); "Show more (N left)".
   Empty "No balances yet." / "Balances appear once someone earns or spends Bid Bucks."
6. **Panel "Referral history (N)"** collapsed accordion: Row (referrer, "invited X · date · earned date", Pill Earned/Waiting/
   At limit/Blocked), blockedReason; "Show more". Empty "No referrals yet." / "Every invite someone sends shows up here."
7. **Adjust dialog** (bottom sheet): "Adjust Bid Bucks", name, "Balance now", "Add or remove" number input, quick chips +$5 / +$10 / −$5,
   "Reason (optional)" ("Shows in the ledger"), "New balance" preview, Cancel / Save.

---

## 16. /admin/promos — "Welcome codes" `[owner]`
File: `app/admin/promos/page.tsx` (192, client). Fetch `/api/admin/promos`.

Blocks:
1. PageHeader "Welcome codes", sub "The link behind a QR code: scan, sign up, get Bid Bucks. One claim per person — account and
   phone number both count." action "New code".
2. **Panel "New welcome code"** (when creating) sub "Keep the code short — it's part of the link.": "Code" (default CARD5),
   "Where it's printed" (default "Business card"), "Bid Bucks (spent $5 per bill)" chips $5/$10/$15/$20, "Max claims (blank = unlimited)",
   "Expires (optional)" date; "Create code" / Cancel.
3. **Panel "How it works"** (leather) — 4-step ordered list (create code, paste into GoHighLevel QR generator, they scan…, second scan
   gets nothing). Always visible, above the list.
4. Per-code **Panel**: code (font-mono xl), Pill Off/Expired/Cap reached/Live, "label · $N Bid Bucks · cap N · expires D", link chip;
   buttons "Copy link"/"Copied", "Turn off"/"Turn on"; 3 mini-stats "Claimed" / "Went on to buy" / "Credit handed out $";
   "See recent claims" toggle -> rows (Initials, name, date, Pill Bought/Not yet).
   Empty "No welcome codes yet." / "Make one, print the QR, hand it out."

---

## 17. /admin/staff — "Team" `[owner]`
File: `app/admin/staff/page.tsx` (295, client). Fetch `/api/orgs/invite` + `/api/me`.

Blocks:
1. PageHeader "Team", sub "Who can get into the Workshop." action "Invite someone" (-> #invite).
2. Notice error.
3. **Panel "Members"** sub "N on the team": Row (Initials, name + "(you)", email or "Hasn't signed in yet.", Pill Owner/Admin/Staff,
   "Remove" ghost red (owner, not self/owner)). Empty "No members yet." / "Invite someone to get started."
4. **Panel "Pending invites"** sub "N waiting": Row (email, "Expires <date>", Pill role, "Revoke").
5. **Panel "Invite someone"** sub "They get a one-time link that expires in 7 days.": "Email address", "Role" select
   ("Staff — can manage items and auctions" / "Admin — can manage everything including team"), "Generate Invite Link";
   result box "Invite link created. Share this:" + readonly Input + "Copy" + "Expires in 7 days. One-time use."
6. In-app confirm modal.
`[dup: /admin/bidders already has Make staff / Make admin / Remove staff on any bidder row — two ways to manage the same 3 people]`

---

## 18. /admin/blast — "Text a group" `[owner]`
File: `app/admin/blast/page.tsx` (204, client).

Blocks:
1. PageHeader "Text a group", sub "One text to a slice of your bidders. Goes out through the same line as the auction-live texts."
2. **Panel "Who"** sub "Pick the crowd first — the count updates as you go.": 4 segment cards "Picks up at… X" / "Has items at… X" /
   "Both" / "Everyone" each with a sub-sentence; eyebrow "Warehouse" + pill buttons per location (default auto-picks /owosso/i);
   count box "N people (M with a phone)" + "See names"/"Hide names" -> sample list.
3. **Panel "Message"** sub "Keep it short — one text per person is cheapest.": textarea rows=6 ("Northwood Bids: …"); footer
   "N characters · N texts per person" (+ GSM warning); template buttons "Owosso Oct 4–11 notice" and "Weekday correction"
   (hardcoded one-off messages from a past move, including a street address and dates).
4. Notices: "Texting isn't configured on this server (GHL_AUCTION_STARTED_WEBHOOK)." / error / "Sent to N of M".
5. "Review and send" -> amber Panel "Send this to N people?" with message preview, "Yes, send it" / "Back".

---

## 19. /admin/giveaways — "Giveaways" `[owner]`
File: `app/admin/giveaways/page.tsx` (254, client). Fetch `/api/admin/giveaways`.

Blocks:
1. PageHeader "Giveaways", sub "Free prizes that grow the crowd." (identical to nav blurb) action "New giveaway".
2. **Panel "Set up a giveaway"** (when creating) sub "Title, how people get in, when it runs, how you draw.":
   "Title", "Description (optional — shows on the card)"; "How do people get a ticket?" 3 cards (Everyone's in / Tap to enter /
   Every bid = a ticket); if CLICK: "Ask them something?" 3 cards (Just a tap / Collect info / Correct answer) + prompt + answer inputs;
   if BID: "Only bids of at least $" + "Max tickets per person" + helper; "Who counts as registered" 2 cards (Any registered bidder /
   Card on file only) + helper "Either way it's one account per phone number…"; "Entry window" Opens / Closes datetime-local + long
   helper; "Draw style" 2 cards (Prize wheel / Ticket machine); "Create & add prizes" / Cancel.
3. **Panel** list: Row per giveaway (gift/check icon, title, "mode · draw · N prizes, N drawn · ends <date>", Pill phase).
   Empty "No giveaways yet." / "Create one to get started."

## 20. /admin/giveaways/[id] — manage giveaway `[owner]`
Files: `giveaways/[id]/page.tsx` (647) + `SpinWheel.tsx` (267) + `TicketMachine.tsx` (210). ~1,100 lines.

Blocks:
1. PageHeader eyebrow "Giveaway", title, sub = rule sentence (e.g. "Every registered bidder holds one ticket automatically."),
   back "Giveaways", action Pill phase.
2. Meta line "Ticket machine · opens X · closes X / closes when you end it".
3. Notice msg.
4. **Status action row**: "Go live (show on home)" (draft); "Announce (text everyone)" -> inline confirm "Text every bidder that it's live?"
   Yes, send / cancel; "Announced <date>"; "End now (close entries)"; "Change close time"; "Unpublish" (if none drawn);
   "Reopen with a new close time" (ended); "Switch to wheel/ticket machine"; "Archive" (DRAWN).
5. **Panel "Change close time" / "New close time"** (toggle): datetime-local + Save/Reopen + Cancel.
6. **Panel "Pull winners"** sub "N tickets · N people · N prizes left": amber Notice "Entries are still open — tickets keep stacking
   until it closes. You can pull now, but most people wait for "Ended"."; "All prizes drawn!" / "No tickets in the drum yet."; button
   "Full-screen draw (for the camera)"; inline `TicketMachine` (size 640) or `SpinWheel` ("Spin" button, draw -> award).
7. **Panel "Prizes (N)"** sub "Each prize = one winner.": rows (photo, title, "$X value · won by Y", Pill Won / "Remove");
   "Add a prize" form: "Prize name", "Retail value $", "Location…" select, "Add photo"/"Photo added" label + thumb, "Add prize".
8. **Panel "Tickets (N)"** sub "across N people": mode-specific helper sentence; "Top ticket holders" chip row (BID mode);
   "Fair-play filter" box (text-xs) with kept-out counts + "Switch to any registered bidder"/"Require a card on file" link +
   duplicate chips; Input "Search a bidder to add or remove…" -> result rows (Initials, name, tickets, email, ineligible reason,
   buttons "Bonus" (uses native `window.prompt`), "Remove"/"Restore"/"Add", Pill Won); "Removed from wheel (N)" chips "name · restore".
9. **Panel "Winners (N)"** (green): rows (trophy, name, "won X — added to their pickups", "Undo win" -> "Undo? Yes, undo / cancel").
10. **Fullscreen presentation overlay**: "Exit", "Northwood Bids Giveaway", title, counts line, large TicketMachine/SpinWheel.

---

## 21. /admin/settings/payments — "Settings" (Payments) `[owner]`
File: `settings/payments/page.tsx` (257, client). Fetch `/api/admin/settings`.

Blocks:
1. PageHeader "Settings", sub "Payments and business setup." Section tabs: Payments · Doors.
2. **Status Panel** (green/red): dot + "Taking payments" / "NOT taking payments"; sentence ("Winners are charged automatically when
   an auction closes." / Stripe-disabled warning); amber Notice "Payouts are paused…"; "Open Stripe dashboard" link-button.
3. **Panel "Fees & sales tax"** sub "What gets added on top of every winning bid.": "Buyer's premium" % input + helper "An extra
   percentage added on top of each winning bid. The winner pays this."; "Sales tax" % input + helper "The percentage of sales tax
   added to each winning bid."; checkbox "Tax exempt" + helper; dark worked-example card "On a $100 winning bid" (Winning bid /
   + Your premium / + Sales tax / Buyer pays / "You keep the bid plus $X premium. The $Y tax goes to Michigan."); Notice; "Save changes".
4. Footer "Bank details and payouts are managed in your Stripe dashboard."

## 22. /admin/settings/doors — "Settings" (Doors) `[owner]`
File: `settings/doors/page.tsx` (219, client). Fetch `/api/admin/doors`.

Blocks:
1. PageHeader "Settings", sub "Doors: customers let themselves in with a one-day code." action "Find my locks".
2. Notice msg; if not configured: amber Panel "Doors aren't turned on yet" + "Add SEAM_API_KEY to the site's environment and redeploy.
   The full checklist is in docs/door-locks.md."
3. **3 mini-stats** (hand-rolled): "Locks" / "Online" / "Codes out". `[dup: pickup DoorCodePanel shows per-appointment code status]`
4. Empty Panel: lock icon, "No locks linked yet." / "Step 1: link the Schlage Home account… Step 2: tap Find my locks." /
   "Link Schlage account".
5. Notice "N locks not on a location yet — pick one below or no codes will be made for it."
6. Per-lock **Panel**: name (click to rename), Pill Not in Seam/Offline/Needs attention/Online, "Paused", Locked/Unlocked;
   "model · battery N% · N-digit codes · can't program codes"; issues; "Battery low — swap the 4 AA batteries."; buttons "Unlock" /
   "Lock"; "Which pickup location is this door at?" select; "Pause codes"/"Resume codes".
7. "Link another Schlage account" button.
8. **Panel "How it works"** (leather) — 5-step ordered list describing the door-code lifecycle.

---

## A. Duplicated metrics / data across pages

| Metric / data | Pages where it appears |
|---|---|
| Money owed / unpaid total + who owes | Dashboard "Money not collected"; Winners ActionCard + "Who owes you"; Reports "Still owed to you"; reports/[id] "Still owed"; AuctionResults "Unpaid" + per-order "N unpaid" |
| Sales $ for a period | Dashboard "Sold this week" (PAID sum 7d); Reports hero "You made" (net); Reports "Buyers paid"; Winners "Total won" (hammer all-time); Reports>Bidders "Total customer spend" |
| Per-auction money | AuctionsList card "$X bid so far/sold"; auction detail hero + "By warehouse"; AuctionResults "Gross"; Reports EarnerCard net; reports/[id] hero + Hammer StatCard |
| Lots / bids per auction | AuctionsList card (lots, bids); auction detail StatCards "Lots", "Bids", "Live"; dashboard "Live now" rows ("N lots · $X") |
| Live auction time-left + progress bar | Dashboard "Live now"; AuctionsList live card; auction detail timeline Panel |
| Per-warehouse split | Auction detail "By warehouse"; Reports "What each warehouse made"; reports/[id] "By warehouse" |
| Bid headroom (max-bid gap) | ProxyBidsPanel "Headroom" (live); Reports "Money left on the table"; reports/[id] "Left on the table" |
| Sell-through / sold vs unsold counts | reports/[id] StatCard "Sell-through" AND Panel "Sell-through" (same page); AuctionResults "Sold" + "Didn't sell (N)" |
| Unsold items + relist | AuctionResults "Didn't sell" panel; /admin/unsold (grouped by auction) — identical rows + RelistControl |
| Today's pickups count / staged progress | Dashboard "Pickups today" card + "Today's schedule" panel; Pickup board TODAY card + rows |
| Late pickups | Dashboard "Late pickups"; Pickup "Late" chips |
| Paid, not booked (waiting) | Dashboard "Paid, waiting to be booked"; Pickup "Not booked yet" People/Items/No location; AuctionResults "No pickup booked"/"No location set" |
| Active transfers | Dashboard "Transfers to move"; Pickup Transfers tab badge + "Active transfers" sub; AuctionResults per-order "N transferring" |
| Gather / picked-up per item | Pickup ApptDetail tick list + per-item "Picked up"; Pickup waiting gather list; AuctionResults per-item Gather / Picked up; Pickup transfers gather list |
| Print 4x6 label | AuctionResults per order; Pickup appointment; Pickup waiting; Pickup transfer (+ batch) |
| New bidders | Dashboard "New bidders · 7d"; Reports>Bidders "New (30 days)" StatCard + "New signups" chart |
| Top spenders leaderboard | Winners>Leaderboards "Top spenders"; Reports>Bidders "Top spenders" |
| Bidder list w/ contact | /admin/bidders; Reports>Bidders list (read-only) |
| Staff role management | /admin/bidders (Make staff/admin, Remove staff); /admin/staff (Members, Remove, Invite) |
| Bidder pickup-location | /admin/bidders "Pickup" select (editable); AuctionResults "Picks up at X" (read-only) |
| Text a customer (MessageSheet) | Pickup waiting; Winners who-owes; Bidders row |
| "Where the money went" donut | Reports Sales; reports/[id] |
| Collected % / kept % progress bars | Winners "Collected NN%"; Reports "Kept per dollar paid NN%"; Reports>Bidders "Have placed a bid NN%" |
| Door code status | Settings>Doors "Codes out"; Pickup DoorCodePanel per appointment |
| Giveaways running | Dashboard "Giveaways running"; /admin/giveaways list |
| Flyer entry point | Auction header "Flyer" button; EditAuction "Social flyer" button |

## B. Controls / settings that look rarely used or redundant (judgement)

| Label | Page | Why |
|---|---|---|
| "Mark Closing Soon" | Auction detail > EditAuction actions | Manual CLOSING state; auctions close on a timer anyway. Only effect is a pill colour. |
| "Un-open (back to draft)" | Auction detail > EditAuction actions | Recovery for a mis-tap of "Open Auction"; 3-sentence confirm. Rare. |
| "Archive" / "Un-archive" | Auction detail header | Comment says it is for "test/junk" auctions. In production this is a one-time cleanup tool living in the primary header. |
| "Delete Auction" danger zone | Auction detail (DRAFT only) | Fine, but a whole red Panel for one button. |
| "Active max bids" / Headroom panel | Auction detail | Analytics curiosity, collapsed by default; owner-only; duplicated in Reports twice. |
| "Recent bids" panel | Auction detail | Nice-to-have feed; defaults open and pushes the Lots list (the actual work) below the fold. |
| "By warehouse" panel on live auctions | Auction detail | Sum of current bids by warehouse during a live auction is not actionable. |
| Comped-wins explainer sentence | Auction detail hero | Explains a reconciliation quirk between two pages; only matters if the owner wins his own lots. |
| Flyer "Image" tab + html2canvas download | Flyer | Second output format; comment says video is what gets used. CDN script + alert fallback. |
| "Reserve" price field | items/new, items/[id] | Liquidation lots start at $2; reserve is almost certainly unused. Still 1 of 3 pricing columns. |
| "Size" field | items/new, items/[id] | Optional free text next to condition; rarely relevant for general merchandise. |
| "Feature"/"Featured" (isPremium) chip | items/new, items/[id] | Marketing flag; different label on the two forms. |
| "Can transfer / Pickup only" chips | items/new, items/[id] | Per-item transfer rule; default true. Edge-case control on every single lot entry. |
| "Staff notes" panel | items/[id] | Separate Panel for one optional textarea, not on the create form. |
| Hidden fields `taxDeductible`, `category`, `donorName` | items/new, items/[id] | Charity-auction leftovers (GiveBid lineage) posted but never shown. |
| Combo lot builder + "Lot size" chips | items/new | Real feature, but adds a second mode to the scanner and a third state to the tag card. |
| "Start fresh" header button | items/new | Reset-the-form button next to the title; "Save + next" already clears. |
| Warehouse scope Segmented in header | Pickup | Useful only with 2+ warehouses; persists to localStorage; hides data silently on other tabs. |
| "Find an item" global search | Pickup | Third search box on the page (plus Coming up, Picked up, Not booked, Completed transfers = 5 search inputs on one route). |
| Per-item "Picked up" button inside gather rows | Pickup (3 places) | Owner-override for stuck items; appears on every row of every list, each with its own confirm. |
| "Reopen — this wasn't picked up", "Undo "loaded"", "Undo — these weren't dropped off" | Pickup | Three separate undo paths; necessary but each is a full-width button w/ long confirm copy. |
| Gather-spot editors (waiting + transfer) vs Stage editor (appointment) | Pickup | Two near-identical "where did you put it" inputs with different vocab ("gather spot" vs "staged spot"). |
| Locations tab: hours, slot length, capacity, blackouts | Pickup | Setup/config, touched a few times a year, inside the daily board. Belongs in Settings. |
| "Leaderboards" tab (4 boards) | Winners | Vanity. "Leading right now — money in the air". |
| "Biggest win ever" card | Winners | Vanity. |
| "Collected NN%" ratio card | Winners | Restates the owed ActionCard as a percentage. |
| "What the tags on each report mean" legend + Scope pill rows x5 | Reports | Meta-explanation of the page's own chips, repeated above every section. |
| "Best auction" callout | Reports | Same as rank #1 in the list directly beneath it. |
| "Cash" report view + own range picker | Reports | Separate view for a subset already summarised in the Sales donut paragraph. |
| "Bidders" report: Active 60d, Stale, Cooling donut, Sort segmented | Reports | 6 StatCards + donut + 7 filters + 4 sorts for a ~hundreds-row list. |
| "Make admin" / "Remove staff" on bidders rows | Bidders | Duplicates Team page; for a 3-person team one place is enough. |
| "Pickup" location select on every bidder row | Bidders | Override for a customer-set preference; rendered on all 200 rows. |
| "Referral history" audit log | Referrals | Collapsed by default; lookup tool. |
| Quick chips +$5/+$10/−$5 + "Reason" | Referrals adjust dialog | Fine but heavy for an occasional correction. |
| "How it works" panels | Promos, Settings>Doors | Permanent onboarding text; once learned they are dead space above the real content. |
| "Owosso Oct 4–11 notice" / "Weekday correction" buttons | Blast | Hardcoded one-off messages (with a street address) from a past move, baked into source. |
| "See names" sample list | Blast | Preview of recipients; fine but optional. |
| Entire Giveaways module (2 pages, wheel, machine, fairness filter, bonus tickets, announce) | Giveaways | ~1,400 lines + 2 animation components for a marketing side-feature. Not daily work. |
| "Switch to wheel/ticket machine" after publish | Giveaways/[id] | Changing draw animation mid-giveaway. |
| "Bonus" tickets (window.prompt) | Giveaways/[id] | Native prompt is blocked in the PWA (per comments elsewhere) so this button does nothing there. |
| "Tax exempt" checkbox | Settings>Payments | Charity-auction leftover; a Michigan liquidator always collects tax. |
| Worked example "$100 winning bid" card | Settings>Payments | Helpful once; permanent. |
| "View site" / "My bids" links in sidebar + drawer | Shell | Two extra nav items for leaving the admin. |
| `RefreshButton.tsx`, `SettingsNav.tsx`, `settings/layout.tsx` | files | Dead / pass-through code. |
| `nav.ts` `blurb` field | nav | Defined per group but never rendered; pages re-type the same sentence as `sub`. |

## C. Typography

Per-file counts of small-size utilities under app/admin (grep of class tokens; zero rows omitted):

| File | text-xs | text-[10px] | text-[11px] | text-sm | text-base |
|---|---|---|---|---|---|
| AdminSidebar.tsx | 1 | 1 | 2 | 1 | 0 |
| MessageSheet.tsx | 0 | 0 | 0 | 2 | 1 |
| MobileNav.tsx | 1 | 1 | 3 | 0 | 0 |
| RefreshButton.tsx | 0 | 0 | 0 | 0 | 1 |
| RelistControl.tsx | 2 | 0 | 1 | 1 | 0 |
| auctions/AuctionsList.tsx | 1 | 0 | 0 | 2 | 0 |
| auctions/[auctionId]/ArchiveButton.tsx | 2 | 0 | 0 | 1 | 0 |
| auctions/[auctionId]/AuctionResults.tsx | 10 | 0 | 5 | 4 | 2 |
| auctions/[auctionId]/DeleteAuctionButton.tsx | 0 | 0 | 0 | 1 | 1 |
| auctions/[auctionId]/EditAuction.tsx | 0 | 0 | 0 | 5 | 0 |
| auctions/[auctionId]/ProxyBidsPanel.tsx | 0 | 3 | 0 | 5 | 1 |
| auctions/[auctionId]/RecentBidsPanel.tsx | 0 | 0 | 0 | 0 | 1 |
| auctions/[auctionId]/flyer/DownloadFlyerButton.tsx | 0 | 0 | 0 | 0 | 1 |
| auctions/[auctionId]/flyer/FlyerMotion.tsx | 0 | 0 | 0 | 2 | 0 |
| auctions/[auctionId]/flyer/FlyerStudio.tsx | 1 | 0 | 0 | 2 | 3 |
| auctions/[auctionId]/flyer/page.tsx | 0 | 0 | 0 | 0 | 2 |
| auctions/[auctionId]/page.tsx | 0 | 0 | 0 | 8 | 1 |
| auctions/new/page.tsx | 0 | 0 | 0 | 6 | 0 |
| bidders/page.tsx | 0 | 0 | 0 | 1 | 1 |
| blast/page.tsx | 3 | 0 | 0 | 3 | 0 |
| dashboard/page.tsx | 0 | 0 | 0 | 5 | 0 |
| giveaways/[id]/SpinWheel.tsx | 2 | 0 | 3 | 3 | 1 |
| giveaways/[id]/TicketMachine.tsx | 3 | 0 | 3 | 3 | 2 |
| giveaways/[id]/page.tsx | 6 | 0 | 2 | 11 | 0 |
| giveaways/page.tsx | 0 | 0 | 6 | 2 | 0 |
| items/[itemId]/page.tsx | 2 | 0 | 1 | 7 | 13 |
| items/new/page.tsx | 8 | 0 | 2 | 10 | 10 |
| pickup/DoorCodePanel.tsx | 1 | 0 | 0 | 1 | 0 |
| pickup/page.tsx | 4 | 3 | 3 | 36 | 37 |
| promos/page.tsx | 1 | 0 | 0 | 6 | 0 |
| referrals/page.tsx | 0 | 0 | 0 | 1 | 5 |
| reports/BidderReportView.tsx | 2 | 0 | 0 | 4 | 1 |
| reports/CashReportView.tsx | 1 | 0 | 2 | 2 | 2 |
| reports/Charts.tsx | 0 | 0 | 0 | 3 | 0 |
| reports/[auctionId]/page.tsx | 0 | 0 | 0 | 3 | 7 |
| reports/page.tsx | 1 | 0 | 1 | 14 | 6 |
| settings/doors/page.tsx | 2 | 0 | 0 | 3 | 0 |
| settings/payments/page.tsx | 0 | 0 | 0 | 5 | 7 |
| staff/page.tsx | 0 | 0 | 0 | 4 | 2 |
| ui.tsx | 0 | 0 | 5 | 12 | 2 |
| unsold/UnsoldList.tsx | 1 | 0 | 0 | 1 | 1 |
| winners/page.tsx | 0 | 0 | 0 | 6 | 0 |
| **TOTAL** | **55** | **8** | **39** | **186** | **111** |

Other odd sizes: `text-[9px]` x1 (items/new "Main" badge), `text-[13px]` x5 (sidebar/drawer page links), `text-[15px]` x3 (group links).

Base sizes in `ui.tsx` components:
- **PageHeader**: eyebrow `text-[11px]` font-black uppercase tracking-[0.18em]; h1 `text-2xl sm:text-3xl`; sub `text-sm`; back link `text-sm`.
- **SectionTabs**: `text-sm` font-bold.
- **Pill**: `text-[11px]` font-black uppercase.
- **Eyebrow**: `text-[11px]` font-black uppercase tracking-[0.16em].
- **StatCard**: label `text-[11px]` uppercase; value `text-3xl`; sub `text-sm`.
- **Panel**: title `text-lg` font-black; sub `text-sm`.
- **Btn / BtnLink**: md = `text-base`, min-h 48px; sm = `text-sm`, min-h 40px.
- **Input / SearchBox**: no explicit size (inherits body, 16px); min-h 46px.
- **Segmented**: `text-sm` font-bold; count badge `text-[11px]`.
- **Empty**: text `text-lg`; sub `text-sm`.
- **Row**: title inherits (no size = base); sub `text-sm`.
- **ActionCard**: count `text-4xl`; label base; sub `text-sm`.
- **Notice**: `text-sm` font-semibold.
- **Money**: inherits.

Net: the kit's secondary text defaults to `text-sm` (14px) and labels to 11px uppercase; pages then add ~100 more
`text-xs`/`[10px]`/`[11px]` instances on top. Pickup page alone has 36 `text-sm` and 37 `text-base` — it is mixing both
on sibling elements throughout.

## D. "AI slop" tells (decorative blurbs, redundant helper copy, how-it-works, empty-state fluff)

Sub-title blurbs under page titles (every page has one; most restate the title or the nav blurb):
- dashboard: "A few things need you." / "Nothing's on fire. Nice."
- auctions: "Build, run and close auctions." (= nav blurb)
- auctions/new: "Name it, set when it runs, then add lots."
- items/new: "Scan it, tag it, save it. Next." / "Goes straight into this auction."
- pickup: "Appointments, transfers, warehouses." (= nav blurb)
- unsold: "Everything that didn't sell. Relist an item straight into another auction, or save it to drafts for later."
- winners: "$X still to collect." / "Everyone's paid up."
- reports: "What you made, and where it went." / "Who's bidding, who's gone quiet." / "Cash taken in person."
- bidders: "Block someone, or make them staff."
- referrals: "Bid Bucks — who's earned credit, and what you owe."
- promos: "The link behind a QR code: scan, sign up, get Bid Bucks. One claim per person — account and phone number both count."
- staff: "Who can get into the Workshop."
- blast: "One text to a slice of your bidders. Goes out through the same line as the auction-live texts."
- giveaways: "Free prizes that grow the crowd." (= nav blurb)
- settings/payments: "Payments and business setup."; settings/doors: "Doors: customers let themselves in with a one-day code."

Panel sub-lines that just restate the title:
- auctions/new Panel "Set it up" / "Shown to bidders on the auction page."
- EditAuction "Open it, announce it, change the name or times."
- ProxyBidsPanel "Private to staff"; RecentBids "Last N across every lot"
- AuctionResults "Who won what, who's paid, who's collected."; "Relist straight into another auction."
- Pickup "Not booked yet" / "Paid winners without a pickup slot"; "Coming up" / "N booked beyond today"
- Reports "Where the money went" / "Everything buyers paid you, and who ended up with it."
- Reports>Cash "Who paid cash" / "Tap a name for the items."
- Blast "Who" / "Pick the crowd first — the count updates as you go."; "Message" / "Keep it short — one text per person is cheapest."
- Giveaways "Set up a giveaway" / "Title, how people get in, when it runs, how you draw."; "Prizes (N)" / "Each prize = one winner."
- Staff "Invite someone" / "They get a one-time link that expires in 7 days." (+ repeated below as "Expires in 7 days. One-time use.")
- Settings>Payments "Fees & sales tax" / "What gets added on top of every winning bid."

Explanatory paragraphs (helper sentences under controls):
- auctions/new: "It opens and closes on its own at these times. Nothing is texted to bidders when it opens — you send that yourself…"
- EditAuction: "The auction opens and closes automatically at these times. To end it early, set the close time to now."
- Auction detail timeline: "This auction will go live automatically at its start time." / "…will go live in a moment."
- Auction hero: "Winning bids only — before premium & tax." + comped sentence.
- ProxyBidsPanel: two paragraphs about "secretly pay" and "You capture it only if another bidder competes before close."
- items/[id] Danger zone: two helper sentences under two buttons; "Careful — people are bidding on this".
- Pickup stage editor: "The customer sees this on their pickup screen. It clears itself once collected."
- Pickup TODAY card: "Everything's boxed and labeled. You're ready for the day."; "Everything's gathered — stage it below."
- Pickup transfer gathered banner: "Set aside for the team. Load & drop off on transfer day."
- Pickup blackout: "Bidders can't schedule pickups on blocked days. Leave "To" empty to block a single day."
- Reports: MoneyBar paragraph ("The green slice is what's actually yours — tax was never your money…"); headroom intro + text-xs
  diagnosis sentence; footer definition paragraph; "What the tags on each report mean" Panel; Scope pill rows above 5 sections.
- Reports>Bidders: "Chasing the stale and never-bid groups is where re-engagement lives."
- Reports>Cash: footer paragraph on how cash is counted.
- reports/[id]: "Sales tax" sub + paragraph; headroom paragraph; "Collected from buyers and passed to the state — never counted…"
- Winners: "N people owe you — card declined or pending"; "Winning live items — money in the air".
- Settings>Payments: helper under both inputs, checkbox helper, worked-example card, footer.
- Giveaways: ~8 helper sentences in the setup wizard; "Either way it's one account per phone number — duplicate sign-ups never get a
  second ticket."; manage page Tickets panel mode sentence; "Entries are still open — tickets keep stacking…"; fair-play box.
- Flyer: "Post it in 3 steps" box + "A screen recording is a clean MP4 that uploads perfectly…" + "Tap play, start your phone's screen
  recorder when the countdown hits GO…" + "Top items with live prices, 1080×1080. Download, or screenshot below."

"How it works" / step-list panels:
- promos/page.tsx Panel "How it works" (4 steps, always visible, above the list).
- settings/doors/page.tsx Panel "How it works" (5 steps, bottom).
- flyer FlyerStudio "Post it in 3 steps".
- Reports "What the tags on each report mean".
- settings/payments comment notes an old "How it works" card was removed and replaced by the worked example (same function).

Empty-state fluff (text / sub pairs):
- "Nothing live right now." / "Open an auction and the board lights up."
- "Nothing upcoming." / "Drafts and scheduled auctions land here."
- "No closed auctions yet." / "Once an auction ends it moves here."
- "No auctions yet." / "Create your first one and start adding lots."
- "No bids on this auction yet." / "They show up here the moment they land."
- "No active max bids right now." / "When a bidder sets a maximum, it appears here."
- "No lots yet" / "Add lots to this auction so bidders can start bidding."
- "Nothing sold in this auction." / "Unsold lots are listed below so you can relist them."
- "Nothing unsold right now." / "Every lot found a buyer."
- "No upcoming appointments yet." / "Winners book their own slot once they've paid."
- "Nobody's waiting." / "Everyone with won items has booked a pickup."
- "No transfers waiting." / "When a bidder asks for their items to be moved to another location, it shows up here."
- "No pickup locations yet." / "Add one above and set its weekly hours."
- "Nothing here yet." / "Leaders show up once people win and bid."
- "No wins yet." / "Wins land here as auctions close."
- "No sales in this period." / "Widen the range or wait for the next auction to close."
- "No cash payments in this period." / "Mark a balance paid in cash from Winners & payments and it lands here."
- "No balances yet." / "Balances appear once someone earns or spends Bid Bucks."
- "No referrals yet." / "Every invite someone sends shows up here."
- "No welcome codes yet." / "Make one, print the QR, hand it out."
- "No members yet." / "Invite someone to get started."
- "No giveaways yet." / "Create one to get started."
- "No locks linked yet." / "Step 1: link the Schlage Home account… Step 2: tap Find my locks."
- "That auction doesn't exist." / "It may have been deleted."; "That auction isn't here." / "…or belongs to another organization."

Other tells:
- Greeting title "Good morning." + "Nothing's on fire. Nice." on the dashboard.
- Vanity cards: "Biggest win ever", "Best auction", "Leading right now — money in the air".
- `Scope` chip rows (✓ Premium ✗ Tax ✗ Your wins) rendered 5 times on one page plus a legend panel.
- Hardcoded one-off SMS templates with a street address in blast/page.tsx source.
- Comments in source that narrate design decisions at length (e.g. 8-line comment on ProxyBidsPanel, "Why a fixed overlay…" in FlyerMotion).

## E. Auction creation and lot entry flows

### Auction creation (app/admin/auctions/new/page.tsx)
- Fields: **Name** (free text Input, required), **Description** (optional textarea), **Opens** (datetime-local), **Closes** (datetime-local).
- Title entry: typed by hand every time. Placeholder suggests "Weekly Overstock — Sept 12". There is **no auto-naming**, no
  "last auction + 1 week" default, no template, no location in the name. Slug is generated server-side (`auction.slug` is used by
  the "View" link) but the admin never sees or controls it.
- Date defaults: tomorrow 09:00 local, closes +7 days. The datetime-local inputs are interpreted in the admin's browser timezone
  (not forced to America/Detroit like the pickup page does).
- Live "Runs for N days" summary card.
- On save: POST /api/auctions then redirect to the manage page. From there "Add a lot" -> /admin/items/new?auctionId=.
- Requires a prior `/api/me` fetch to obtain orgId; errors "Business not loaded — pull down to refresh." if it hasn't arrived.
- Edit path (EditAuction) duplicates the same four fields with slightly different labels ("Auction name", "Opens at", "Closes at").

### Lot entry (app/admin/items/new/page.tsx, 1,201 lines)
Steps a staffer walks through per lot, top to bottom:
1. Read the auto-minted tag # from the dark card (fetched from `/api/admin/next-item-code` on mount and after every save) and write
   it on the item. Optional: toggle "Combo" and pick lot size.
2. Scan barcode (camera via native BarcodeDetector or ZXing fallback) or type UPC/FNSKU/ASIN + "Go". Lookup chain:
   FNSKU/ASIN -> `/api/admin/asin-lookup`; UPC -> `/api/admin/barcode-lookup` -> on miss, Amazon name search `/api/admin/amazon-search`.
   On hit the form auto-fills title, description (trimmed to 3 sentences), retail value, and imports ALL product images through
   `/api/admin/import-image` one by one (parallel) behind a fullscreen "Filling the form…" overlay. Scanner collapses to
   "Scan another barcode".
   Fallback: "Can't scan it? Search by name" -> pick a result -> second asin-lookup -> fill.
3. Details Panel: title (auto-grow textarea), Condition chip (default NEW), Size, Feature chip, Description.
4. Pricing Panel: Retail (filled by scan), Start (default $2), Reserve.
5. Location Panel: Warehouse select (required — validation message "Pick a warehouse — step 5."), Shelf/spot text + reuse chips
   (fetched from `/api/admin/items/spots` whenever warehouse/auction changes), Can transfer / Pickup only, auction select
   (hidden if ?auctionId).
6. Photos Panel: thumb strip; tap to make main; "+" to upload (each file = POST /api/upload for a signed URL then PUT to R2, sequential).
7. Sticky footer "Save + next" (keeps condition, warehouse, spot, auction; clears the rest; re-mints code; remounts scanner;
   scrolls to top) or "Save & done" (redirects to the auction or /admin/auctions).

Slow / repetitive points observed:
- Four network round-trips before the form is usable: `/api/me`, `/api/auctions`, `/api/admin/pickup/locations`, `/api/admin/next-item-code`
  (+ `/api/admin/items/spots` when a warehouse is set). Same trio of fetches is repeated on items/[itemId] and (two of them) on auctions/new.
- Every scan imports every product image (up to 10) through the proxy before the overlay lifts; the user waits on the slowest image.
- Photo upload is sequential per file (signed-URL request + PUT each), with no progress indicator beyond "…".
- Warehouse is required on every lot but is not remembered across page loads — only across "Save + next" within one session.
  No "default warehouse" setting exists.
- Auction must be chosen per lot unless the page is entered from the auction ("Add a lot" button). From the nav tab "Add a lot" it
  defaults to "Save as draft", which silently creates orphan draft items.
- Condition / Size / Feature / Reserve / Transfer / Combo are all shown on every entry even though for a $2-start liquidation lot
  most of them are left at defaults.
- Title is the scanned Amazon title verbatim (often 100+ chars with marketing suffixes); the only cleanup is description sentence trimming.
- The tag code is shown twice (dark card + overlay) and the "Last saved #X" line is the only confirmation after save.
- Edit form (items/[itemId]) is a different layout (2-col, 6 panels, different labels, native alert()s), so staff learn two forms.

## F. The 3 biggest structural problems

1. **Fulfillment is implemented three times.** The same gather / stage / label / picked-up / text-the-customer workflow exists on
   (a) /admin/pickup (appointments, waiting list, transfers — 2,479 lines, ~40 state hooks, 5 search boxes, 3 tabs),
   (b) the ended-auction view `AuctionResults.tsx` (659 lines: per-order gather, label, picked-up, forfeit, location buckets), and
   (c) /admin/unsold vs AuctionResults "Didn't sell" (identical relist list). Each copy has its own state, confirm modals, and
   slightly different vocabulary ("gather spot" vs "staged spot", "Picked up" vs "Order picked up" vs "Mark whole order picked up").
   There is no single "this customer's order" screen; staff bounce between the auction page and the board for the same person.

2. **Reporting/analytics has sprawled into 5 surfaces for a 3-person shop.** Dashboard pulse strip, Winners (stats + ratio + biggest win
   + 4 leaderboards), Reports>Sales (hero, 4 cards, best auction, auction ranks, warehouse ranks, donut, headroom, owed, legend),
   Reports>Bidders (hero, 6 cards, donut, trend, top spenders, 7-way filter, 4-way sort, full bidder list), Reports>Cash, plus
   reports/[auctionId] which repeats sell-through twice on one page and the donut from the parent. Money owed is shown in five
   places but is only actionable in one (Winners). Headroom is shown in three. Nothing here is daily work beyond "how did the
   week go" and "who hasn't paid", which could be two numbers on the dashboard.

3. **The information architecture mixes daily work with setup and side-features at the same level, and the people/staff model is
   split.** Warehouses, hours, slot capacity and blackouts (pure configuration) live in a tab of the daily Pickup board, while
   Settings holds only Payments and Doors. Staff roles can be changed on both /admin/bidders and /admin/staff. Giveaways (~1,400
   lines), Welcome codes, Referrals, Blast, and the Flyer studio (~800 lines) are full top-level modules alongside Auctions and
   Pickup, each with its own how-it-works copy, and the auction detail page itself is ~2,000 lines because it carries editing,
   analytics (max-bids, recent bids, by-warehouse), lifecycle buttons, flyer links, archive/delete, AND the fulfillment board.
   `nav.ts` even defines a `blurb` per group that nothing renders, while every page re-types the same sentence by hand.

Secondary issues worth noting while condensing: `RefreshButton.tsx` and `SettingsNav.tsx`/`settings/layout.tsx` are dead;
`items/[itemId]` still uses native `alert()` x9 and giveaways uses `window.prompt` (both blocked in the installed PWA per the
codebase's own comments); 4 local copies of `money()/money0()` exist alongside `format.ts`; `BUSINESS_LOGO_URL` is duplicated
in layout.tsx and flyer/page.tsx; blast/page.tsx ships hardcoded one-off SMS copy with a street address.
