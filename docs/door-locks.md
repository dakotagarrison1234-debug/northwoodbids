# Self-serve pickup doors (Schlage Encode Plus + Seam)

Two Schlage Encode Plus deadbolts, side door and back door, at the Corunna storefront.
Every pickup booked at Corunna gets a one-day door code that works on both doors,
texted at booking. This doc is the full setup checklist, what the site does
automatically, and what to do when something's off.

## How it behaves once it's on

| Moment | What happens |
|---|---|
| Customer books a pickup at Corunna | Site makes one PIN on both locks, valid 6:00am to 11:59pm (Michigan time) on the pickup date, and texts it with the address + keypad how-to. The booking screen shows it too. |
| Customer opens /pickup | Big black "Your door code" block under the appointment, with the day it works and which doors. |
| Customer reschedules (same place) | Same PIN, new day. Fresh text. |
| Customer or staff moves it to another location | PIN pulled off Corunna; a new one is made if the new place has locks. |
| Cancelled (either side) | PIN pulled off the locks immediately. |
| Marked collected (staff or "I picked up my order") | PIN pulled off the locks immediately. |
| Reopened by staff | New PIN, texted. |
| Pickup board | Each Corunna appointment shows its code, whether it's on the locks yet, and Resend / New code / Remove code / Unlock side door / Unlock back door. |
| 8am team digest | Each pickup line ends with "code 1234". |
| Lock goes offline / battery low / code fails to program | Team text (same webhook as transfer alerts) so you know before the customer does. |
| Staff and family codes you set in the Schlage Home app | Untouched. The site only ever deletes codes it created. |

The site never changes the lock's own settings (auto-lock, code length, alarm) —
those live in the Schlage Home app.

## Setup checklist

Do these in order. Nothing on the site changes until step 5.

### 1. Physical install (both doors)

- Encode Plus needs a standard deadbolt bore (2-1/8" hole, 1" latch bore, 2-3/8" or 2-3/4" backset). Door thickness 1-3/8" to 1-3/4". If a door currently has no deadbolt, have a locksmith bore it; if it has one, it's a 15-minute swap.
- 4 AA batteries each (in the box). Keep a spare set in the shop.
- Make sure the strike plate is lined up so the bolt throws without you leaning on the door. A dragging bolt is the number one cause of "my code didn't work" (the lock throws, hits the frame, and unlatches again).
- Wi-Fi: 2.4 GHz only. Walk to each door with your phone on the 2.4 GHz network and check you have at least two bars. If either door is weak, put a cheap Wi-Fi extender near it before you pair. Weak Wi-Fi means codes program late or not at all.

### 2. Schlage Home app (one account, both locks)

