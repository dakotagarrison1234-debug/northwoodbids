# Northwood Bids — "Come Play in the Northwood" 🎥
### 75–85s vertical (9:16) explainer · AI voiceover + captions · a cast of woodland critters

A charming, storybook-woodland explainer that walks a new customer through the four things that matter: **sign up free → bid your way → pick it up local → earn Bid Bucks.** A cast of critters carries the story; simple, clean **generic app screens** (AI-generated in Higgsfield — *not* exact copies of your site) show the "how." Everything can be built inside Higgsfield with no screen-recording or PII blurring. (Real captures of northwoodbids.com are an optional swap-in, see §6.)

---

## 1. The big idea

Northwood is a cozy pine-forest auction town. Each step of the journey is hosted by a different critter, intercut with **real footage of the actual site** so viewers see exactly how easy it is. Warm, wholesome, a little funny — never salesy.

**Look & feel:** storybook 3D (Pixar-ish), golden-hour light, hand-crafted, cozy, cinematic shallow depth of field.
**Brand palette (use in critter scenes + captions):** parchment `#f1e7d5`, leather brown `#6c4d39`, moss green `#5f7a45`, burnt orange `#c47b3e`, espresso `#241a12`.
**Tone of VO:** warm, friendly, small-town, a touch playful. Think "favorite neighbor telling you about a good thing."

---

## 2. The cast (your Northwood critters)

Generate ONE clean reference still of each critter first, then reuse it for every clip (image-to-video) so they stay consistent. Keep these descriptions **word-for-word** in every prompt for that character.

| Critter | Role | Locked description (paste into every prompt) |
|---|---|---|
| 🦊 **Fitz the Fox** | Auctioneer / host | "russet-red fox auctioneer in a little brown leather vest, holding a small wooden gavel, warm and expressive" |
| 🐰 **Ruby the Rabbit** | New sign-up | "fluffy light-brown rabbit with big bright eyes and a moss-green scarf, eager and cheerful" |
| 🐻 **Barrett the Bear** | The bidder | "big gentle black bear with a plaid flannel bandana, holding a numbered wooden bidding paddle" |
| 🦝 **Rocket the Raccoon** | Rival bidder (comic relief) | "sly little raccoon with a striped tail and a mischievous grin" |
| 🦌 **Dot the Deer** | Pickup | "graceful young deer carrying a canvas tote bag, calm and kind" |
| 🦫 **Buck the Beaver** | Loads the crate | "sturdy beaver in tiny work gloves lifting a wooden crate" |
| 🦉 **Ollie the Owl** | Alerts / "ping!" | "round wise owl ringing a small brass bell" |
| 🐿️ **The Nutley Squirrels** | Bid Bucks / referrals | "a pair of bushy-tailed squirrels trading glowing golden acorns" |

**Recurring setting token (paste into scene prompts):** "a rustic barn auction house in a pine forest at golden hour, string lights, stacked wooden crates, misty mountains in the distance."

---

## 3. Make it in Higgsfield — models, features & steps

Higgsfield is one subscription that bundles 30+ video models + image models behind guided "Create" modes. You only need three of them.

**The 3 features you'll actually use**
- **Soul (image model)** — generates each **critter still** and each **generic app-screen mockup**. Has 50+ style presets; pick a warm, cinematic/storybook one. Set aspect ratio **9:16**.
- **Image-to-Video** — upload a Soul still as the **start frame** and animate it with a **camera preset** (70+: dolly, crane, crash-zoom, orbit, FPV…). "Keyframe → animate" is the entire workflow — one still becomes one clip.
- **Speak / Higgsfield Audio** *(optional)* — generate the **voiceover (Text-to-Speech)** right inside Higgsfield, and/or **lipsync** a critter's mouth if you want one to actually "talk."

**Which video model to pick per shot** (in the Image-to-Video model dropdown):
- **Expressive critters (most scenes):** **Kling 3.0** or **Veo 3.1** — best at charming characters + clean motion.
- **Big hero camera moves (open/end):** **Veo 3.1** with a strong preset, or **Sora 2** for dynamic scenes.
- **Cheap/fast b-roll & simple pushes:** **Seedance 2.0** or **Wan 2.6** to conserve credits.
- *(If a model name has changed by the time you read this, just pick the current "best quality" character/cinematic option — the steps are identical.)*

