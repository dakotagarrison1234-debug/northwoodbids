# Concierge — GoHighLevel Wiring Guide

This connects your GoHighLevel Conversation AI bot (SMS + web chat widget) to the
Northwood Bids site so it can answer "where's my stuff?", "when's my pickup?", etc.
from **live data** — while never touching money.

There are three pieces:
1. **The endpoint** (already built): `/api/concierge/lookup` on your site.
2. **A secret key** so only your bot can call it.
3. **A GHL Custom Action** that calls the endpoint with the caller's phone.

---

## 1. Set the secret key (do this in Vercel, not here)

The endpoint requires a shared secret. It accepts either `CONCIERGE_API_KEY` **or**
your existing `GHL_WEBHOOK_SECRET` — so if you already set `GHL_WEBHOOK_SECRET`,
you can reuse it and skip adding a new one.

To add a dedicated key:
- In **Vercel → your project → Settings → Environment Variables**, add
  `CONCIERGE_API_KEY` with a long random value (e.g. a 32+ char string).
- Redeploy so it takes effect.

**Never paste this key into a chat or commit it to git.** You'll paste it only into
Vercel and into GoHighLevel's action header.

---

## 2. Test the endpoint yourself first

Once deployed, confirm it works with a real customer's phone number. In a terminal:

```bash
curl -s "https://YOURDOMAIN.com/api/concierge/lookup?phone=+15551234567" \
  -H "x-concierge-key: YOUR_SECRET_HERE" | jq
```

You should get JSON back with `found`, `items`, `pickup`, `links`, and a `briefing`
string. If you get `Unauthorized`, the key doesn't match; if `found: false`, that
phone isn't tied to a bidder (try one you know won something).

The `briefing` field is a ready-to-send, customer-safe message — the simplest setups
just relay that text.

---

## 3. Create the Custom Action in GoHighLevel

GHL's exact menu names shift over time, but the integration contract is fixed. In
your bot's **Conversation AI → Custom Actions** (or **Voice AI → Custom Actions**),
add a webhook action:

- **Name:** `Lookup Order Status`
- **When to use (description for the AI):** "Use whenever the customer asks about
  their items, order, pickup time, or where their stuff is."
- **Method:** `POST`
- **URL:** `https://YOURDOMAIN.com/api/concierge/lookup`
- **Headers:**
  - `x-concierge-key: YOUR_SECRET_HERE`
  - `Content-Type: application/json`
- **Body (JSON):**
  ```json
  { "phone": "{{contact.phone}}" }
  ```
- **Response mapping:** expose `briefing`, `found`, `pickup`, and `links` to the AI
  so it can phrase the answer (or relay `briefing` directly).

Then paste the prompt from `bot-prompt.md` into the bot's training/prompt, so it
knows when to call this action and to never discuss money.

### Alternative: Workflow + Custom Webhook
If you'd rather not use a Custom Action, you can instead build a Workflow triggered
on inbound message → **Custom Webhook** action (same URL/headers/body) → store the
returned `briefing` in a custom field → feed it to the Conversation AI action. Same
result, a few more clicks.

---

## 4. Human handoff ("text me")

The bot itself only *says* a team member will reach out. To actually get pinged, add
a GHL Workflow:

- **Trigger:** the bot tags a conversation (e.g. tag `needs-human`) or detects
  keywords like "refund," "return," "human," "manager."
- **Action:** send **you** an SMS/internal notification with the contact name and
  their message, plus a link to the conversation.

Tell the bot (already in the prompt) to hand off on refunds, returns, billing, upset
customers, or anything out of scope.

---

## 5. Web chat widget

Add GoHighLevel's **Chat Widget** to northwoodbids.com (GHL gives you a script snippet)
and point it at the **same Conversation AI bot**. Because the brain is the lookup
endpoint, the widget answers identically to SMS — one bot, two front doors.

> Heads-up on the widget: over SMS the phone number is verified (they texted from it).
> In web chat, a visitor could type any number. For now the bot only returns
> non-financial pickup/status info, so the risk is low — but if you want, we can add a
> quick "verify it's you" step (e.g. a code texted to the number) before the widget
> reveals order details. Ask me and I'll build it.

---

## What the endpoint returns (reference)

```
found        boolean   — was a bidder matched to this phone?
firstName    string?   — for a friendly greeting
itemCount    number
items[]      { title, state, stateLabel, locationName }
             state ∈ picked_up | moving | ready_booked | ready_unbooked | processing
pickup       { booked, when, locationName, address, boxed }
needsToBook  boolean   — has ready items but no appointment
links        { bookPickup, account }
briefing     string    — customer-safe message the bot can send verbatim
```

Money is never included in this response, by design.