- Install **Schlage Home** on your phone and create ONE business account (an email you'll keep, e.g. the Northwood Bids Gmail). Do not use a personal account — this account is what Seam links to and it needs to stay the same forever.
- Pair each lock (follow the in-app steps; it uses Bluetooth first, then joins Wi-Fi).
- Name them exactly what customers will read: **Side door** and **Back door**. These names flow into the texts.
- In each lock's settings set the SAME code length on both (Schlage requires every code on a lock to be the same length; 4 digits is the default and plenty). The site asks Seam for a code and Seam honours the length each lock is set to — if the two locks differ, a shared code can't be made and booking just won't produce a code.
- Turn on **Auto-Lock** (30 seconds or 1 minute) on both. Customers forget to press the Schlage button; auto-lock covers it.
- Set a programming code / owner code for yourself and a staff code for anyone who needs daily access. These are yours, not the site's.
- Verify the email on the Schlage account (open the verification email). Seam's link step fails with "unauthorized" if it isn't verified.
- Test: lock and unlock each door from the app while standing outside Wi-Fi range of your phone (so it goes through the cloud, not Bluetooth). That's the path Seam uses.

### 3. Seam account

- Sign up at https://console.seam.co with the same business email.
- Seam starts you in a **sandbox** workspace (fake locks). Create a **production** workspace (top-left workspace switcher, "Create workspace", untick sandbox). Real locks only connect to a production workspace.
- Pricing (October 2026, from seam.co/pricing): **Standard** is $5 per lock per month with 50 credits per lock pooled, so 100 credits a month for two locks. Each pickup uses 4 credits (one code on two locks = 2 credits each). That covers 25 Corunna pickups a month inside the plan; each pickup past that is about $1 (25 cents a credit). Lite ($1.40 a lock) only has 6 credits total, so it's useless here. Pick Standard. Budget roughly **$10 to $25 a month**.
- Add a card in Billing.
- Workspace → API keys → create one. Copy it once.

### 4. Environment variables (Vercel → Project → Settings → Environment Variables)

```
SEAM_API_KEY=seam_...            # production workspace key from step 3
SEAM_WEBHOOK_SECRET=whsec_...    # from step 6 — required; the webhook ignores events until it's set
```

`GHL_CUSTOM_SMS_WEBHOOK` must already be set (it is — it's the "Text" button on
the bidders page). Door-code texts go through that same webhook with
`event: "door_code"`, so there is NO new GHL workflow to build. The team alerts
(offline lock, low battery, failed code) use `GHL_TRANSFER_REQUESTED_WEBHOOK`,
also already set.

Redeploy after adding the key.

### 5. Push the code and link the account

```
northwood
npx prisma db push
git add -A && git commit -m "Self-serve pickup doors: Seam + Schlage Encode Plus door codes" && git push
```

Then in the site: **Admin → Settings → Doors**

1. **Link Schlage account** — opens Seam's hosted page; sign in with the Schlage Home account from step 2 (it will ask for the 2-factor code Schlage emails). It bounces back to the Doors page.
2. **Find my locks** — both locks appear with online status, battery and code length.
3. For each lock pick the location: **Corunna** (make the Corunna pickup location first under Admin → Pickup → Locations if it isn't there yet, with its address and hours).
4. Rename if the Schlage names came through odd. Keep them short; they're read out in texts.
5. Tap **Unlock** on each while someone stands at the door. You should hear it throw within a few seconds. Then **Lock**.

### 6. Seam webhook (so the board knows a code actually landed)

Seam console → Webhooks → Add endpoint:

- URL: `https://northwoodbids.com/api/webhooks/seam`
- Events: `access_code.set_on_device`, `access_code.failed_to_set_on_device`, `access_code.delay_in_setting_on_device`, `device.disconnected`, `device.low_battery`
- Copy the signing secret into `SEAM_WEBHOOK_SECRET` and redeploy.

Until the secret is set, the webhook ignores everything (on purpose — an unsigned
endpoint could be used to spam your phone). The board still works; it just shows
"Programming" until someone taps **Check** on the appointment. Once set, the chip
flips to "On the locks" by itself and you get a text if a code fails.

If Seam ever refuses to delete a code (outage), the id is parked on the appointment
and the 3-minute cron keeps retrying until it's gone. Codes also expire on the lock
at midnight regardless.

### 7. Dry run before customers

1. Make a throwaway test bidder (or use your own account), win and pay for a cheap lot, book a Corunna pickup for TODAY.
2. You should get the text within a few seconds. The /pickup page shows the code. The admin board shows it with "Programming" then "On the locks" (10 to 60 seconds normally; Schlage sometimes takes a couple of minutes).
3. Walk to each door, touch the keypad, enter the code. Both should open.
4. On the board tap **Order picked up**. Try the code again within a minute — it should be dead.
5. Book another for tomorrow, then reschedule it to the day after: same code should show, and you should get the "moved" text. Cancel it: code gone.
6. Open the Schlage Home app → lock → Access codes: you'll see the site's codes named like "Pickup Sat Oct 17 A1B2". Don't edit them there; let the site manage them.

### 8. Corunna location in the site (while you're at it)

Admin → Pickup → Locations: add **Corunna** with the street address, set the weekly
pickup windows, and put a line in Instructions like "Use the side door on Main St or
the back door off the lot. Your door code is in your text." The address and
instructions show on /pickup and in the ICS calendar file.

When you're ready to retire Owosso porch pickup, add a blackout there or set it
inactive; existing bidders with Owosso as home can be bulk-moved to Corunna on request.

## Day-to-day

- Someone at the door says the code won't work: open the board, find them, tap **Unlock side door** (or back). Then tap **New code** if they'll be back in later today.
- Woody (the text/chat bot) will never read a door code out loud — a phone number typed into the web chat isn't proof of who's asking. It points people to their text and the Pickup page. If someone really needs it, staff can hit **Resend** on the board.
- Lost phone / didn't get the text: **Resend**.
- Lock shows Offline on Settings → Doors: it dropped Wi-Fi. Power-cycle it (pull one battery for 10 seconds). If it keeps happening, that door needs an extender.
- Battery under 25%: the Doors page says so, and Seam texts you. Encode Plus lasts about 6 months on 4 AA; swap all four at once.
- Codes made by the site are time-bound, so even if the site is down they expire on their own at midnight.

## Limits worth knowing

- Encode Plus stores 100 codes. Each pickup day uses one slot per lock until it expires at midnight, so even 40 pickups in a day is fine. Seam deletes expired ones.
- All codes on a lock must be the same length. Don't mix 4- and 6-digit staff codes on the same lock.
- A code can't be made for a pickup date that has already ended, and a code's start is "now" for same-day bookings (not 6am).
- Apple Home Key / HomeKit on the Encode Plus is separate and doesn't affect any of this. Don't add the locks to Apple Home with the same account though — codes toggled off in Apple Home get deleted from Schlage and lose their schedule.
- Seam credits are only charged for successful code creations and remote unlocks. Reads, status and webhooks are free.

## Sources

- Seam Schlage guide: https://www.seam.co/docs/device-and-system-integration-guides/schlage-locks/get-started-with-schlage-locks
- Seam pricing: https://www.seam.co/pricing/preview
- Seam linked codes across locks: https://www.seam.co/docs/api/access_codes/create_multiple
- Schlage Home API constraints (code length, 100 codes, same-length rule): https://developer.allegion.com/en/products/schlage-home/getting_started_res_access_codes.html
