export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { easypostConfigured, EASYPOST_UNSET_MESSAGE } from "@/lib/easypost";
import { requireShipAdmin, forbidden, notFound, loadBundle } from "../../_lib";
import { parseRateInput, rateBundle } from "../../_actions";

interface Props { params: Promise<{ id: string }> }

/**
 * POST /api/admin/shipping/[id]/rate
 * Body: { boxCode: string; weightOz: number }   — what the packer actually used
 *
 * Creates the EasyPost shipment (box dims + packed weight, to the frozen ship
 * address, from the box's own warehouse), stores easypostShipmentId / packedWeightOz /
 * packedBoxCode, and returns the cheapest ground rate next to what the buyer
 * was charged. If the box already has a shipment, it's checked first: one with
 * a bought label is never replaced (409 — tap Buy label, which stores it); one
 * without a label is simply superseded by a fresh shipment. Logic: rateBundle
 * in ../../_actions.ts (shared with POST /api/admin/shipping/bulk).
 *
 * { ok: true,
 *   rate: { id, carrier, service, label, cents, days },
 *   chargedCents, spreadCents,            // spread = charged - label cost
 *   rates: [{ carrier, service, label, cents, days }] }   // every allowed ground rate, cheapest first
 *
 * Errors: 409 not configured / not PACKING, 422 no ground rate (carrier messages), 502 EasyPost.
 */
export async function POST(request: NextRequest, { params }: Props) {
  const membership = await requireShipAdmin();
  if (!membership) return forbidden();
  const orgId = membership.organizationId;
  const { id } = await params;
  if (!easypostConfigured()) return NextResponse.json({ error: EASYPOST_UNSET_MESSAGE }, { status: 409 });

  const body = await request.json().catch(() => ({})) as { boxCode?: unknown; weightOz?: unknown };
  const input = parseRateInput(body);
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

  const bundle = await loadBundle(id, orgId);
  if (!bundle) return notFound();

  const out = await rateBundle(bundle, input, orgId);
  return NextResponse.json(out.body, { status: out.status });
}
