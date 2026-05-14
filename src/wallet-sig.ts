// Ed25519 message-signature verification for Phantom-signed claim messages.
//
// Pattern:
//   1. Client asks Phantom to signMessage(textEncoder.encode(canonical)).
//   2. Phantom returns { signature: Uint8Array }; UI sends bs58(signature) up.
//   3. This module rebuilds the canonical bytes from (wallet, timestamp) and
//      verifies the signature against the wallet's pubkey.
//
// We DO NOT trust the message text the client posts back — we always reconstruct
// it from the (wallet, ts) tuple the client claims, then verify. That way the
// signature is bound to *this* claim only, never replayable.

import bs58 from "bs58";
import nacl from "tweetnacl";

const CLAIM_VERSION = "v1";
const FRESHNESS_MS = 5 * 60 * 1000;  // 5 minutes

export function buildClaimMessage(wallet: string, ts: number): string {
  // Human-readable so Phantom's confirmation modal shows something legible.
  return [
    "peggy.cash airdrop claim",
    `version: ${CLAIM_VERSION}`,
    `wallet: ${wallet}`,
    `ts: ${ts}`,
  ].join("\n");
}

export function verifyClaimSignature(
  wallet: string,
  ts: number,
  signatureBase58: string,
): { ok: true } | { ok: false; reason: string } {
  // Freshness check first — cheaper than crypto.
  const now = Date.now();
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad timestamp" };
  const drift = Math.abs(now - ts);
  if (drift > FRESHNESS_MS) return { ok: false, reason: "signature too old or in the future" };

  let pubkey: Uint8Array;
  let signature: Uint8Array;
  try {
    pubkey = bs58.decode(wallet);
    signature = bs58.decode(signatureBase58);
  } catch {
    return { ok: false, reason: "malformed wallet or signature" };
  }
  if (pubkey.length !== 32) return { ok: false, reason: "bad wallet length" };
  if (signature.length !== 64) return { ok: false, reason: "bad signature length" };

  const message = new TextEncoder().encode(buildClaimMessage(wallet, ts));
  const ok = nacl.sign.detached.verify(message, signature, pubkey);
  return ok ? { ok: true } : { ok: false, reason: "signature failed verification" };
}
