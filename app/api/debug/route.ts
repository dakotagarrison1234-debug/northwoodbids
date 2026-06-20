import { NextResponse } from "next/server";

// This endpoint has been disabled for security reasons.
export async function GET() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
