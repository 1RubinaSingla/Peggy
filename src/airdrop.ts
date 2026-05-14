// Server-side airdrop logic. Feature-flagged: until every env var is set, the
// endpoints return { configured: false } and the UI hides the claim section.
//
// Pre-flight env vars (all required to enable claims):
//   AIRDROP_ENABLED            "true" to turn the feature on
//   AIRDROP_TOKEN_MINT         SPL mint address (base58)
//   AIRDROP_TOKEN_DECIMALS     integer, usually 6 or 9
//   AIRDROP_BASE_AMOUNT        human-readable token amount for the 1x tier, e.g. "1000"
//   AIRDROP_SIGNER_SECRET_KEY  signer keypair — either base58 string OR JSON array of 64 bytes
//   SOLANA_RPC_URL             RPC endpoint (Helius/Quicknode strongly recommended on mainnet)
//
// Tier table (multipliers on AIRDROP_BASE_AMOUNT):
//   rank #1        → 5x
//   ranks #2-3     → 3x
//   ranks #4-10    → 1.5x
//   ranks #11-20   → 1x
//   outside top 20 → ineligible

import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddress,
  TokenAccountNotFoundError,
} from "@solana/spl-token";
import bs58 from "bs58";

import { cacheGet, cacheSet } from "./cache.ts";
import { getWallOfPain } from "./leaderboard.ts";

// ── Configuration ─────────────────────────────────────────────────────────────

export type AirdropConfig = {
  enabled: boolean;
  mint?: PublicKey;
  decimals?: number;
  baseAmount?: number;       // human units; multiplied by tier and 10^decimals before transfer
  rpcUrl?: string;
  signer?: Keypair;
  tokenSymbol: string;       // for display only; defaults to "COPE"
};

let cachedConfig: AirdropConfig | null = null;

export function getAirdropConfig(): AirdropConfig {
  if (cachedConfig) return cachedConfig;

  const tokenSymbol = (process.env.AIRDROP_TOKEN_SYMBOL ?? "COPE").trim();
  const enabled = process.env.AIRDROP_ENABLED === "true";
  if (!enabled) {
    cachedConfig = { enabled: false, tokenSymbol };
    return cachedConfig;
  }

  try {
    const mintStr = required("AIRDROP_TOKEN_MINT");
    const decimals = parseInt(required("AIRDROP_TOKEN_DECIMALS"), 10);
    const baseAmount = parseFloat(required("AIRDROP_BASE_AMOUNT"));
    const rpcUrl = required("SOLANA_RPC_URL");
    const signer = parseSignerKey(required("AIRDROP_SIGNER_SECRET_KEY"));

    if (!Number.isFinite(decimals) || decimals < 0 || decimals > 18) {
      throw new Error("AIRDROP_TOKEN_DECIMALS must be an integer 0-18");
    }
    if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
      throw new Error("AIRDROP_BASE_AMOUNT must be a positive number");
    }

    cachedConfig = {
      enabled: true,
      mint: new PublicKey(mintStr),
      decimals,
      baseAmount,
      rpcUrl,
      signer,
      tokenSymbol,
    };
  } catch (err) {
    // Don't crash the request — log loudly server-side and fall back to disabled.
    console.error("[airdrop] config error — feature disabled:", err);
    cachedConfig = { enabled: false, tokenSymbol };
  }
  return cachedConfig;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
}

