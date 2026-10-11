import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { PROMO_COOKIE, normalizeCode } from "@/lib/promo";
import { prisma } from "@/lib/prisma";

/**
 * GET /go/{code}
 *
 * The QR-code landing. Drops the welcome code into a 30-day cookie and sends a new
 * visitor to sign-up (an already-signed-in person goes home). After registration
 * <PromoClaimer /> POSTs /api/promo/claim, which grants the credit once per
 * account / phone number.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const clean = normalizeCode(code);
  const { userId } = await auth();
  // Amount rides along in the query so the sign-up strip can say the real number.
  const promo = clean ? await prisma.promoCode.findUnique({ where: { code: clean }, select: { amount: true, active: true } }) : null;
  const amt = promo?.active ? Number(promo.amount) : null;
  const dest = userId ? "/" : `/sign-up${clean ? `?promo=${encodeURIComponent(clean)}${amt ? `&amt=${amt}` : ""}` : ""}`;
  const res = NextResponse.redirect(new URL(dest, req.url));
  if (clean) {
    res.cookies.set(PROMO_COOKIE, clean, { maxAge: 60 * 60 * 24 * 30, path: "/", httpOnly: false, sameSite: "lax" });
  }
  return res;
}