**Character consistency (important):** invented critters won't stay on-model by luck. The reliable trick is: generate **one great Soul still per critter**, then reuse *that exact image* as the start frame for all of its clips. For your host **Fitz the Fox**, go one better — make ~5 good Fitz renders and train a **Soul ID** (Higgsfield's identity-lock); then he's consistent in every scene.

**Step-by-step**
1. In **Soul**, set **9:16** + a warm storybook preset. Generate each **critter still** (§5 prompts). Regenerate until on-model; save each.
2. *(Optional)* Train a **Soul ID** for Fitz the Fox.
3. In **Soul**, generate the **generic app-screen mockups** (prompts just below) — clean, on-brand, deliberately *not* a copy of your real site.
4. For each scene: **Image-to-Video** → upload the still → type the motion line → choose the **camera preset** → pick the **model** above → generate ~5s. Regenerate weak ones.
5. **Audio:** generate the VO in **Higgsfield Audio (TTS)** *or* ElevenLabs. (Higgsfield **Speak** can lipsync a critter if you want one talking to camera.)
6. **Assemble** in CapCut / Premiere / DaVinci: lay the VO first, cut clips to it, add captions + music + SFX. Export **1080×1920 · 9:16 · 30fps · H.264**.

> **Credits & watermark:** Higgsfield is credit-based (some free credits to test). Paid plans give more credits, higher resolution, and remove the watermark. Video eats credits fast, so **lock your cheap Soul stills first, then spend video credits only on keepers.** Confirm the current plan on higgsfield.ai before a big render session.
> **Presets drift between updates** — where I name one, use it or the closest equivalent (Push In ≈ Dolly In ≈ Zoom In; Crane Up ≈ Jib Up).

### Generic app-screen mockups (Soul prompts — 9:16)

These stand in for the real UI without copying it. Keep them simple and on-brand.

- **Sign-up:** "a clean friendly mobile app sign-up screen on a smartphone, big rounded 'Create Free Account' button, simple avatar picker row, warm cream and leather-brown UI with pine-green accents and a tiny pine-tree logo" + style suffix.
- **Bidding:** "a simple mobile auction app screen showing one product photo, a current price, a 'Place bid' button and a 'Set max bid' field, a small countdown timer, warm cream/brown UI with pine accents" + style suffix.
- **Winning / outbid:** "the same simple auction app screen with a green 'You're winning' banner — plus a second version with a red 'Outbid' banner, warm rustic UI" + style suffix.
- **Pickup:** "a simple mobile pickup screen with two location cards (pine icons) labeled 'Owosso' and 'Gladwin' and a small calendar time-picker, warm cream/brown UI" + style suffix.
- **Bid Bucks:** "a simple mobile referral screen: 'Invite friends & family' with a big badge reading 'Up to $25 in free Bid Bucks' and little acorn-coin icons, warm rustic UI" + style suffix.