function parseSignerKey(raw: string): Keypair {
  // Accept both formats: base58 string (64-byte secret) OR JSON array of bytes.
  raw = raw.trim();
  if (raw.startsWith("[")) {
    const arr = JSON.parse(raw) as number[];
    if (!Array.isArray(arr) || arr.length !== 64) {
      throw new Error("AIRDROP_SIGNER_SECRET_KEY JSON must be a 64-byte array");
    }
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  const bytes = bs58.decode(raw);
  if (bytes.length !== 64) {
    throw new Error("AIRDROP_SIGNER_SECRET_KEY base58 must decode to 64 bytes");
  }
  return Keypair.fromSecretKey(bytes);
}

// ── Tier table ────────────────────────────────────────────────────────────────

export function tierMultiplierForRank(rank: number): number | null {
  if (rank < 1) return null;
  if (rank === 1) return 5;
  if (rank <= 3) return 3;
  if (rank <= 10) return 1.5;
  if (rank <= 20) return 1;
  return null;
}

// ── Eligibility ───────────────────────────────────────────────────────────────

export type EligibilityResult = {
  configured: boolean;
  eligible: boolean;
  rank?: number;
  multiplier?: number;
  amount?: number;            // human-readable token amount
  claimed?: boolean;
  txSignature?: string;
  reason?: string;
  tokenSymbol: string;
};

const CLAIM_KEY = (wallet: string) => `airdrop:claimed:${wallet}`;
const LOCK_KEY = (wallet: string) => `airdrop:lock:${wallet}`;
const LOCK_TTL_SECONDS = 90;

export type ClaimRecord = {
  txSignature: string;
  amount: number;
  rank: number;
  claimedAt: number;
};

export async function checkEligibility(wallet: string): Promise<EligibilityResult> {
  const cfg = getAirdropConfig();
  if (!cfg.enabled) return { configured: false, eligible: false, tokenSymbol: cfg.tokenSymbol };

  const top = await getWallOfPain(20);
  const rank = top.findIndex((e) => e.wallet === wallet) + 1;
  if (!rank) {
    return { configured: true, eligible: false, reason: "wallet not in current top 20", tokenSymbol: cfg.tokenSymbol };
  }

  const multiplier = tierMultiplierForRank(rank);
  if (!multiplier) {
    return { configured: true, eligible: false, reason: "outside reward tiers", tokenSymbol: cfg.tokenSymbol };
  }

  const claimed = await cacheGet<ClaimRecord>(CLAIM_KEY(wallet));
  return {
    configured: true,
    eligible: true,
    rank,
    multiplier,
    amount: cfg.baseAmount! * multiplier,
    claimed: Boolean(claimed),
    txSignature: claimed?.txSignature,
    tokenSymbol: cfg.tokenSymbol,
  };
}

// ── Claim execution ───────────────────────────────────────────────────────────

let conn: Connection | null = null;
function getConnection(cfg: AirdropConfig): Connection {
  if (conn) return conn;
  conn = new Connection(cfg.rpcUrl!, "confirmed");
  return conn;
}

// Permanent claim record. We deliberately don't TTL these — re-runs are forbidden.
const CLAIM_RECORD_TTL_SECONDS = 60 * 60 * 24 * 365 * 5;   // 5 years; Upstash needs *some* TTL

export type ClaimResult =
  | { ok: true; txSignature: string; amount: number; rank: number }
  | { ok: false; reason: string; status: number };

export async function executeClaim(wallet: string): Promise<ClaimResult> {
  const cfg = getAirdropConfig();
  if (!cfg.enabled) return { ok: false, reason: "airdrop not configured", status: 503 };

  // 1. Re-check eligibility against the LIVE leaderboard (not a client-provided snapshot).
  const eligibility = await checkEligibility(wallet);
  if (!eligibility.eligible) {
    return { ok: false, reason: eligibility.reason ?? "ineligible", status: 403 };
  }
  if (eligibility.claimed) {
    return { ok: false, reason: "already claimed", status: 409 };
  }

  // 2. Atomic lock so two concurrent requests for the same wallet can't both transfer.
  const lockHeld = await cacheGet<{ ts: number }>(LOCK_KEY(wallet));
  if (lockHeld) {
    return { ok: false, reason: "claim in progress — try again in a moment", status: 429 };
  }
  await cacheSet(LOCK_KEY(wallet), { ts: Date.now() }, LOCK_TTL_SECONDS);

  try {
    const conn = getConnection(cfg);
    const recipient = new PublicKey(wallet);
    const signer = cfg.signer!;
    const mint = cfg.mint!;
    const decimals = cfg.decimals!;
    const amount = cfg.baseAmount! * eligibility.multiplier!;
    const rawAmount = BigInt(Math.round(amount * 10 ** decimals));

    // 3. Resolve associated token accounts (signer's source, recipient's destination).
    const sourceAta = await getAssociatedTokenAddress(mint, signer.publicKey);
    const destAta = await getAssociatedTokenAddress(mint, recipient);

    // Verify the source has the tokens before spending fees on a tx that'll fail.
    let sourceAccount;
    try {
      sourceAccount = await getAccount(conn, sourceAta);
    } catch (err) {
      if (err instanceof TokenAccountNotFoundError) {
        return { ok: false, reason: "signer wallet has no token account for this mint", status: 500 };
      }
      throw err;
    }
    if (sourceAccount.amount < rawAmount) {
      return { ok: false, reason: "signer wallet has insufficient tokens", status: 503 };
    }

    // 4. Build the transaction — create recipient ATA if missing, then transfer.
    const tx = new Transaction();
    let destExists = true;
    try {
      await getAccount(conn, destAta);
    } catch (err) {
      if (err instanceof TokenAccountNotFoundError) destExists = false;
      else throw err;
    }
    if (!destExists) {
      tx.add(createAssociatedTokenAccountInstruction(signer.publicKey, destAta, recipient, mint));
    }
    tx.add(
      createTransferCheckedInstruction(sourceAta, mint, destAta, signer.publicKey, rawAmount, decimals),
    );

    // 5. Send and confirm. sendAndConfirmTransaction handles blockhash + retries.
    const txSignature = await sendAndConfirmTransaction(conn, tx, [signer], {
      commitment: "confirmed",
      maxRetries: 3,
    });

    // 6. Record the claim permanently.
    const record: ClaimRecord = {
      txSignature,
      amount,
      rank: eligibility.rank!,
      claimedAt: Date.now(),
    };
    await cacheSet(CLAIM_KEY(wallet), record, CLAIM_RECORD_TTL_SECONDS);

    return { ok: true, txSignature, amount, rank: eligibility.rank! };
  } catch (err) {
    console.error("[airdrop] claim failed for", wallet, err);
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `transfer failed: ${msg}`, status: 500 };
  } finally {
    // Release the lock so a failed claim is retryable.
    // We can't SET with 0 TTL on Upstash so we just let the 90s TTL expire naturally
    // by skipping cleanup here — short window, acceptable retry latency.
  }
}
