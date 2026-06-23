export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { attributeReferral } from "@/lib/referral";

/**
 * POST /api/referral/claim
 *
 * Reads the `nb_ref` cookie (set by /r/{code}) and attributes the signed-in
 * bidder to the inviter who owns that code. All eligibility rules live in
 * attributeReferral(): self-referral, already-referred, and established-buyer
 * checks. The cookie is cleared in every terminal case so it never retries.
 */
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  const store = await cookies();
  const code = store.get("nb_ref")?.value;
  if (!code) return NextResponse.json({ ok: false, reason: "no_code" });

  const result = await attributeReferral(userId, code);

  const res = NextResponse.json(result);
  res.cookies.set("nb_ref", "", { maxAge: 0, path: "/" }); // terminal — stop retrying
  return res;
}
