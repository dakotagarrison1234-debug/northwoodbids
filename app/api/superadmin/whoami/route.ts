import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Visit /api/superadmin/whoami while signed in to get your Clerk user ID.
// Add it to SUPER_ADMIN_IDS in your .env.local and Vercel env vars.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ clerkUserId: userId });
}
