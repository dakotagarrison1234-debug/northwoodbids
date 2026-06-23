export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getReferralSummary } from "@/lib/referral";

/** GET /api/referral/summary — everything the bidder's referral hub needs. */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const summary = await getReferralSummary(userId);
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[referral/summary GET]:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
