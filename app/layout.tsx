import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Bitter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import HomeHeader from "@/app/components/HomeHeader";
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
  title: "Northwood Bids",
  description: "Northwood Bids — live auctions, bid in real time and check out securely.",
  applicationName: "Northwood Bids",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Northwood Bids",
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
        <body className="min-h-full flex flex-col">
          <HomeHeader />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}