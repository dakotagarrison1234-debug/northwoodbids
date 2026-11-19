import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import { ClerkProvider } from "@clerk/nextjs";
import HomeHeader from "@/app/components/HomeHeader";
import { HalloweenRoot } from "@/app/components/Halloween";
import { GlobalFooter } from "@/app/components/SiteFooter";
import ReferralClaimer from "@/app/components/ReferralClaimer";
import PromoClaimer from "@/app/components/PromoClaimer";
import ChatWidget from "@/app/components/ChatWidget";
import JsonLd from "@/app/components/JsonLd";
import { siteGraphLd } from "@/lib/seo";
import "./globals.css";

// Fonts are bundled in app/fonts (variable woff2, latin) so builds never have to
// download them from Google — a Google Fonts hiccup was failing Vercel builds.
const geistSans = localFont({
  src: "./fonts/geist-latin-wght-normal.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin-wght-normal.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

// Rugged slab serif for headings / display
const bitter = localFont({
  src: "./fonts/bitter-latin-wght-normal.woff2",
  variable: "--font-bitter",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://northwoodbids.com"),
  title: {
    default: "Northwood Bids — Local Online Auctions in Corunna & Gladwin, MI",
    template: "%s · Northwood Bids",
  },
  description:
    "Bid on brand-name overstock, returns & surplus at Northwood Bids — a local online auction " +
    "in mid-Michigan. Real-time bidding, set-your-max bids so you only pay what you want, and easy " +
    "local pickup in Corunna and Gladwin. Free to join.",
  keywords: [
    "online auction Michigan",
    "Corunna auction",
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
    title: "Northwood Bids — Local Online Auctions in Corunna & Gladwin, MI",
    description:
      "Brand-name overstock, returns & surplus at auction prices. Bid live, pay what you want, " +
      "pick up local in Corunna or Gladwin. Free to join.",
    url: "https://northwoodbids.com",
    // The image is app/opengraph-image.tsx (the branded 1200×630 card); pages
    // with their own card (lots, auctions, sign-up) override it.
  },
  twitter: {
    card: "summary_large_image",
    title: "Northwood Bids — Local Online Auctions in Michigan",
    description: "Brand-name overstock from $2. Bid live, pick up local in Corunna or Gladwin.",
  },
  icons: {
    // The wooden NB on cream (app/favicon.ico, app/icon.png, app/apple-icon.png).
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
        className={`${geistSans.variable} ${geistMono.variable} ${bitter.variable} h-full antialiased scroll-smooth`}
      >
        <head>
          {/* Warm up the TLS/DNS to the image CDNs so photos paint sooner. */}
          <link rel="preconnect" href="https://pub-829fa846d09e430db535c94618889062.r2.dev" />
          <link rel="preconnect" href="https://assets.cdn.filesafe.space" />
          <link rel="dns-prefetch" href="https://pub-829fa846d09e430db535c94618889062.r2.dev" />
        </head>
        <body className="min-h-full flex flex-col">
          {/* Google tag (Google Ads / Analytics, G-1V4Q1BPW6B). Loads after the page
              is interactive so it never slows the first paint. */}
          <Script src="https://www.googletagmanager.com/gtag/js?id=G-1V4Q1BPW6B" strategy="afterInteractive" />
          <Script id="google-tag" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-1V4Q1BPW6B');`}
          </Script>
          {/* Site-wide brand + site-search structured data (invisible). */}
          <JsonLd data={siteGraphLd()} />
          <HalloweenRoot />
          <HomeHeader />
          <ReferralClaimer />
          <PromoClaimer />
          {children}
          <GlobalFooter />
          {/* Woody — GHL support chat widget (only on customer-browsing pages). */}
          <ChatWidget />
        </body>
      </html>
    </ClerkProvider>
  );
}