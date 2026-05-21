// GET /api/airdrop/debug
//
// Diagnostic endpoint. Reports which AIRDROP_* env vars are *present* (booleans
// only — never the values) and the most recent config-parse error message, so
// operators can see what's wrong without digging through Vercel logs.
//
// Safe to leave deployed: returns no secret values, no PII, no on-chain state.

import { getAirdropConfig, getLastConfigError } from "../../../../src/airdrop.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValue(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

export async function GET() {
  // Touch the config so the cache + lastConfigError are populated.
  const cfg = getAirdropConfig();

  const envVars = {
    AIRDROP_ENABLED: process.env.AIRDROP_ENABLED ?? null,
    AIRDROP_TOKEN_MINT: hasValue("AIRDROP_TOKEN_MINT"),
    AIRDROP_TOKEN_DECIMALS: hasValue("AIRDROP_TOKEN_DECIMALS"),
    AIRDROP_TOKEN_SYMBOL: hasValue("AIRDROP_TOKEN_SYMBOL"),
    AIRDROP_BASE_AMOUNT: hasValue("AIRDROP_BASE_AMOUNT"),
    AIRDROP_SIGNER_SECRET_KEY: hasValue("AIRDROP_SIGNER_SECRET_KEY"),
    SOLANA_RPC_URL: hasValue("SOLANA_RPC_URL"),
  };

  // Surface only the LENGTH of the signer key so we can spot truncation /
  // accidental whitespace without revealing the key itself.
  const signerKeyLength = process.env.AIRDROP_SIGNER_SECRET_KEY?.length ?? 0;
  const mintLength = process.env.AIRDROP_TOKEN_MINT?.length ?? 0;

  return Response.json({
    enabled: cfg.enabled,
    tokenSymbol: cfg.tokenSymbol,
    lastConfigError: getLastConfigError(),
    envVarsPresent: envVars,
    lengths: {
      // base58 of a 64-byte secret key is typically 87–88 chars.
      signerSecretKey: signerKeyLength,
      // Solana mint address: 32–44 base58 chars.
      tokenMint: mintLength,
    },
  });
}
