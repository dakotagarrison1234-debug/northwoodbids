export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/pickup/[id]/collect
 *
 * The customer confirming they've taken their order. Does exactly what staff's
 * "Order picked up" does — items become PICKED_UP, the appointment is COLLECTED,
 * and the staged spot is cleared so that box is free for the next order.
 *
 * Only ever touches the caller's OWN appointment, and only one that's still
 * SCHEDULED, so it can't re-collect or be aimed at somebody else's pickup.
 */
export async function POST(_request: NextRequest, { params }: Props) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const appt = await prisma.pickupAppointment.findUnique({ where: { id } });
    if (!appt || appt.clerkUserId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Atomic claim — a double-tap can't run the item updates twice.
    const claimed = await prisma.pickupAppointment.updateMany({
      where: { id, clerkUserId: userId, status: "SCHEDULED" },
      data: { status: "COLLECTED", stagedSpot: null, stagedAt: null },
    });
    if (claimed.count === 0) {
      return NextResponse.json(
        { error: "This pickup is already marked complete." },
        { status: 409 }
      );
    }

    await prisma.item.updateMany({
      where: { pickupAppointmentId: id },
      data: { status: "PICKED_UP", pickedUpAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[pickup/[id]/collect]:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
