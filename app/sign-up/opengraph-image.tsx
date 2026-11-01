import { ImageResponse } from "next/og";
import { OG_SIZE, ogFonts, ogLake, ogLogo } from "@/lib/og";
import { JoinCard } from "@/lib/ogCards";

// Sign-up's share card. Invite links (/r/CODE) and QR welcome codes (/go/CODE)
// land here, so this is what a friend sees when someone texts them an invite.
export const alt = "You're invited to Northwood Bids. Free to join, every lot from $2.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  const [fonts, logo, lake] = await Promise.all([ogFonts(), ogLogo(), ogLake()]);
  return new ImageResponse(JoinCard({ logo, lake }), { ...size, fonts });
}
