import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";

interface Props {
  params: Promise<{ id: string }>;
}

// PATCH /api/superadmin/applications/[id]
// body: { action: "approve" | "reject", reviewNote?: string }
export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    await requireSuperAdmin();
    const { userId } = await auth();
    const { id } = await params;
    const { action, reviewNote, taxExempt, taxPercent } = await request.json();

    const application = await prisma.orgApplication.findUnique({ where: { id } });
    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
    if (application.status !== "PENDING") {
      return NextResponse.json({ error: "Application already reviewed" }, { status: 409 });
    }

    if (action === "reject") {
      await prisma.orgApplication.update({
        where: { id },
        data: { status: "REJECTED", reviewedBy: userId!, reviewNote: reviewNote || null },
      });
      return NextResponse.json({ success: true, status: "REJECTED" });
    }

    if (action === "approve") {
      // Validate tax fields
      const isExempt = taxExempt !== false; // default true
      if (!isExempt) {
        const rate = Number(taxPercent);
        if (isNaN(rate) || rate < 0 || rate > 100) {
          return NextResponse.json({ error: "taxPercent must be between 0 and 100 when org is not exempt" }, { status: 400 });
        }
      }
      const resolvedTaxPercent = isExempt ? 0 : Number(taxPercent ?? 0);

      // Check user doesn't already have an org
      const existingMember = await prisma.orgMember.findFirst({
        where: { clerkUserId: application.clerkUserId },
      });
      if (existingMember) {
        return NextResponse.json({ error: "User already belongs to an organization" }, { status: 409 });
      }

      // Ensure slug uniqueness
      const slugExists = await prisma.organization.findUnique({ where: { slug: application.slug } });
      const finalSlug = slugExists ? `${application.slug}-${Date.now()}` : application.slug;

      // Create org + owner membership in a transaction
      const org = await prisma.$transaction(async (tx) => {
        const newOrg = await tx.organization.create({
          data: {
            name: application.orgName,
            slug: finalSlug,
            description: application.description,
            isActive: true,
            taxExempt: isExempt,
            taxPercent: resolvedTaxPercent,
            // Direct-payment model: payments run on the single platform Stripe
            // account (always active), so the org can accept payments immediately
            // with no platform fee taken from sales.
            status: "LIVE",
            platformFeePercent: 0,
            stripeChargesEnabled: true,
            stripePayoutsEnabled: true,
            stripeDetailsSubmitted: true,
            members: {
              create: { clerkUserId: application.clerkUserId, role: "OWNER" },
            },
          },
        });
        await tx.orgApplication.update({
          where: { id },
          data: { status: "APPROVED", reviewedBy: userId!, reviewNote: reviewNote || null },
        });
        return newOrg;
      });

      return NextResponse.json({ success: true, status: "APPROVED", org });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[superadmin/applications PATCH]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
