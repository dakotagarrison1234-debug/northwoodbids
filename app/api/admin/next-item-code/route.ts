export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
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
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.orgMember.findFirst({ where: { clerkUserId: userId } });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const code = await peekNextCode(userId);
  return NextResponse.json({ code, approximate: true });
}
