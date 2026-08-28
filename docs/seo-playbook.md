# Northwood Bids — SEO Playbook

Two halves: **on-site** (done in code — invisible, no visual changes) and **off-site**
(you do these once in Google/Bing/etc.). Local ranking especially lives off-site.

---

## ✅ What's already done in the code

- **Rich metadata** on the homepage, auction pages, and every item page — keyword-rich,
  local ("Owosso", "Gladwin", "Michigan online auction"), with canonical URLs, Open
  Graph + Twitter cards, and Google snippet directives (large image previews).
- **Structured data (schema.org JSON-LD)** — this is the big new lever:
  - Site-wide **Organization** + **WebSite** (with a Sitelinks search box) on every page.
  - **LocalBusiness** for *each* pickup location (Owosso, Gladwin), built from your real
    address data — the foundation Google uses for local/map ranking.
  - **Product + Offer** on every lot (price, condition, availability, photos) → eligible
    for rich "product" results with price shown in search.
  - **BreadcrumbList** on item pages.
- **Sitemap** (`/sitemap.xml`) now includes the homepage, `/auctions`, seller pages,
  live **and** upcoming auctions, and **every active lot** — auto-refreshes hourly.
- **robots.txt** allows all public pages, blocks private/admin/auth/checkout surfaces,
  and points to the sitemap.
- **Search Console verification** hook: set the env var `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`
  to your GSC token and it's verified automatically.

> Verify the structured data after deploy with Google's **Rich Results Test**
> (search.google.com/test/rich-results) — paste `https://northwoodbids.com` and an item URL.

---

## 🔴 Do these now (biggest wins, ~1–2 hrs total)

### 1. Google Search Console  → tell Google the site exists
1. Go to **search.google.com/search-console**, add property `northwoodbids.com`.
2. Verify: easiest is **DNS** (add the TXT record they give you at your domain registrar),
   or set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` env var to their meta token and redeploy.
3. **Sitemaps → add** `sitemap.xml`. That's it — Google will start crawling everything.
4. (Repeat the add-sitemap step in **Bing Webmaster Tools** — bing.com/webmasters — 5 min,
   free traffic from Bing + ChatGPT search.)

### 2. Google Business Profile — TWO of them (this is what wins local)
This is the single most important thing for "auction near me" / "Owosso" searches.
1. **google.com/business** → create a profile for **Owosso** and a separate one for **Gladwin**
   (each physical pickup location = its own profile).
2. For each: exact business name **Northwood Bids**, the real street address, phone, hours,
   website `https://northwoodbids.com`, category **"Auction House"** (add "Liquidator" too).
3. Add 8–10 photos (storefront/warehouse, lots, a pickup). Google favors profiles with photos.
4. Write the "from the business" description using your keywords (overstock, returns,
   surplus, local pickup, Owosso/Gladwin, Michigan).
5. Verify each (postcard or video — follow their prompt).

**NAP consistency:** the Name / Address / Phone must be **byte-for-byte identical** on the
website, both GBP profiles, and everywhere else. Pick one exact format and never vary it.

### 3. Reviews — the local ranking multiplier
- Get the "review link" from each Google Business Profile.
- After a pickup, have **Woody** (or an SMS/GHL workflow) text happy customers that link:
  *"Thanks for stopping by! A quick Google review really helps us — [link]"*.
- Aim for a steady trickle (a few a week) with replies to each. Volume + recency + your
  responses all feed ranking. This alone can move you into the local 3-pack.

---

## 🟠 Do these this month

- **Local citations:** list Northwood Bids (same NAP) on Bing Places, Apple Business Connect,
  Yelp, Facebook Page, Nextdoor, and any Michigan/Owosso/Gladwin local directories or chamber
  of commerce. Each consistent listing reinforces the local signal.
- **Facebook/Instagram** business pages linking to the site (you already auto-generate flyers —
  post them; social links help discovery even if they're "nofollow").
- **Backlinks:** a mention/link from a local paper, a "things to do in Owosso" roundup, or a
  supplier's site is worth a lot locally. Even one or two good local links move the needle.

---

## 🟡 Ongoing content (compounds over time)

- Keep auctions/lots flowing — fresh, indexable product pages are exactly what the sitemap now
  feeds Google. More live lots = more long-tail rankings ("cordless drill auction michigan").
- Consider a couple of evergreen pages later (no rush, and I can build them): a **"How our
  auctions work"** page and location pages (**/owosso**, **/gladwin**) targeting
  "online auction Owosso MI" etc. Tell me when you want these and I'll add them.

---

## Quick verification checklist (after deploy)

- [ ] `https://northwoodbids.com/robots.txt` loads and lists the sitemap.
- [ ] `https://northwoodbids.com/sitemap.xml` loads and lists auctions + items.
- [ ] Rich Results Test passes for the homepage (Organization/LocalBusiness) and an item (Product).
- [ ] Search Console property verified + sitemap submitted.
- [ ] Both Google Business Profiles created + verified with matching NAP.
- [ ] Review-request flow live.

The code half is handled and safe. The off-site half (GBP + reviews + citations) is where the
local ranking is actually won — that's the part only you can do, and it's worth the hour.
