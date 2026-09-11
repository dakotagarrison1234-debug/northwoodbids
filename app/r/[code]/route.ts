import { NextRequest, NextResponse } from "next/server";

/**
 * GET /r/{code}
 *
 * Public share-link landing. Drops the inviter's referral code into a 30-day
 * cookie and sends the visitor to sign-up. After they create an account, the
 * <ReferralClaimer /> client component POSTs /api/referral/claim, which reads
 * this cookie and attributes the new bidder to the inviter (server-side, with
 * all the new-bidder / self-referral guards).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> }
) {
  const { code } = await ctx.params;
  const clean = (code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

  // Optional `?to=/path` lets a share link land on the thing being shared (an item
  // page, say) instead of sign-up, while still dropping the referral cookie. Only
  // same-site relative paths are honoured — never an absolute/protocol-relative URL.
  const to = req.nextUrl.searchParams.get("to") || "";
  const safeTo = to.startsWith("/") && !to.startsWith("//") && !to.includes("\\") ? to : "/sign-up";

  const res = NextResponse.redirect(new URL(safeTo, req.url));
  if (clean) {
    res.cookies.set("nb_ref", clean, {
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
      httpOnly: false, // the claimer checks for presence client-side
      sameSite: "lax",
    });
  }
  return res;
}
