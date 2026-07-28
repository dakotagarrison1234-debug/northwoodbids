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

    const { status, stagedSpot } = await request.json();

    // ── STAGE (no status change) ─────────────────────────────────────────────
    // Gather the transfer's items and set them aside in a spot before load/drop-off
    // day — same as staging a pickup. Staging clears the gather checklist (the items
    // are now bundled together in the staged spot).
    if (stagedSpot !== undefined && status === undefined) {
      const spot = String(stagedSpot ?? "").trim();
      const stagePatch = spot
        ? { stagedSpot: spot, stagedAt: new Date() }
        : { stagedSpot: null, stagedAt: null };
      await prisma.$transaction([
        prisma.transferRequest.update({ where: { id }, data: stagePatch }),
        ...(spot ? [prisma.item.updateMany({ where: { transferRequestId: id }, data: { grabbedAt: null } })] : []),
      ]);
      return NextResponse.json({ success: true });
    }

    if (!["REQUESTED", "LOADED", "COMPLETED", "CANCELLED"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    // ── UNDO an accidental "loaded" — put it back to still-gathering. ──────────
    if (transfer.status === "LOADED" && status === "REQUESTED") {
      const claim = await prisma.transferRequest.updateMany({
        where: { id, status: "LOADED" },
        data: { status: "REQUESTED" },
      });
      if (claim.count === 0) {
        return NextResponse.json({ error: "This transfer is no longer marked loaded." }, { status: 409 });
      }
      return NextResponse.json({ success: true });
    }

    // ── UNDO a completed drop-off ────────────────────────────────────────────
    if (transfer.status === "COMPLETED" && status === "LOADED") {
      const snap = transfer.revertSnapshot as { itemId: string; locationId: string | null }[] | null;
      if (!snap || !Array.isArray(snap) || snap.length === 0) {
        return NextResponse.json(
          { error: "This drop-off was recorded before undo was supported, so it can't be reversed automatically." },
          { status: 422 }
        );
      }
      // Atomically claim the revert so two undos can't both run.
      const claim = await prisma.transferRequest.updateMany({
        where: { id, status: "COMPLETED" },
        data: { status: "LOADED", completedAt: null, revertSnapshot: Prisma.DbNull },
      });
      if (claim.count === 0) {
        return NextResponse.json({ error: "This drop-off was already undone." }, { status: 409 });
      }
      // Restore each item to its origin — but never drag back one the customer has
      // since collected, and tolerate an item that was deleted/relisted meanwhile.
      for (const s of snap) {
        await prisma.item.updateMany({
          where: { id: s.itemId, status: { not: "PICKED_UP" } },
          data: { locationId: s.locationId, transferRequestId: id, pickupAppointmentId: null },
        });
      }
      return NextResponse.json({ success: true, reverted: snap.length });
    }

    // Already terminal — quick refusal for the common (non-race) case.
    if (transfer.status === "COMPLETED" || transfer.status === "CANCELLED") {
      return NextResponse.json({ error: `This transfer is already ${transfer.status.toLowerCase()}.` }, { status: 409 });
    }

    if (status === "LOADED") {
      // Atomic: only a still-REQUESTED transfer can be loaded. A concurrent/repeat
      // request that lost the race is a harmless no-op.
      const claim = await prisma.transferRequest.updateMany({ where: { id, status: "REQUESTED" }, data: { status: "LOADED" } });
      // Loaded = it left the source, so the gather spot there is freed for the next
      // bundle. At the destination it'll be gathered/staged fresh.
      if (claim.count > 0) {
        await prisma.item.updateMany({ where: { transferRequestId: id }, data: { gatherSpot: null } });
      }
    } else if (status === "COMPLETED") {
      // CLAIM the completion atomically FIRST — this is what actually prevents a
      // double-click from sending the "arrived" SMS twice or snapshotting the wrong
      // (already-moved) locations. Only one request can flip REQUESTED/LOADED→COMPLETED.
      const claim = await prisma.transferRequest.updateMany({
        where: { id, status: { in: ["REQUESTED", "LOADED"] } },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      if (claim.count === 0) {
        return NextResponse.json({ error: "This transfer is already completed." }, { status: 409 });
      }
      // We own the completion. Items still carry transferRequestId, so notify + snapshot
      // read correct data before we move them.
      try {
        await notifyTransferArrived(id);
      } catch (e) {
        console.error("notifyTransferArrived failed (continuing):", e);
      }
      const moving = await prisma.item.findMany({ where: { transferRequestId: id }, select: { id: true, locationId: true } });
      const snapshot = moving.map((m) => ({ itemId: m.id, locationId: m.locationId }));
      await prisma.item.updateMany({
        where: { transferRequestId: id },
        data: { locationId: transfer.toLocationId, transferRequestId: null },
      });
      await prisma.transferRequest.update({
        where: { id },
        data: { revertSnapshot: snapshot, stagedSpot: null, stagedAt: null },
      });
      await attachToUpcomingAppointment(transfer.clerkUserId, transfer.organizationId);
    } else {
      // Cancelled: detach items, leaving their home location unchanged.
      const claim = await prisma.transferRequest.updateMany({
        where: { id, status: { in: ["REQUESTED", "LOADED"] } },
        data: { status: "CANCELLED", stagedSpot: null, stagedAt: null },
      });
      if (claim.count === 0) {
        return NextResponse.json({ error: "This transfer is already closed." }, { status: 409 });
      }
      await prisma.item.updateMany({ where: { transferRequestId: id }, data: { transferRequestId: null } });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/pickup/transfers/[id] PATCH]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
