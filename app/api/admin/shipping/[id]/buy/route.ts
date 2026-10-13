export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireShipAdmin, forbidden, notFound, loadBundle } from "../../_lib";
import { buyBundle } from "../../_actions";

interface Props { params: Promise<{ id: string }> }

/**
 * POST /api/admin/shipping/[id]/buy — buy the cheapest ground rate on the
 * shipment created by /rate. No body.
 *
 * Stores labelCostCents / carrier / service / trackingCode / trackingUrl /
 * labelUrl / easypostTrackerId, status SHIPPED + shippedAt + packedBy, marks
 * the lots PICKED_UP (they leave every pickup list) and texts the buyer the
 * tracking link. Idempotent: a box that's already SHIPPED returns its label.
 * Logic: buyBundle in ../../_actions.ts (shared with POST /api/admin/shipping/bulk).
 *
 * → { ok: true, label: { labelUrl, trackingCode, trackingUrl, carrier, service, serviceLabel, costCents },
 *     chargedCents, spreadCents, texted: boolean, bundle }
 */
export async function POST(_request: NextRequest, { params }: Props) {
  const membership = await requireShipAdmin();
  if (!membership) return forbidden();
  const orgId = membership.organizationId;
  const { id } = await params;

  const bundle = await loadBundle(id, orgId);
  if (!bundle) return notFound();

  const out = await buyBundle(bundle, orgId, membership.clerkUserId);
  return NextResponse.json(out.body, { status: out.status });
}
