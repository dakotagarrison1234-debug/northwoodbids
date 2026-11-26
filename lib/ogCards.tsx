import { C, OgBrand, OgFooter, clip, money } from "@/lib/og";

/**
 * The share-card layouts (1200×630). Pure: the opengraph-image routes load the
 * data and photos, these just draw. Kept apart so they can be rendered with
 * sample data to check how they look.
 */

export type LotCardProps = {
  logo: string;
  photo: string | null;
  title: string;
  /** "Current bid" | "Starts at" | "Sold for" */
  priceLabel: string;
  price: number;
  retail: number | null;
  bids: number;
  /** "Ends Sun 8:00 PM" / "Bidding opens Mon 9:00 AM" / "Auction closed" */
  when: string;
  tone: "live" | "preview" | "done";
};

export function LotCard(p: LotCardProps) {
  const off = p.retail && p.retail > p.price && p.price > 0 ? Math.round((1 - p.price / p.retail) * 100) : 0;
  const title = clip(p.title, 78);
  const titleSize = title.length > 56 ? 44 : title.length > 34 ? 52 : 60;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: C.cream }}>
      {/* photo panel */}
      <div style={{ position: "absolute", left: 36, top: 36, width: 486, height: 486, display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", borderRadius: 28, border: `3px solid ${C.line}`, overflow: "hidden" }}>
        {p.photo ? (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img src={p.photo} style={{ maxWidth: 446, maxHeight: 446, objectFit: "contain" }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img src={p.logo} width={300} height={207} />
        )}
        {off >= 20 && p.tone !== "done" && (
          <div style={{ position: "absolute", left: 18, top: 18, display: "flex", padding: "10px 18px", borderRadius: 999, background: C.amber, color: "#ffffff", fontFamily: "Inter", fontWeight: 700, fontSize: 26 }}>
            {off}% off retail
          </div>
        )}
      </div>

      {/* info column */}
      <div style={{ position: "absolute", left: 566, top: 40, width: 600, height: 480, display: "flex", flexDirection: "column" }}>
        <OgBrand logo={p.logo} size={50} />
        <div style={{ display: "flex", marginTop: 22, fontFamily: "Bitter", fontWeight: 900, fontSize: titleSize, lineHeight: 1.08, color: C.ink, letterSpacing: -1 }}>
          {title}
        </div>
        <div style={{ display: "flex", flexGrow: 1 }} />
        <div style={{ display: "flex", fontFamily: "Inter", fontWeight: 700, fontSize: 24, color: C.mute, letterSpacing: 2, textTransform: "uppercase" }}>
          {p.priceLabel}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 22, marginTop: 4 }}>
          <div style={{ display: "flex", fontFamily: "Bitter", fontWeight: 900, fontSize: 112, lineHeight: 0.95, color: p.tone === "done" ? C.ink : C.moss, letterSpacing: -3 }}>
            {money(p.price)}
          </div>
          {p.retail && p.retail > p.price ? (
            <div style={{ display: "flex", flexDirection: "column", marginBottom: 12, fontFamily: "Inter" }}>
              <div style={{ display: "flex", fontSize: 22, fontWeight: 600, color: C.mute }}>Retail</div>
              <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: C.mute, textDecoration: "line-through" }}>{money(p.retail)}</div>
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
          {p.bids > 0 && (
            <div style={{ display: "flex", padding: "9px 18px", borderRadius: 999, background: C.creamHi, border: `2px solid ${C.line}`, fontFamily: "Inter", fontWeight: 700, fontSize: 24, color: C.leather }}>
              {p.bids} bid{p.bids === 1 ? "" : "s"}
            </div>
          )}
          <div style={{ display: "flex", padding: "9px 18px", borderRadius: 999, background: p.tone === "live" ? C.mossBright : p.tone === "preview" ? C.leather : C.body, fontFamily: "Inter", fontWeight: 700, fontSize: 24, color: "#ffffff" }}>
            {p.when}
          </div>
        </div>
      </div>

      <OgFooter left={p.tone === "done" ? "More lots at northwoodbids.com" : "Bid at northwoodbids.com"} right="Pick up in Corunna (24/7) or Gladwin" />
    </div>
  );
}

export type AuctionCardProps = {
  logo: string;
  title: string;
  photos: string[];
  lots: number;
  /** "Bidding closes Sun 8:00 PM" etc. */
  when: string;
  tone: "live" | "preview" | "done";
  /** Lowest current price among the lots, for "from $2". */
  fromPrice: number | null;
};

