import { NextResponse } from "next/server";

const X402_URL = process.env.X402_SERVER_URL || "http://localhost:4021";

export async function GET() {
  try {
    const res = await fetch(`${X402_URL}/health`, { next: { revalidate: 10 } });
    if (!res.ok) throw new Error(`x402 returned ${res.status}`);
    const data = await res.json();
    return NextResponse.json({
      status: data.status,
      service: data.service,
      network: data.network,
      gatedCount: Object.keys(data.endpoints?.gated || {}).length,
      freeCount: Object.keys(data.endpoints?.free || {}).length,
    });
  } catch {
    return NextResponse.json({ status: "unreachable", gatedCount: 0, freeCount: 0 }, { status: 503 });
  }
}
