export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getUserOrg } from "@/lib/auth";
import { attachToUpcomingAppointment } from "@/lib/pickup";
import { notifyTransferArrived } from "@/lib/transferNotify";

interface Props {
  params: Promise<{ id: string }>;
}

// PATCH /api/admin/pickup/transfers/[id] — advance a transfer through its stages
// (LOADED → in transit, COMPLETED → dropped off, CANCELLED → aborted)
export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const transfer = await prisma.transferRequest.findUnique({ where: { id } });
    if (!transfer || transfer.organizationId !== membership.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { status } = await request.json();
    if (!["LOADED", "COMPLETED", "CANCELLED"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // ── UNDO a completed drop-off ────────────────────────────────────────────
    // Completing a transfer overwrites each item's home location and unlinks it,
    // so undoing needs the snapshot we took at drop-off. Per-item, because one
    // transfer can gather items from more than one warehouse.
    if (transfer.status === "COMPLETED" && status === "LOADED") {
      const snap = transfer.revertSnapshot as { itemId: string; locationId: string | null }[] | null;
      if (!snap || !Array.isArray(snap) || snap.length === 0) {
        return NextResponse.json(
          { error: "This drop-off was recorded before undo was supported, so it can't be reversed automatically." },
          { status: 422 }
        );
      }

      await prisma.$transaction([
        ...snap.map((s) =>
          prisma.item.update({
            where: { id: s.itemId },
            data: {
              locationId: s.locationId,
              transferRequestId: id,
              // The item is going back to the origin warehouse, so it can't be
              // collected at the destination — drop it off any appointment the
              // drop-off auto-attached it to.
              pickupAppointmentId: null,
            },
          })
        ),
        prisma.transferRequest.update({
          where: { id },
          data: { status: "LOADED", completedAt: null, revertSnapshot: Prisma.DbNull },
        }),
      ]);

      return NextResponse.json({ success: true, reverted: snap.length });
    }

    // Already terminal — refuse so a double-click / stale tab can't re-run the
    // relocation or re-send the "items arrived" SMS.
    if (transfer.status === "COMPLETED" || transfer.status === "CANCELLED") {
      return NextResponse.json({ error: `This transfer is already ${transfer.status.toLowerCase()}.` }, { status: 409 });
    }
    // No-op guard for repeated LOADED.
    if (status === "LOADED" && transfer.status === "LOADED") {
      return NextResponse.json({ success: true });
    }

    if (status === "LOADED") {
      // Items have been loaded and are in transit.
      await prisma.transferRequest.update({
        where: { id },
        data: { status: "LOADED" },
      });
    } else if (status === "COMPLETED") {
      // Notify the bidder BEFORE detaching items — the webhook reads the transfer's
      // items, which get cleared by the relocation mutation below. A notify failure
      // must NOT block the drop-off, so it's best-effort.
      try {
        await notifyTransferArrived(id);
      } catch (e) {
        console.error("notifyTransferArrived failed (continuing):", e);
      }

      // Record where each item lived BEFORE we move it — this is the only chance
      // to capture it, and it's what makes an accidental drop-off reversible.
      const moving = await prisma.item.findMany({
        where: { transferRequestId: id },
        select: { id: true, locationId: true },
      });
      const snapshot = moving.map((m) => ({ itemId: m.id, locationId: m.locationId }));

      // Items have arrived: set their home location to the destination, detach transfer.
      await prisma.item.updateMany({
        where: { transferRequestId: id },
        data: { locationId: transfer.toLocationId, transferRequestId: null },
      });
      await prisma.transferRequest.update({
        where: { id },
        data: { status: "COMPLETED", completedAt: new Date(), revertSnapshot: snapshot },
      });

      // Fold the arrived items into the bidder's upcoming appointment at this
      // location, if they already have one.
      await attachToUpcomingAppointment(transfer.clerkUserId, transfer.organizationId);
    } else {
      // Cancelled: detach items, leaving their home location unchanged.
      await prisma.item.updateMany({
        where: { transferRequestId: id },
        data: { transferRequestId: null },
      });
      await prisma.transferRequest.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/pickup/transfers/[id] PATCH]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
