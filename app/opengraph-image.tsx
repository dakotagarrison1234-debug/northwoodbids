import { ImageResponse } from "next/og";
import { C, OG_SIZE, OgBrand, OgFooter, ogFonts, ogLake, ogLogo } from "@/lib/og";

// The site's share card: what a link to the home page (or any page without its
// own card) looks like in a text, on Facebook, in Google and on X.
export const alt = "Northwood Bids: local online auctions in Corunna and Gladwin, Michigan. Every lot from $2.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  const [fonts, logo, lake] = await Promise.all([ogFonts(), ogLogo(), ogLake()]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: C.cream }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img src={lake} width={1200} height={630} style={{ position: "absolute", left: 0, top: 0 }} />
        {/* cream wash so the words sit on calm ground, lake shows on the right */}
        <div style={{ position: "absolute", left: 0, top: 0, width: 1200, height: 630, display: "flex", backgroundImage: "linear-gradient(90deg, rgba(241,231,213,0.98) 0%, rgba(241,231,213,0.95) 48%, rgba(241,231,213,0.55) 66%, rgba(241,231,213,0) 85%)" }} />

        <div style={{ position: "absolute", left: 64, top: 52, display: "flex", flexDirection: "column", width: 720 }}>
          <OgBrand logo={logo} size={66} />
          <div style={{ display: "flex", flexDirection: "column", marginTop: 34, fontFamily: "Bitter", fontWeight: 900, fontSize: 96, lineHeight: 0.98, letterSpacing: -2 }}>
            <span style={{ color: C.ink }}>Going once.</span>
            <span style={{ color: C.amber }}>Going twice.</span>
          </div>
          <div style={{ display: "flex", marginTop: 26, fontFamily: "Inter", fontWeight: 600, fontSize: 34, color: C.body, lineHeight: 1.25 }}>
            Brand-name overstock. Every lot from $2.
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
            {["Bid live", "24/7 pickup in Corunna", "Gladwin too"].map((t) => (
              <div key={t} style={{ display: "flex", padding: "10px 20px", borderRadius: 999, background: C.creamHi, border: `2px solid ${C.line}`, fontFamily: "Inter", fontWeight: 700, fontSize: 24, color: C.leather }}>
                {t}
              </div>
            ))}
          </div>
        </div>

        <OgFooter left="northwoodbids.com" right="Auctions close Sunday nights" />
      </div>
    ),
    { ...size, fonts },
  );
}
