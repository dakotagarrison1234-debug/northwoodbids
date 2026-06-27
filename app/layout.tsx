import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Bitter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import HomeHeader from "@/app/components/HomeHeader";
import ReferralClaimer from "@/app/components/ReferralClaimer";
import BidderBottomNav from "@/app/components/BidderBottomNav";
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
    default: "Northwood Bids",
    template: "%s · Northwood Bids",
  },
  description: "Northwood Bids — live online auctions. Bid in real time, get text alerts, and pick up local.",
  applicationName: "Northwood Bids",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Northwood Bids",
  },
  openGraph: {
    type: "website",
    siteName: "Northwood Bids",
    title: "Northwood Bids",
    description: "Live online auctions — bid in real time and pick up local.",
    url: "https://northwoodbids.com",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Northwood Bids" }],
  },
  twitter: {
    card: "summary",
    title: "Northwood Bids",
    description: "Live online auctions — bid in real time and pick up local.",
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
          <HomeHeader />
          <ReferralClaimer />
          {children}
          <BidderBottomNav />
        </body>
      </html>
    </ClerkProvider>
  );
}