> Nice touch: have a critter **hold the phone** showing these screens (put the mockup in the critter's paws) so the UI lives inside the woodland world instead of cutting to a flat screen.

---

## 4. Voiceover script (paste straight into ElevenLabs)

> Voice suggestion: warm mid-range, friendly, unhurried. ElevenLabs "Adam/Bill" style or a friendly female VO. ~185 words ≈ 80s at a relaxed pace.

```
Deep in the Northwood, the whole gang shops a little differently.

First — Ruby the rabbit hops in and makes her free account.
No fees. No catch. Just a name and a face.

Then Barrett the bear spots a treasure. He sets his max bid…
and lets Northwood do the rest — bidding just enough to keep him on top.
So he only ever pays a hair over the next bidder.
That's the magic: you decide what it's worth, and you pay what you want to pay.

Ping! Outbid? You'll know instantly.
Back on top? The lot glows green.

When Barrett wins, Dot the deer picks her pickup spot —
Owosso or Gladwin — and grabs it on her own schedule.
Local pickup: quick, and flexible. We'll even shuttle it to the barn closest to you.

And the squirrels? They invite their friends and family to bid along —
and earn up to twenty-five dollars in free Bid Bucks for doing it.

Sign up free. Bid your way. Come play in the Northwood.

Northwood Bids.
```

---

## 5. Shot-by-shot storyboard

**Legend:** 🎬 = Higgsfield AI critter clip · 📱 = generic app-screen mockup (AI-generated in Soul; or a real capture if you'd rather — §6) · 📸 = optional real photo b-roll.
**Style suffix** (append to every 🎬 image prompt): `— storybook 3D, Pixar-like, golden-hour rustic woodland, cozy, cinematic shallow depth of field, warm palette (cream, leather brown, moss green, burnt orange), 9:16 vertical.`

### Scene 1 — Open (0:00–0:07) 🎬
- **Image prompt:** "Fitz the Fox auctioneer taps a small wooden gavel on a barrel by a hand-painted 'NORTHWOOD BIDS' wooden sign, [setting token]" + style suffix.
- **Motion / preset:** slow reveal, gavel tap. **Crane Up** (or Jib Up).
- **Caption:** *Welcome to the Northwood.*
- **VO:** "Deep in the Northwood, the whole gang shops a little differently."

### Scene 2 — The site (0:07–0:12) 📱
- **Capture:** northwoodbids.com **home page** on a phone — the hero + the live-auction cards scrolling.
- **Motion:** real scroll, or Push In on a screenshot.
- **Caption:** *northwoodbids.com*
- **VO:** *(tail of line 1)*

### Scene 3 — Sign up is free (0:12–0:20) 🎬 → 📱
- **🎬 Image prompt:** "Ruby the Rabbit happily taps a big glowing wooden 'Create Free Account' button, confetti of tiny leaves, [setting token]" + style suffix. **Preset:** Push In.
- **📱 Capture:** the **sign-up flow** — tap *Create Free Account* → username → **avatar pick step**.
- **Caption:** *Free to join — no fees, no catch.*
- **VO:** "First — Ruby the rabbit hops in and makes her free account. No fees. No catch. Just a name and a face."

### Scene 4 — Spot a treasure & set your max (0:20–0:33) 🎬 → 📱
- **🎬 Image prompt:** "Barrett the Bear's eyes widen at a glowing lot on a pedestal, he lifts a numbered wooden bidding paddle, [setting token]" + style suffix. **Preset:** Dolly In.
- **📱 Capture:** an **item page** — tap **Bid**, then **set a max bid** in the box.
- **Caption:** *Set your max. We bid for you — automatically.*
- **VO:** "Then Barrett the bear spots a treasure. He sets his max bid… and lets Northwood do the rest — bidding just enough to keep him on top."

### Scene 5 — Pay what you want (0:33–0:41) 🎬
- **Image prompt:** "Barrett the Bear slides a single small gold coin across a wooden counter with a satisfied grin while Rocket the Raccoon grumbles behind him, [setting token]" + style suffix.
- **Motion / preset:** coin slide, raccoon reacts. **Handheld** (subtle).
- **Caption:** *You only pay a hair over the next bidder.*
- **VO:** "So he only ever pays a hair over the next bidder. That's the magic: you decide what it's worth, and you pay what you want to pay."

### Scene 6 — Alerts: outbid → winning (0:41–0:48) 🎬 + 📱
- **🎬 Image prompt:** "Ollie the Owl rings a small brass bell, a soft 'ping' glow, [setting token]" + style suffix. **Preset:** Zoom In (quick).
- **📱 Capture:** an item/grid card flipping from **red 'Outbid'** to **green 'You're winning.'**
- **Caption:** *Outbid? Instant alert. Back on top? It glows green.*
- **VO:** "Ping! Outbid? You'll know instantly. Back on top? The lot glows green."

### Scene 7 — Pick your pickup (0:48–0:58) 🎬 → 📱
- **🎬 Image prompt:** "Dot the Deer stands at a wooden signpost with two arrows reading 'OWOSSO' and 'GLADWIN,' Buck the Beaver loads a wooden crate into a little pickup truck, [setting token]" + style suffix. **Preset:** Orbit (slow).
- **📱 Capture:** the **/pickup** page — the **location picker (Owosso / Gladwin)** and choosing a **pickup time**.
- **Caption:** *Pick your spot. Pick your time. Easy local pickup.*
- **VO:** "When Barrett wins, Dot the deer picks her pickup spot — Owosso or Gladwin — and grabs it on her own schedule. Local pickup: quick, and flexible. We'll even shuttle it to the barn closest to you."

### Scene 8 — Bid Bucks (0:58–1:10) 🎬 → 📱
- **🎬 Image prompt:** "The Nutley Squirrels wave friends over and hand out glowing golden acorns that turn into little '$' coins, cheerful, [setting token]" + style suffix. **Preset:** Push In.
- **📱 Capture:** the **/refer** page showing **Bid Bucks** and **up to $25**.
- **Caption:** *Invite friends & family → up to $25 in free Bid Bucks.*
- **VO:** "And the squirrels? They invite their friends and family to bid along — and earn up to twenty-five dollars in free Bid Bucks for doing it."

### Scene 9 — End card (1:10–1:20) 🎬
- **Image prompt:** "The whole cast — Fitz, Ruby, Barrett, Dot, Buck, Ollie and the squirrels — gathered around the gavel beneath the glowing 'NORTHWOOD BIDS' sign, leaves drifting, [setting token]" + style suffix. **Preset:** Crane Up / slow pull-back.
- **On screen:** Northwood Bids logo + **northwoodbids.com** + button-style caption *Sign up free · Bid your way.*
- **VO:** "Sign up free. Bid your way. Come play in the Northwood. Northwood Bids."

---

## 6. *(Optional)* Use real captures instead of the generic mockups

The default build is 100% Higgsfield (generic app screens from §3). But if you'd rather show the actual product for authenticity, swap any 📱 scene for a real vertical screen-recording. Record ~4–6s each and **blur any customer names/emails/phone numbers (PII)** — use a demo account/lot.

1. **Home** — `northwoodbids.com` — hero + live auction cards.
2. **Sign up** — *Create Free Account* → username → **avatar pick**.
3. **Auction grid** — a live auction — lot cards with the **live countdown timers**.
4. **Item + bid** — open a lot → **Bid** → **set a max bid** → confirm.
5. **Winning/outbid** — **green "You're winning"** (and the **red "Outbid"** state).
6. **Pickup** — `/pickup` — the **Owosso / Gladwin** picker + **pickup time**.
7. **Bid Bucks** — `/refer` — the referral screen with **"up to $25."**

**📸 Real photo b-roll (great next to the critters either way):** the actual barn/warehouse, a shelf of real lots, someone loading a box into a truck, a happy pickup handoff. Golden-hour light matches the AI look best. You can drop a photo into Higgsfield **Image-to-Video** and add a gentle **Push In** to make it move.

---

## 7. Music, sound & captions

- **Music:** warm acoustic folk — banjo/ukulele, hand-claps, upbeat and wholesome (Epidemic Sound / Artlist search: "wholesome folk," "sunny ukulele," "small town acoustic"). Duck it under the VO.
- **SFX:** gavel tap (S1/S9), soft coin slide (S5), bell "ping" (S6), gentle whoosh on transitions, leaf rustle, a happy chime on the green "winning" flip.
- **Captions:** rounded bold font, **cream text on a soft brown pill** (`#6c4d39` bg, `#f1e7d5` text) to match the brand. Keep to ≤6 words on screen. Animate in with a small pop.
- **Transitions:** quick whip-pans / leaf-swipe between critter world and the real UI so the cuts feel intentional, not jarring.

---

## 8. Assembly checklist

- [ ] VO generated and dropped on the timeline first (it sets the pacing).
- [ ] 7 real screen-captures recorded (PII blurred).
- [ ] 8 critter clips generated + trimmed to 4–6s.
- [ ] Captions added (brand pill style), synced to VO.
- [ ] Music bed added + ducked under VO; SFX placed.
- [ ] Logo + `northwoodbids.com` end card.
- [ ] Export **1080×1920 · 9:16 · 30fps · H.264**.
- [ ] Watch once muted (captions carry it) and once with sound.

---

## 9. Bonus: 30-second cut-down (for ads)

If you want a paid-ad version later, use only: **S1 (2s) → S3 sign-up (4s) → S4+S5 bid/pay-what-you-want (10s) → S7 pickup (6s) → S8 Bid Bucks (5s) → S9 end card (3s).** Same VO, trimmed to the key lines: *"Sign up free… set your max, pay what you want… pick it up local… and earn up to $25 in Bid Bucks for inviting friends. Northwood Bids."*

---

*Everything above is accurate to how Northwood Bids actually works: free Clerk sign-up with username + avatar, proxy/max bidding (you pay one increment over the runner-up), instant outbid alerts, Owosso/Gladwin pickup with warehouse transfers and self-scheduled times, and the Bid Bucks referral program (up to $25).*
