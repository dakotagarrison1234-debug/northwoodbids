import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, getUserOrg } from "@/lib/auth";

// GET /api/admin/settings — return current org details (respects act-as cookie)
export async function GET() {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "No organization found" }, { status: 404 });

    const o = membership.organization;
    return NextResponse.json({
      org: {
        ...o,
        platformFeePercent: Number(o.platformFeePercent),
        taxPercent: Number(o.taxPercent),
      },
    });
  } catch (err) {
    console.error("[admin/settings GET]:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/settings — update org name, description, logoUrl
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { name, description, logoUrl, orgId, taxPercent, platformFeePercent, taxExempt } = body;

    if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

    if (!(await requireRole(orgId, ["OWNER", "ADMIN"]))) {
      return NextResponse.json(
        { error: "You don't have permission for this action" },
        { status: 403 }
      );
    }

    // Validate percent fields when provided: must be a finite number in 0–100.
    const percentFields: Record<string, unknown> = { taxPercent, platformFeePercent };
    for (const [field, raw] of Object.entries(percentFields)) {
      if (raw === undefined) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return NextResponse.json(
          { error: `Please enter ${field === "taxPercent" ? "a sales tax" : "a buyer's premium"} between 0 and 100.` },
          { status: 400 }
        );
      }
    }
    if (taxExempt !== undefined && typeof taxExempt !== "boolean") {
      return NextResponse.json({ error: "Invalid tax-exempt value" }, { status: 400 });
    }

    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description.trim() || null }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(taxPercent !== undefined && { taxPercent: Number(taxPercent) }),
        ...(platformFeePercent !== undefined && { platformFeePercent: Number(platformFeePercent) }),
        ...(taxExempt !== undefined && { taxExempt }),
      },
    });

    return NextResponse.json({
      success: true,
      org: {
        ...updated,
        platformFeePercent: Number(updated.platformFeePercent),
        taxPercent: Number(updated.taxPercent),
      },
    });
  } catch (err) {
    console.error("[admin/settings PATCH]:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
