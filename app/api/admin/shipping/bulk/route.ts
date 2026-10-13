export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { easypostConfigured, EASYPOST_UNSET_MESSAGE } from "@/lib/easypost";
import { requireShipAdmin, forbidden, loadBundle } from "../_lib";
import { rateBundle, buyBundle, type RateView, type BuyOk } from "../_actions";

/**
 * POST /api/admin/shipping/bulk — Rate all / Buy all on the Ship board.
 * Body: { action: "rate" | "buy", ids: string[], pack?: { [id]: { boxCode, weightOz } } }
 *
 * Runs the boxes one at a time (EasyPost rate limits), at most 25 per call —
 * the page sends more as several calls. One box failing never fails the call:
 * every id comes back with ok true/false and its own error.
 *
 * rate — same as POST [id]/rate for each box. Dims + weight come from `pack[id]`
 *        (what's typed on the card right now), else the box's packedBoxCode /
 *        packedWeightOz (its last rate), else the engine's boxCode / weightOz.
 * buy  — same as POST [id]/buy, but only for boxes that already have a shipment
 *        (a rate); the rest are skipped with a reason instead of bought blind.
 *
 * → { results: [{ id, ok, error?,
 *                 rate?, chargedCents?, spreadCents?, packedBoxCode?, packedWeightOz?,   // rate
 *                 label?, texted?, bundle? }] }                                           // buy
 */
const MAX_IDS = 25;

type BulkResult = {
  id: string;
  ok: boolean;
  error?: string;
  rate?: RateView;
  chargedCents?: number;
  spreadCents?: number;
  packedBoxCode?: string;
  packedWeightOz?: number;
  label?: BuyOk["label"];
  texted?: boolean;
  bundle?: BuyOk["bundle"];
};

export async function POST(request: NextRequest) {
  const membership = await requireShipAdmin();
  if (!membership) return forbidden();
  const orgId = membership.organizationId;

  const body = await request.json().catch(() => ({})) as { action?: unknown; ids?: unknown; pack?: unknown };
  const action = body.action === "rate" || body.action === "buy" ? body.action : null;
  if (!action) return NextResponse.json({ error: "action must be \"rate\" or \"buy\"." }, { status: 400 });
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.filter((x): x is string => typeof x === "string" && x.length > 0))] : [];
  if (ids.length === 0) return NextResponse.json({ error: "Pick at least one box." }, { status: 400 });
  if (ids.length > MAX_IDS) return NextResponse.json({ error: `At most ${MAX_IDS} boxes per call.` }, { status: 400 });
  if (!easypostConfigured()) return NextResponse.json({ error: EASYPOST_UNSET_MESSAGE }, { status: 409 });

  const pack = (body.pack && typeof body.pack === "object" ? body.pack : {}) as Record<string, { boxCode?: unknown; weightOz?: unknown } | undefined>;

  const results: BulkResult[] = [];
  for (const id of ids) {
    try {
      const bundle = await loadBundle(id, orgId);
      if (!bundle) { results.push({ id, ok: false, error: "Box not found." }); continue; }

      if (action === "rate") {
        const typed = pack[id];
        const boxCode = typeof typed?.boxCode === "string" ? typed.boxCode : (bundle.packedBoxCode ?? bundle.boxCode);
        const weightOz = typeof typed?.weightOz === "number" ? typed.weightOz : (bundle.packedWeightOz ?? bundle.weightOz);
        const out = await rateBundle(bundle, { boxCode: boxCode ?? "", weightOz }, orgId);
        if (out.ok) results.push({ id, ok: true, rate: out.body.rate, chargedCents: out.body.chargedCents, spreadCents: out.body.spreadCents, packedBoxCode: boxCode ?? undefined, packedWeightOz: weightOz });
        else results.push({ id, ok: false, error: out.body.error });
      } else {
        if (!bundle.easypostShipmentId) { results.push({ id, ok: false, error: "No rate yet — Rate all first." }); continue; }
        const out = await buyBundle(bundle, orgId, membership.clerkUserId);
        if (out.ok) results.push({ id, ok: true, label: out.body.label, texted: out.body.texted, bundle: out.body.bundle });
        else results.push({ id, ok: false, error: out.body.error });
      }
    } catch (e) {
      console.error(`[admin/shipping/bulk ${action}] ${id}:`, e);
      results.push({ id, ok: false, error: e instanceof Error ? e.message : "Something went wrong." });
    }
  }

  return NextResponse.json({ results });
}
