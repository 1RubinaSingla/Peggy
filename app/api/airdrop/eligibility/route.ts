// GET /api/airdrop/eligibility?wallet=<addr>
// Public read-only check. Reports whether the wallet is currently in the
// reward tiers and whether it has already claimed. No signature required —
// the actual transfer endpoint re-verifies everything.

import { NextRequest } from "next/server";
import { checkEligibility } from "../../../../src/airdrop.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOLANA_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim();
  if (!wallet || !SOLANA_ADDR.test(wallet)) {
    return Response.json({ error: "invalid wallet" }, { status: 400 });
  }
  const result = await checkEligibility(wallet);
  return Response.json(result);
}
