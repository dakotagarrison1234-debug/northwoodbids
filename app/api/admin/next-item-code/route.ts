import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { generateItemCode } from "@/lib/itemCode";

// Mint a fresh random, globally-unique item code to show staff BEFORE the item is
// created, so they can write it on the physical tag.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.orgMember.findFirst({ where: { clerkUserId: userId } });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const code = await generateItemCode();
  return NextResponse.json({ code });
}
