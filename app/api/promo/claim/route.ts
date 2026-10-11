export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { PROMO_COOKIE, claimPromo } from "@/lib/promo";

/**
 * POST /api/promo/claim — reads the nb_promo cookie and grants the welcome credit
 * once per account / phone. Clears the cookie on every terminal outcome so the
 * claimer stops retrying; keeps it while the profile has no phone yet (sign-up in
 * progress).
 */
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  const store = await cookies();
  const code = store.get(PROMO_COOKIE)?.value;
  if (!code) return NextResponse.json({ ok: false, reason: "no_code", terminal: true });

  const result = await claimPromo(userId, code);
  const res = NextResponse.json(result);
  if (result.ok || result.terminal) res.cookies.set(PROMO_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
