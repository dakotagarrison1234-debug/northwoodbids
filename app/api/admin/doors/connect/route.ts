export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getUserOrg, requireRole } from "@/lib/auth";
import { createConnectWebview, seamConfigured } from "@/lib/doorLock";
import { APP_URL } from "@/lib/paymentNotify";

/**
 * POST /api/admin/doors/connect — a one-time hosted page (Seam Connect Webview)
 * where the owner signs in to the Schlage Home account. When it finishes, Seam
 * bounces back to Settings → Doors and the locks show up after "Find my locks".
 */
export async function POST() {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!(await requireRole(membership.organizationId, ["OWNER", "ADMIN"]))) {
      return NextResponse.json({ error: "Owner or admin only" }, { status: 403 });
    }
    if (!seamConfigured()) return NextResponse.json({ error: "Add SEAM_API_KEY first." }, { status: 422 });
    const { url } = await createConnectWebview(`${APP_URL}/admin/settings/doors?connected=1`);
    return NextResponse.json({ url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/doors/connect]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
