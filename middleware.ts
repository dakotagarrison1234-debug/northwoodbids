import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/auctions(.*)",        // public live auctions page
  "/api/live-auctions",  // public live auctions API
  "/register(.*)",
  "/r/(.*)",               // public referral share links (/r/{code})
  "/go/(.*)",              // public welcome-code QR landings (/go/{code})
  "/onboarding(.*)",
  "/apply(.*)",
  "/join(.*)",
  "/search(.*)",
  "/api/search(.*)",
  "/help(.*)",             // public help / FAQ
  "/shipping",             // public explainer; boxes need sign-in (API checks)
  "/play(.*)",             // public mini-game
  "/terms(.*)",            // public legal
  "/privacy(.*)",          // public legal
  // Machine-to-machine endpoints — they authenticate themselves (Stripe/GHL
  // signature, CRON_SECRET), so Clerk must NOT gate them or it 401s every call.
  "/api/webhooks(.*)",     // Stripe + GoHighLevel webhooks
  "/api/cron(.*)",         // Vercel cron (checks CRON_SECRET internally)
  "/:orgSlug",
  "/:orgSlug/:auctionSlug(.*)",
]);

// Always behind sign-in, whatever the public patterns above match: the
// "/:orgSlug/:auctionSlug(.*)" pattern also matches any two-segment path such as
// /admin/items or /api/admin/x. Each route still checks roles itself; this is
// the backstop so a new route that forgets can't be reached signed out.
const isAlwaysPrivate = createRouteMatcher([
  "/admin(.*)",
  "/superadmin(.*)",
  "/dashboard(.*)",
  "/print(.*)",
  "/api/admin(.*)",
  "/api/superadmin(.*)",
]);

// Super admin routes still require auth (handled by requireSuperAdmin inside the layout)
export default clerkMiddleware(async (auth, request) => {
  if (isAlwaysPrivate(request) || !isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
