# Admin facelift — working brief (for every page in /app/admin)

Goal: the admin ("the Workshop") feels like one product — easy, flowy, clean, attractive, fast to use on a phone in a warehouse. Behaviour stays IDENTICAL: every fetch, state, handler, API call, confirm, and edge case is preserved. This is a visual + layout pass on top of the shared kit.

## The kit — `app/admin/ui.tsx` (import from "../ui" or "../../ui")
- `PageHeader({ title, sub, eyebrow, actions, back, tabs })` — REPLACES every hand-rolled `<header className="border-b border-slate-200 bg-white …">`. It renders the group's section tabs automatically (Money: Winners · Reports; People: Bidders · Referrals · Team · Text a group; Auctions: All · New · Add a lot · Unsold). Use `back={{ href, label }}` and `tabs={false}` on detail pages (an auction, an item, a giveaway, a report drilldown).
- `PageBody({ wide })` — content gutters; `wide` for boards/tables.
- `Panel({ title, sub, action, tone })`, `Row({ href|onClick, leading, title, sub, trailing, tone })`, `ActionCard`, `StatCard`, `Pill({ tone, dot })`, `Eyebrow`, `Btn({ tone, variant: solid|outline|ghost, size })`, `BtnLink`, `Input`, `SearchBox`, `Segmented`, `Toolbar`, `Empty({ text, sub, action })`, `Notice({ tone })`, `Progress`, `Money`, `Initials({ name })`.
- Tones: `red` (money owed / destructive), `green` (paid / done), `amber` (needs attention), `slate` (neutral), `blue` (info), `ink` (dark), `leather` (primary brand). Primary buttons are `leather`; destructive are `red` outline unless truly final.
- Palette: canvas `#f4ede1`, card white, line `#e6dac6`, ink `#241a12`, leather `#6c4d39`, mute `#8a7559`, body `#4a3a2b`, moss `#4a7c59`, amber `#c47b3e`, gold `#f0a35a`. Display headings: `font-display font-black`. Cards: `bg-white border border-[#e6dac6] rounded-2xl`.

## Rules
1. **No behaviour changes.** Same props, same state names, same API calls, same copy for confirmations. If a handler exists, it still exists. Lists still filter/sort/paginate the same way.
2. **Replace** every `slate-*` colour class with the kit palette or a kit component. No raw `bg-slate-900` buttons — use `Btn`/`BtnLink`.
3. **No emoji, ever.** Use SVG icons from `app/components/BidIcons.tsx` (IcoGavel, IcoTrophy, IcoTruck, IcoCoin, IcoUsers, IcoTicket, IcoGift, IcoCheck, IcoMegaphone, IcoSpark, IcoBolt, IcoStar, IcoTarget, IcoShield, IcoLock, IcoMagnifier, IcoNew, IcoLink, IcoShare) or small inline SVGs. Also strip `✓ ✕ ✔ → ←` characters used as icons.
4. **Touch targets ≥ 44px.** Nothing fixed-width that overflows a 375px phone. Tables become stacked rows on phones (`sm:` breakpoints).
5. **Hierarchy:** one big thing per screen. Numbers you can act on are big and coloured; everything else is quiet. Use `Eyebrow` for small labels, `Pill` for status, `Row` for lists, `Panel` for sections.
6. **Delight, lightly:** `nb-lift-sm` on tappable cards, `Progress` bars where there's a ratio (time left, lots sold, paid vs owed), `Initials` avatars next to people, counts in `Segmented` tabs.
7. **Empty states** say what's missing and offer the next action.
8. Keep each file a drop-in: same default export, same imports of data/helpers.
9. Verify: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep <your files>` must print nothing (errors mentioning Prisma fields entryMode/drawStyle/startsAt/requireCard/announcedAt/bonusTickets/"ENDED" are stale-client noise elsewhere — ignore those). `npx eslint <your files>` — fix anything in the lines you touched.
10. Do NOT run git. Do NOT touch files outside your list.
