# Admin condense brief — the rules every admin page follows

Who uses this: a 3-person liquidation shop (Dakota + 2 staff), on phones in a
warehouse and on a laptop at a desk. Daily work, in order of how often it happens:

1. List lots into an auction (scan, tag, photo, price, save, next).
2. Run auctions: open, send the live text, watch it close, relist what didn't sell.
3. Pickup: gather, stage in a spot, print a label, hand over / let them in.
4. Chase money: who hasn't paid, retry the card, text them.
5. Glance at how the week went.

Everything else (giveaways, welcome codes, Bid Bucks, team, locations, doors,
payments setup) is occasional. It stays, but it steps aside.

## Hard rules

1. **Nothing smaller than 13px.** No `text-xs`, `text-[9px]`, `text-[10px]`, `text-[11px]`, `text-[12px]`.
   Body copy is 17px (inherited from the admin layout; don't set `text-base`/`text-sm` on body text).
   Secondary text is `text-[15px]`. Labels, eyebrows and pills are `text-[13px]` uppercase.
   Replace every `text-sm` → `text-[15px]` and every `text-xs`/`[10px]`/`[11px]` → `text-[13px]`.
   Numbers you read across a room (door codes, tag numbers, money owed) go big: 3xl–6xl.
2. **One number, one home.** A metric lives on ONE page. If it's actionable it lives
   where the action is. Sales totals live in Reports only (Today shows one "Sold this
   week" that links there). Money owed lives on Payments; Today shows the count and links.
   Delete every other copy.
3. **No decorative copy.** No page sub-blurbs that restate the title. No "How it works"
   panels. No helper sentences under a control unless the control is ambiguous without it
   (and then one short line). No greeting lines, no "Nice.", no vanity cards ("Biggest win
   ever", leaderboards, "Best auction"). Empty states are ONE line, optionally one button.
   `PageHeader` `sub` is allowed only when it carries live data (e.g. "$412 still to collect").
4. **Hide the uncommon, don't delete it.** Rare controls (archive, un-open, reserve price,
   size, transfer rule, staff notes, blackout dates…) go behind a single "More" disclosure
   or a collapsed panel, closed by default. Daily controls are always visible and reachable
   in one tap.
5. **Same words everywhere.** Spot (not "staged spot"/"gather spot"/"shelf" when it means
   the same thing). Lot. Auction. Pickup. Picked up. Paid / Unpaid. Open / Closed.
   Warehouse. Labels on the create form and the edit form must match exactly.
6. **No native `alert()` / `confirm()` / `prompt()`.** They are blocked in the installed
   PWA. Use the in-page confirm modal pattern already in the file or an inline Notice.
7. **No emojis and no glyph icons** (no ✓ ✕ ✔ ★ → ← • as icons). Use the SVG icons in
   `app/components/BidIcons.tsx` or the kit components. Plain "·" as a text separator is fine.
8. **Kit first.** Use `app/admin/ui.tsx` (PageHeader, PageBody, Panel, Row, Btn, Pill,
   Eyebrow, StatCard, Segmented, SearchBox, Notice, Empty, ActionCard, Progress, Initials,
   Money). Don't hand-roll a card that the kit has. Don't add new font sizes.
9. **Phone first.** Buttons full-width on phones where there's one primary action; 44px+
   targets; nothing hidden behind hover. A page should fit its daily job on one phone
   screen without scrolling past things that don't matter.
10. **Don't break behaviour.** Every API call, confirm and state transition that exists
    today keeps working. You are removing display, not features. If you remove a page,
    leave a redirect. Keep `export const dynamic`, Pusher refreshes, role guards.
11. Typecheck: `npx tsc --noEmit -p .` — ignore ONLY errors about Prisma fields added
    this session (`doorLock`, `doorCode*`, `doorLocks`), the client can't be regenerated
    in this sandbox. Lint your files with `npx eslint <files>`; pre-existing
    `react-hooks/set-state-in-effect` / `purity` errors in pickup/page.tsx and
    app/pickup/page.tsx are known and not yours.

## Navigation (already done in nav.ts — don't change)

Today · Auctions (Auctions, Unsold) · Pickup · Money (Payments, Reports) ·
Bidders (Bidders, Text a group) · Grow (Giveaways, Welcome codes, Bid Bucks) ·
Settings (Locations, Payments, Doors, Team). "New auction" and "Add a lot" are
buttons, not tabs. Phone bottom tabs: Today, Auctions, Pickup, Money, More.

## Page-by-page targets

**Today** (`dashboard/page.tsx`): date eyebrow + "Today" title (no greeting). Two
buttons: Add a lot, New auction. Then ONLY action cards that are non-zero: Money not
collected ($ + people → Payments), Pickups today (N, staged x/N → Pickup), Late pickups,
Paid but not booked, Transfers to move. Then "Live now" rows (title, time left, bid so far,
progress) and "On deck" (next 3 drafts). One quiet stat: "Sold this week $X" → Reports.
Delete: bids today, new bidders, giveaways running, the schedule list (the board has it).

**Auctions list**: Segmented Live / Upcoming / Closed. Archived auctions appear inside
Closed with a muted pill — no fourth segment. Card = title, status pill, lots, bids, $ so far,
progress (live). Drop the date-range line unless upcoming.

**New auction**: auto-named. Learn series from existing titles that match
`^([A-Za-z][A-Za-z0-9&' ]{0,24}?)\s*#?\s*(\d+)$` (e.g. "AMZ 12", "HD 3", "Estate 7").
Show the series as chips with the next number pre-filled ("AMZ 13"); typing a new series
starts at 1; free-text override allowed. Opens/closes default to the LAST auction's
schedule shifted forward one week (fall back to tomorrow 9am → +7d). One "Create" button.
Remove description field from the create form (editable later under More).

**Auction page**: header = title, status pill, time left/closes. Primary actions always
visible as big buttons: Open now (draft) / Send live text (live, once) / Add a lot / View /
Flyer. Then the LOTS list (this is the work) with search when >10. Then a collapsed
"Details" (name, times, description) and a collapsed "More" (archive, un-open, mark closing
soon, delete draft). Delete the By-warehouse panel, the Active max bids panel, and the hero
helper sentences; the hero number stays. Recent bids → a collapsed "Activity" panel.
Ended auctions: the results list stays (who won, paid?, picked up?) but gather/stage/
label/picked-up actions are REMOVED from here — they live on Pickup. Each order row links
to the customer on the Pickup board. Keep Forfeit (under the order's More). "Didn't sell"
panel becomes one line: "12 lots didn't sell" → /admin/unsold?auction=ID.

**Unsold** (`/admin/unsold`): one page, grouped by auction, with a top bar: "Relist all
into [next auction ▾]" per group, plus per-lot relist. Query `?auction=` pre-expands that group.

**Add a lot** (`items/new`): visible = tag card, scanner, Title, Condition chips, Retail,
Start, Warehouse (remembered in localStorage per device), Spot (+ recent chips), Photos,
Save+next / Save & done. Behind a "More" disclosure: Size, Reserve, Featured, Transfer
rule, Description, Combo. Auto-clean scanned titles: cut at " - ", " | ", " (", or "," after
60 chars; collapse whitespace; max 90 chars. Show upload progress "2 of 5". Remove "Start
fresh". If no `?auctionId`, the auction select defaults to the soonest upcoming/draft auction,
not "Save as draft".

**Edit lot** (`items/[itemId]`): same sections, same order, same labels as Add a lot
(Photos first is fine). Staff notes and Danger zone go under More. Replace all 9 `alert()`s.

**Pickup board**: tabs Today · Coming up · Waiting · Transfers (Locations tab REMOVED,
moved to Settings → Locations). ONE search box at the top that filters whichever tab is
open. Remove the three mini-stats on Waiting. Appointment card: time, name, phone, N items,
spot or Stage button, door code (if any), expand → items with gather ticks, actions:
Stage, Print label, Picked up, More (reschedule, cancel, partial pickup per item, reopen).
Transfers: same shape. "Picked up" and "Completed" lists collapsed with search.
Keep every endpoint call. Big text: time, name, spot.

**Payments** (`winners`): header sub = "$X still to collect" (live data). "Who owes"
list first (name, items, $, Retry charge, Text, Mark paid cash under More). Then Wins list
with Segmented All/Unpaid/Paid + search. Delete: Total won / Winners / Collected % cards,
Biggest win, Leaderboards tab.

**Reports**: ONE view, no Bidders/Cash views (delete those components; keep their API routes).
Range Segmented Week/30d/90d/Year/All. Hero "You made $X" + one line "N lots · M auctions ·
$avg". Three StatCards: Buyers paid, Sales tax held, Cash taken. Then "By auction" list
(rank, title, $net, lots → per-auction report). Then "By warehouse" (name, $, bar). Delete:
donut, headroom, best auction, scope pills, legend panel, footer paragraph, owed list (lives
on Payments). Per-auction report: hero + Hammer / Premium / Stripe fee / Tax / Sell-through
StatCards + By warehouse + "Still owed → Payments" link. Delete the second sell-through
panel, donut, headroom.

**Bidders**: search + Segmented Everyone/Blocked. Row = Initials, name, phone · email,
pills. Tap → expand: Text, Block/Unblock, Pickup location select. Remove Make staff/admin/
Remove staff (Team owns roles). Remove the "Showing 200" notice (make it the search
placeholder hint).

**Text a group**: keep. Delete the two hardcoded Owosso templates. Panel subs removed.

**Giveaways / Welcome codes / Bid Bucks**: keep features; strip blurbs, How-it-works
panels, helper sentences, text-xs; move rare actions (switch draw style, bonus tickets —
replace window.prompt with an inline input) under More.

**Settings → Locations** (NEW `settings/locations/page.tsx`): the old Pickup "Locations"
tab moved here verbatim in function: add location, edit name/address/instructions,
weekly hours, slot length/capacity, blackouts, hide/show, delete. Same API routes.
**Settings → Payments**: status line + Buyer's premium + Sales tax + Save. Tax exempt and
the worked example go under More. **Settings → Doors**: delete the How-it-works panel;
the three mini-stats become one line. **Team** (`/admin/staff`): unchanged in function.

## Time-savers to add (small, high value)

- Auction auto-naming + schedule carry-forward (above).
- "Relist all into next auction" on Unsold.
- Remembered warehouse on Add a lot.
- Scanned-title cleanup.
- Pickup: typing just a number in the Spot box becomes "Box N"? No — keep free text,
  but the Spot input remembers the last prefix used ("Box", "Shelf") and offers it as a chip.
- Today: every action card deep-links to the exact tab/filter it describes.
