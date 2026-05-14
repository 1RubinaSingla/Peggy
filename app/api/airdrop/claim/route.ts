// POST /api/airdrop/claim
// Body: { wallet: string, ts: number, signature: string (bs58) }
//
// Security flow:
//   1. Validate wallet shape + body shape
//   2. Rate-limit by IP (5 attempts / 60s)
//   3. Verify the ed25519 signature against the canonical claim message
//      (we reconstruct the message from wallet + ts; we never trust client text)
//   4. Re-check live leaderboard eligibility + claim status
//   5. Atomic Redis lock per wallet
//   6. Execute the SPL transfer from the dev signer wallet
//   7. Record the claim permanently on success

import { NextRequest } from "next/server";
import { executeClaim, getAirdropConfig } from "../../../../src/airdrop.ts";
import { cacheGet, cacheSet } from "../../../../src/cache.ts";
import { verifyClaimSignature } from "../../../../src/wallet-sig.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SOLANA_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const RATE_WINDOW_SECONDS = 60;
const RATE_LIMIT = 5;

async function rateLimit(ip: string): Promise<{ ok: boolean; remaining: number }> {
  const key = `airdrop:rate:${ip}`;
  const current = (await cacheGet<{ count: number; resetAt: number }>(key)) ?? null;
  const now = Date.now();
  if (!current || current.resetAt < now) {
    await cacheSet(key, { count: 1, resetAt: now + RATE_WINDOW_SECONDS * 1000 }, RATE_WINDOW_SECONDS);
    return { ok: true, remaining: RATE_LIMIT - 1 };
  }
  if (current.count >= RATE_LIMIT) return { ok: false, remaining: 0 };
  const next = { count: current.count + 1, resetAt: current.resetAt };
  const ttl = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  await cacheSet(key, next, ttl);
  return { ok: true, remaining: RATE_LIMIT - next.count };
}

export async function POST(req: NextRequest) {
  const cfg = getAirdropConfig();
  if (!cfg.enabled) {
    return Response.json({ ok: false, reason: "airdrop not configured" }, { status: 503 });
  }

  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "anon").trim();
  const limit = await rateLimit(ip);
  if (!limit.ok) {
    return Response.json({ ok: false, reason: "rate limit exceeded" }, { status: 429 });
  }

  let body: { wallet?: unknown; ts?: unknown; signature?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, reason: "invalid json body" }, { status: 400 });
  }

  const wallet = typeof body.wallet === "string" ? body.wallet.trim() : "";
  const ts = typeof body.ts === "number" ? body.ts : NaN;
  const signature = typeof body.signature === "string" ? body.signature.trim() : "";

  if (!wallet || !SOLANA_ADDR.test(wallet)) {
    return Response.json({ ok: false, reason: "invalid wallet" }, { status: 400 });
  }
  if (!signature || !Number.isFinite(ts)) {
    return Response.json({ ok: false, reason: "missing ts or signature" }, { status: 400 });
  }

  const sigCheck = verifyClaimSignature(wallet, ts, signature);
  if (!sigCheck.ok) {
    return Response.json({ ok: false, reason: sigCheck.reason }, { status: 401 });
  }

  const result = await executeClaim(wallet);
  if (!result.ok) {
    return Response.json({ ok: false, reason: result.reason }, { status: result.status });
  }
  return Response.json({
    ok: true,
    txSignature: result.txSignature,
    amount: result.amount,
    rank: result.rank,
  });
}
