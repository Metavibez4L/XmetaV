import { NextRequest, NextResponse } from "next/server";

const X402_URL = process.env.X402_SERVER_URL || "http://localhost:4021";

/** GET — queue stats + vaults */
export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");
  try {
    if (action === "vaults") {
      const res = await fetch(`${X402_URL}/cross-chain/vaults`);
      if (!res.ok) throw new Error(`vaults: ${res.status}`);
      return NextResponse.json(await res.json());
    }
    // default: queue stats
    const res = await fetch(`${X402_URL}/cross-chain/queue`);
    if (!res.ok) throw new Error(`queue: ${res.status}`);
    return NextResponse.json(await res.json());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

/** POST — swap or quote */
export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");
  const body = await req.json();
  try {
    const path = action === "quote" ? "/cross-chain-swap/quote" : "/cross-chain-swap";
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
