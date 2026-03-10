import { NextRequest, NextResponse } from "next/server";

const X402_URL = process.env.X402_SERVER_URL || "http://localhost:4021";

const ACTION_PATHS: Record<string, { method: string; path: string }> = {
  market: { method: "GET", path: "/kamino/market" },
  obligation: { method: "GET", path: "/kamino/obligation" },
  "deposit-collateral": { method: "POST", path: "/kamino/deposit-collateral" },
  borrow: { method: "POST", path: "/kamino/borrow" },
  repay: { method: "POST", path: "/kamino/repay" },
  "withdraw-collateral": { method: "POST", path: "/kamino/withdraw-collateral" },
};

async function handle(req: NextRequest, isPost: boolean) {
  const action = req.nextUrl.searchParams.get("action") || "market";
  const route = ACTION_PATHS[action];
  if (!route) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  try {
    const wallet = req.nextUrl.searchParams.get("wallet");
    const url = new URL(`${X402_URL}${route.path}`);
    if (wallet) url.searchParams.set("wallet", wallet);

    const opts: RequestInit = { method: route.method, headers: { "Content-Type": "application/json" } };
    if (isPost && route.method === "POST") {
      opts.body = JSON.stringify(await req.json());
    }
    const res = await fetch(url.toString(), opts);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function GET(req: NextRequest) { return handle(req, false); }
export async function POST(req: NextRequest) { return handle(req, true); }
