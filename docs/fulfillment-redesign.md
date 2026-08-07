# Fulfillment Redesign — Gather / Stage / Pickup / Transfer

Goal: make the whole "where is a customer's stuff and what are we doing with it"
flow obvious, hard to mess up, and mostly automatic — while treating the live
money/SMS paths as untouchable (Rule #1).

---

## Why it feels confusing today (grounded in the code)

1. **Silent auto-attach.** When items are paid, or when a transfer arrives, the
   system automatically folds them into the soonest appointment and into gather
   bundles (`autoAttachPaidItems` → `attachToUpcomingAppointment`,
   `attachToPendingTransfers` in `lib/pickup.ts`). Staff never decide. This is why
   a gathered Owosso order suddenly "contains" a transfer that just arrived.

2. **Transfer arrival keeps stale state.** On drop-off (`/api/admin/pickup/transfers/[id]`
   → COMPLETED) the item's warehouse is updated but `grabbedAt` and `gatherSpot`
   are NOT cleared, and it's auto-attached to an appointment. A just-unloaded item
   — whose real shelf at the NEW warehouse is unknown — looks gathered + assigned.

3. **"Gathered" (a staff checklist) is conflated with "assigned to an order."**
   They're different things and the UI blurs them.

4. **State is scattered** across `grabbedAt`, `gatherSpot`, `stagedSpot`,
   `pickupAppointmentId`, `transferRequestId`, `locationId` with implicit rules, and
   there's no single screen that says "here's this customer, here's every item,
   here's where it is and what's next."

What already works well and we keep: items pool per-customer across auctions
(good); auto-transfer to the preferred warehouse at auction close (good); the
charge-at-close + refund + SMS flows (leave alone).

---

## The mental model we want

Per customer (across ALL auctions), every item has three explicit, visible facts:

- **WHERE** — which warehouse, or "in transit."
- **PLACED?** — does it have a known shelf/gather spot here, or did it just arrive
  and still needs to be put somewhere ("needs placing").
- **PLAN** — Waiting (undecided) · In a gather bundle · On an appointment · Staged ·
  Picked up.

Staff drive the PLAN by **selecting items and choosing an action**. Automation only
does the safe, obvious move (sweep to preferred warehouse at close). Everything that
groups a customer's things for a human hand-off becomes a deliberate click.

---

## Core changes

1. **A "Decide" inbox (per customer).** Newly-paid items and freshly-arrived
   transfer items land here — NOT auto-attached to anything. Staff see them and act.

2. **Manual select-and-assign.** Checkboxes on items → bulk actions: *Add to this
   appointment · Start/append a gather bundle · Stage · Send transfer · Mark placed
   (set shelf).* No more silent auto-attach.

3. **Transfer arrival resets physical state.** On drop-off: clear `grabbedAt`,
   `gatherSpot`, and shelf for the moved items, flag them "needs placing," and drop
   them in the Decide inbox at the new warehouse. Never auto-merge into a gathered
   order or an appointment.

4. **One Fulfillment workspace** (off-theme, dense, table-like — Rule #3). A row per
   customer, expandable to per-item state chips, multi-select, bulk actions, and
   **issue flags** surfaced instead of silently auto-fixed:
   - "arrived — needs placing"
   - "items at 2 warehouses"
   - "appointment has unplaced/incomplete items"
   - "in transit"
   - "waiting 2+ auctions"

5. **Automation guardrails.** Keep auto-transfer-to-preferred at close. Everything
   else that used to auto-attach now raises a flag for a human instead.

### Automatic vs manual, after redesign
- **Stays automatic:** SOLD→PENDING_PICKUP on payment; auto-transfer to preferred
  warehouse at close; all SMS; refunds cleanup.
- **Becomes manual (human approval):** attaching items to an appointment; folding
  arrived items into a bundle; staging.

---

## Data changes (additive + safe only)

- Add one nullable Item flag (e.g. `needsPlacement Boolean @default(false)` or a
  `placedAt DateTime?`). Set true when an item arrives via transfer or is newly paid
  and unplaced; cleared when staff set a shelf/gather spot. Drives the Decide inbox.
- Keep `grabbedAt` / `gatherSpot` / appointment+transfer links — change only WHO
  sets them (manual) and reset them on transfer arrival.
- **No drops, no renames, no destructive migrations.** New column is additive and
  backfills to a safe default.

---

## Phased rollout — designed so nothing live breaks

**Phase 0 — See it clearly (zero behavior change).**
Build the new read-only Fulfillment workspace next to the current pickup page, from
the same data. Verify it matches reality on the live floor. Ship. No writes changed.

**Phase 1 — Two contained, reversible fixes.**
(a) On transfer drop-off: clear gathered/shelf/gather-spot for moved items + flag
"needs placing"; stop the auto-attach-to-appointment on arrival.
(b) Add the Decide inbox + a manual "Add to appointment" action.
This removes the wrong auto-merge and the surprise auto-appointment. The money/charge
path is untouched (items still go PENDING_PICKUP exactly as now).

**Phase 2 — Full workspace actions.**
Multi-select bulk actions, issue flags, staging rework, "mark placed / set shelf."

**Phase 3 — Retire the old pickup page** once the new one is proven on the floor.

Each phase: same URLs, additive schema, all concurrency locks kept, every money/SMS
trigger left intact, and shippable independently. We can pause after any phase.

---

## Rule #1 guardrails (explicit)

- No changes in Phase 0/1 to: `closeAuction` charging, Bid Bucks/credit,
  `soldLocationId` (commission), refund cleanup, or the GHL SMS triggers.
- Additive schema only; no column drops/renames; safe default backfill.
- Keep every advisory lock / atomic status claim.
- Ship read-only first; flip each behavior change one at a time, each reversible.
