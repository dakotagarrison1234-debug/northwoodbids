import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/auctions(.*)",        // public live auctions page
  "/api/live-auctions",  // public live auctions API
  "/register(.*)",
  "/r/(.*)",               // public referral share links (/r/{code})
  "/onboarding(.*)",
  "/apply(.*)",
  "/join(.*)",
  "/search(.*)",
  "/api/search(.*)",
  "/help(.*)",             // public help / FAQ
  "/play(.*)",             // public mini-game
  "/terms(.*)",            // public legal
  "/privacy(.*)",          // public legal
  "/:orgSlug",
  "/:orgSlug/:auctionSlug(.*)",
]);

// Super admin routes still require auth (handled by requireSuperAdmin inside the layout)
export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