export function AuctionCard(p: AuctionCardProps) {
  const title = clip(p.title, 40);
  const tiles = p.photos.slice(0, 4);
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: C.cream }}>
      <div style={{ position: "absolute", left: 60, top: 48, width: 560, height: 470, display: "flex", flexDirection: "column" }}>
        <OgBrand logo={p.logo} size={54} />
        <div style={{ display: "flex", marginTop: 26, fontFamily: "Inter", fontWeight: 700, fontSize: 24, letterSpacing: 2, textTransform: "uppercase", color: p.tone === "live" ? C.mossBright : C.amber }}>
          {p.tone === "live" ? "Live auction" : p.tone === "preview" ? "Coming up" : "Auction"}
        </div>
        <div style={{ display: "flex", marginTop: 6, fontFamily: "Bitter", fontWeight: 900, fontSize: title.length > 22 ? 64 : 80, lineHeight: 1.0, color: C.ink, letterSpacing: -2 }}>
          {title}
        </div>
        <div style={{ display: "flex", flexGrow: 1 }} />
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, fontFamily: "Bitter", fontWeight: 900, color: C.ink }}>
          <span style={{ fontSize: 76, letterSpacing: -2 }}>{p.lots}</span>
          <span style={{ fontSize: 36 }}>lots</span>
          {p.fromPrice != null && <span style={{ fontSize: 36, color: C.moss }}>{`· from ${money(p.fromPrice)}`}</span>}
        </div>
        <div style={{ display: "flex", marginTop: 16 }}>
          <div style={{ display: "flex", padding: "10px 20px", borderRadius: 999, background: p.tone === "live" ? C.mossBright : p.tone === "preview" ? C.leather : C.body, fontFamily: "Inter", fontWeight: 700, fontSize: 26, color: "#ffffff" }}>
            {p.when}
          </div>
        </div>
      </div>

      {/* 2×2 lot mosaic */}
      <div style={{ position: "absolute", left: 650, top: 36, width: 514, height: 486, display: "flex", flexWrap: "wrap", gap: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ width: 250, height: 236, display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", borderRadius: 22, border: `3px solid ${C.line}`, overflow: "hidden" }}>
            {tiles[i] ? (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              <img src={tiles[i]} style={{ maxWidth: 222, maxHeight: 208, objectFit: "contain" }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              <img src={p.logo} width={130} height={90} style={{ opacity: 0.35 }} />
            )}
          </div>
        ))}
      </div>

      <OgFooter left="Bid at northwoodbids.com" right="Pick up in Corunna (24/7) or Gladwin" />
    </div>
  );
}

/** "Join" card for sign-up / invite links. */
export function JoinCard({ logo, lake }: { logo: string; lake: string }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: C.cream }}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img src={lake} width={1200} height={630} style={{ position: "absolute", left: 0, top: 0 }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: 1200, height: 630, display: "flex", backgroundImage: "linear-gradient(90deg, rgba(241,231,213,0.98) 0%, rgba(241,231,213,0.95) 50%, rgba(241,231,213,0.5) 68%, rgba(241,231,213,0) 86%)" }} />
      <div style={{ position: "absolute", left: 64, top: 52, width: 720, display: "flex", flexDirection: "column" }}>
        <OgBrand logo={logo} size={66} />
        <div style={{ display: "flex", flexDirection: "column", marginTop: 36, fontFamily: "Bitter", fontWeight: 900, fontSize: 88, lineHeight: 1.0, letterSpacing: -2 }}>
          <span style={{ color: C.ink }}>You&apos;re invited.</span>
          <span style={{ color: C.amber }}>Bid from $2.</span>
        </div>
        <div style={{ display: "flex", marginTop: 26, fontFamily: "Inter", fontWeight: 600, fontSize: 34, color: C.body, lineHeight: 1.25 }}>
          Free to join. Brand-name deals every week.
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
          {["Set a max, we bid for you", "Pick up local"].map((t) => (
            <div key={t} style={{ display: "flex", padding: "10px 20px", borderRadius: 999, background: C.creamHi, border: `2px solid ${C.line}`, fontFamily: "Inter", fontWeight: 700, fontSize: 24, color: C.leather }}>
              {t}
            </div>
          ))}
        </div>
      </div>
      <OgFooter left="northwoodbids.com" right="Join free in under a minute" />
    </div>
  );
}
