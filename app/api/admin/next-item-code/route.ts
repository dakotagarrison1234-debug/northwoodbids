export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getUserOrg } from "@/lib/auth";
import { peekNextCode } from "@/lib/itemCode";

/**
 * PEEK at this lister's next item code ("48-DAK") for the New item footer.
 *
 * Deliberately does NOT allocate: minting on every form load would burn a
 * number for every abandoned form. The real code is allocated inside the save
 * (the footer's code is sent along and honored while it's still free), and the
 * save's response is the only truth the tag ever prints.
 */
export async function GET() {
  // getUserOrg also covers a super admin acting as the org.
  const membership = await getUserOrg();
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const code = await peekNextCode(membership.clerkUserId);
  return NextResponse.json({ code, approximate: true });
}
