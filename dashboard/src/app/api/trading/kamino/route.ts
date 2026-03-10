import { NextRequest, NextResponse } from "next/server";

const X402_URL = process.env.X402_SERVER_URL || "http://localhost:4021";

/** POST — deposit or withdraw */
export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");
  const body = await req.json();
  try {
    const path = action === "withdraw" ? "/kamino/withdraw" : "/kamino/deposit";
    const res = await fetch(`${X402_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
