import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Bitter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import HomeHeader from "@/app/components/HomeHeader";
import ReferralClaimer from "@/app/components/ReferralClaimer";
import ChatWidget from "@/app/components/ChatWidget";
import JsonLd from "@/app/components/JsonLd";
import { siteGraphLd } from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Rugged slab serif for headings / display
const bitter = Bitter({
  variable: "--font-bitter",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://northwoodbids.com"),
  title: {
    default: "Northwood Bids — Local Online Auctions in Owosso & Gladwin, MI",
    template: "%s · Northwood Bids",
  },
  description:
    "Bid on brand-name overstock, returns & surplus at Northwood Bids — a local online auction " +
    "in mid-Michigan. Real-time bidding, set-your-max bids so you only pay what you want, and easy " +
    "local pickup in Owosso and Gladwin. Free to join.",
  keywords: [
    "online auction Michigan",
    "Owosso auction",
    "Gladwin auction",
    "liquidation auction Michigan",
    "overstock auction",
    "returns auction",
    "local pickup auction",
    "bid online Michigan",
    "Northwood Bids",
  ],
  applicationName: "Northwood Bids",
  manifest: "/manifest.webmanifest",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "shopping",
  // Set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION to verify the domain in Google Search
  // Console (or verify by DNS instead). Undefined => tag simply isn't emitted.
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Northwood Bids",
  },
  openGraph: {
    type: "website",
    siteName: "Northwood Bids",
    locale: "en_US",
    title: "Northwood Bids — Local Online Auctions in Owosso & Gladwin, MI",
    description:
      "Brand-name overstock, returns & surplus at auction prices. Bid live, pay what you want, " +
      "pick up local in Owosso or Gladwin. Free to join.",
    url: "https://northwoodbids.com",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Northwood Bids" }],
  },
  twitter: {
    card: "summary",
    title: "Northwood Bids — Local Online Auctions in Michigan",
    description: "Brand-name overstock at auction prices. Bid live, pick up local in Owosso or Gladwin.",
    images: ["/icon-512.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#6c4d39",
    "msapplication-tap-highlight": "no",
  },
};

// viewport-fit=cover lets the app draw under the notch / home indicator; the
// safe-area CSS in globals.css then keeps bars and content out from under them.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#6c4d39",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} ${bitter.variable} h-full antialiased`}
      >
        <head>
          {/* Warm up the TLS/DNS to the image CDNs so photos paint sooner. */}
          <link rel="preconnect" href="https://pub-829fa846d09e430db535c94618889062.r2.dev" />
          <link rel="preconnect" href="https://assets.cdn.filesafe.space" />
          <link rel="dns-prefetch" href="https://pub-829fa846d09e430db535c94618889062.r2.dev" />
        </head>
        <body className="min-h-full flex flex-col">
          {/* Site-wide brand + site-search structured data (invisible). */}
          <JsonLd data={siteGraphLd()} />
          <HomeHeader />
          <ReferralClaimer />
          {children}
          {/* Woody — GHL support chat widget (only on customer-browsing pages). */}
          <ChatWidget />
        </body>
      </html>
    </ClerkProvider>
  );
}