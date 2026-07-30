"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Woody — the GoHighLevel support chat widget.
 *
 * We only want the floating bubble on the CUSTOMER-BROWSING pages (home, an
 * auction / bid-preview page, and item-preview pages). It's hidden on admin,
 * My Bids / dashboard, pickup, and account / settings / profile so its bottom-
 * right bubble never sits on top of those pages' bottom controls.
 *
 * The GHL widget loads once and injects a <chat-widget> host at the end of
 * <body>; that host can't be un-injected on client-side navigation, so we load
 * it once and just toggle its visibility with a body class as the route changes.
 */

// Anything under these prefixes never shows the widget.
const HIDE_PREFIXES = [
  "/admin",
  "/superadmin",
  "/dashboard",
  "/account",
  "/pickup",
  "/settings",
  "/sign-in",
  "/sign-up",
  "/play",
  "/invoice",
];

// First path segments that are named routes, NOT an {orgSlug} — so a two-segment
// path like /help/x isn't mistaken for an auction page.
const RESERVED_FIRST = new Set([
  "help",
  "terms",
  "privacy",
  "refer",
  "join",
  "apply",
  "search",
  "auctions",
  "preview",
  "unsold",
  "reports",
  "r",
  "api",
]);

function shouldShow(pathname: string | null): boolean {
  if (!pathname) return false;
  if (HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return false;
  if (pathname === "/") return true; // home
  if (pathname.includes("/item/")) return true; // item preview
  // Auction / bid-preview page: /{orgSlug}/{auctionSlug}
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 2 && !RESERVED_FIRST.has(segs[0])) return true;
  return false;
}

export default function ChatWidget() {
  const pathname = usePathname();
  const show = shouldShow(pathname);

  useEffect(() => {
    // `woody-hidden` on <body> hides the GHL widget host via globals.css.
    document.body.classList.toggle("woody-hidden", !show);
  }, [show]);

  return (
    <Script
      src="https://widgets.leadconnectorhq.com/loader.js"
      data-resources-url="https://widgets.leadconnectorhq.com/chat-widget/loader.js"
      data-widget-id="6a6982e9702ca026d596be98"
      strategy="afterInteractive"
    />
  );
}
