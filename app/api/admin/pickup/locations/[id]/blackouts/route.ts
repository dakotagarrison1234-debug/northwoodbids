export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserOrg } from "@/lib/auth";

interface Props {
  params: Promise<{ id: string }>;
}

// Parse a "YYYY-MM-DD" day into a UTC-midnight Date (stored as @db.Date).
function parseDay(s: unknown): Date | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return isNaN(dt.getTime()) ? null : dt;
}

// POST /api/admin/pickup/locations/[id]/blackouts — block off a date range (vacation/holiday)
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const membership = await getUserOrg();
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const location = await prisma.pickupLocation.findUnique({ where: { id } });
    if (!location || location.organizationId !== membership.organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await request.json();
    const start = parseDay(body.startDate);
    // A single-day block can omit endDate (defaults to start).
    const end = body.endDate ? parseDay(body.endDate) : start;
    if (!start || !end) {
      return NextResponse.json({ error: "Pick valid dates." }, { status: 400 });
    }
    if (end < start) {
      return NextResponse.json({ error: "The end date must be on or after the start date." }, { status: 400 });
    }

    const blackout = await prisma.pickupBlackout.create({
      data: {
        locationId: id,
        startDate: start,
        endDate: end,
        reason: typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 120) : null,
      },
    });

    return NextResponse.json({ success: true, blackout });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/pickup/locations/[id]/blackouts POST]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
