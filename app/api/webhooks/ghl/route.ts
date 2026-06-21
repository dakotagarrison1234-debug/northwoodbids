import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  // Fail closed: require a shared secret before processing anything.
  const expected = process.env.GHL_WEBHOOK_SECRET;
  const headerSecret = request.headers.get("x-webhook-secret");
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const provided = headerSecret ?? bearer;

  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await request.json();
    console.log("GHL webhook received");
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
}
