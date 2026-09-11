export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

/** GET /api/watchlist — ids of every lot this bidder is watching (for star state). */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ids: [] });
  const rows = await prisma.watchlistItem.findMany({
    where: { clerkUserId: userId },
    select: { itemId: true },
  });
  return NextResponse.json({ ids: rows.map((r) => r.itemId) });
}

/** POST /api/watchlist { itemId } — start watching a lot (idempotent). */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to watch items." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const itemId = String(body.itemId ?? "").trim();
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  const item = await prisma.item.findUnique({ where: { id: itemId }, select: { id: true, status: true } });
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  await prisma.watchlistItem.upsert({
    where: { clerkUserId_itemId: { clerkUserId: userId, itemId } },
    update: {},
    create: { clerkUserId: userId, itemId },
  });
  return NextResponse.json({ success: true, watched: true });
}

/** DELETE /api/watchlist?itemId=… — stop watching a lot. */
export async function DELETE(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const itemId = request.nextUrl.searchParams.get("itemId");
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

  await prisma.watchlistItem.deleteMany({ where: { clerkUserId: userId, itemId } });
  return NextResponse.json({ success: true, watched: false });
}
