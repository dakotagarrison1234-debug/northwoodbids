# Giveaways — how it works (v2, Sept 2026)

## The three entry modes
| Mode | Who holds a ticket | Card CTA |
|---|---|---|
| **Everyone's in** (AUTO) | every registered bidder, 1 ticket | "You're automatically in" |
| **Tap to enter** (CLICK) | anyone who taps (optionally answers a question: any answer, or the correct one) | "Take a ticket" |
| **Every bid = a ticket** (BID) | every bid placed on any auction while the window is open, win or lose — tickets stack. Optional: minimum bid amount, max tickets per person | "Go bid" |

Bonus tickets can be handed to anyone from the manage page (search → Bonus). Removing someone pulls all their tickets. One prize per person per giveaway.

## The window
`Opens` (optional) → `Closes` (required for bid giveaways). Tickets only count inside the window. When it closes the giveaway flips to **Ended — pulling winners soon** on its own (checked on every page load, no cron) and entries stop. "End now" closes it early; "Change close time" extends it; an ended one with no winners pulled can be reopened with a new close time.

Phases: Draft → Scheduled (published, opens later) → Live → Ended (waiting to pull) → Complete.

## Two draw styles
- **Prize wheel** — every name on a wedge. Use when everyone holds one ticket and the pool is small.
- **Ticket machine** — the brass drum clip; claw pulls a ticket, the winner's name fades onto it. Use for weighted (bid) pools or big crowds. Switchable any time before the last prize is pulled.

Both: the server picks the winner (weighted — 14 tickets = 14 chances) the moment you tap Spin / Pull, the show plays, the winner card pops. **Done** awards the prize (it lands in their orders + pickups like an auction win, $0, comped). The small X in the corner of the winner card quietly discards and draws again (nothing on that screen says so — it's the screen you record). **Undo win** on the winners list reverses an award.

## Video asset
Save the machine clip to `public/giveaway/ticket-machine.mp4` (download from the Higgsfield link in the chat). Until it's there the component falls back to the CDN copy. If you regenerate the clip, keep the ticket held still on the final frame — the name overlay is positioned for that; adjust `REVEAL_AT` in `app/admin/giveaways/[id]/TicketMachine.tsx` if the claw timing changes.

## Public surfaces
- Home: up to two giveaways under the hero (live first, then ended-waiting, then scheduled).
- `/giveaways`: everything incl. just-finished ones with winners + a winners wall (first name + last initial). Linked from the account menu and footer.
- Dashboard: prizes show under past wins as "Giveaway: …", Free.

## Deploy
`npx prisma db push` (new enum values + columns, all additive) → commit → push.

## Fair-play guarantees (what's enforced in code)
- Ticket bar: registered bidder = phone + email on the account, not blocked. Per giveaway you can tighten it to "card on file only" (the bidding bar). One account per phone number (the oldest one holds the tickets; a re-registered number is flagged "duplicate"). Same filter feeds the draw, the customer's "You hold N tickets", the card's total, and the admin counts — one function, no drift.
- Bid tickets = bids the person placed (hand bids + setting a max bid), inside the window only, cancelled bids excluded; auto-bids fired for them don't stack. Tickets freeze at the close time even if the close is processed later.
- Tap-to-enter: one row per person (unique), re-taps don't stack, removed people can't sneak back, wrong-answer guessing is rate-limited.
- Draw: server-side, crypto-grade weighted random. The draw returns a signed receipt; Done can only award exactly the person + prize that was pulled. One prize per person per giveaway. Every draw is logged.
- On camera: the winner screen shows the card, a quiet X (silently pulls again) and Done. No redo wording anywhere.
