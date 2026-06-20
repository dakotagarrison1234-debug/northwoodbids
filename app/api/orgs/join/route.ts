import { auth, currentUser } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST — accept an org invite by token
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { token } = await request.json();
    if (!token) return NextResponse.json({ error: "Token is required" }, { status: 400 });

    const invite = await prisma.orgInvite.findUnique({
      where: { token },
      include: { organization: true },
    });

    if (!invite) return NextResponse.json({ error: "Invalid invite link." }, { status: 404 });
    if (invite.accepted) return NextResponse.json({ error: "This invite has already been used." }, { status: 409 });
    if (invite.expiresAt < new Date()) return NextResponse.json({ error: "This invite has expired." }, { status: 410 });

    // The invite is only valid for the email address it was sent to.
    // Compare against the signed-in user's Clerk email addresses so a
    // forwarded link can't grant staff/admin access to someone else.
    const user = await currentUser();
    const userEmails = (user?.emailAddresses ?? []).map((e) => e.emailAddress.toLowerCase());
    if (!userEmails.includes(invite.email.toLowerCase())) {
      return NextResponse.json(
        { error: `This invite was sent to ${invite.email}. Sign in with that email address to accept it.` },
        { status: 403 }
      );
    }

    // Check user doesn't already belong to an org
    const existingMember = await prisma.orgMember.findFirst({
      where: { clerkUserId: userId },
    });
    if (existingMember) {
      return NextResponse.json({ error: "You already belong to an organization." }, { status: 409 });
    }

    // Accept invite
    try {
      await prisma.$transaction([
        prisma.orgMember.create({
          data: {
            clerkUserId: userId,
            organizationId: invite.organizationId,
            role: invite.role,
          },
        }),
        prisma.orgInvite.update({
          where: { token },
          data: { accepted: true, clerkUserId: userId },
        }),
      ]);
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "P2002") {
        return NextResponse.json({ success: true, message: "Already a member" });
      }
      throw e;
    }

    return NextResponse.json({ success: true, orgSlug: invite.organization.slug });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[orgs/join POST]:", msg, err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
