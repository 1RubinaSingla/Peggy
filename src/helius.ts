import type { LedgerEntry } from "./types.ts";

const WSOL = "So11111111111111111111111111111111111111112";
const LAMPORTS_PER_SOL = 1_000_000_000;
const SIG_BATCH = 100;       // Helius enhanced-tx batch size
const SIG_PAGE = 1000;       // RPC getSignaturesForAddress max
const MAX_SIGS = 10_000;     // safety cap for spike — whale/validator wallets would never finish otherwise

const API_KEY = process.env.HELIUS_API_KEY!;
if (!API_KEY) throw new Error("HELIUS_API_KEY missing in .env");

const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${API_KEY}`;
const ENHANCED_URL = `https://api.helius.xyz/v0/transactions?api-key=${API_KEY}`;

type SigInfo = { signature: string; slot: number; blockTime: number | null; err: unknown };

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const r = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!r.ok) throw new Error(`RPC ${method} ${r.status}`);
  const j = await r.json() as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(`RPC ${method}: ${j.error.message}`);
  return j.result as T;
}

export async function getAllSignatures(wallet: string, onProgress?: (n: number) => void): Promise<string[]> {
  const all: string[] = [];
  let before: string | undefined;
  while (true) {
    const opts: Record<string, unknown> = { limit: SIG_PAGE };
    if (before) opts.before = before;
    const page = await rpc<SigInfo[]>("getSignaturesForAddress", [wallet, opts]);
    if (!page.length) break;
    for (const s of page) if (!s.err) all.push(s.signature);
    onProgress?.(all.length);
    if (page.length < SIG_PAGE) break;
    if (all.length >= MAX_SIGS) break;
    before = page[page.length - 1].signature;
  }
  return all.slice(0, MAX_SIGS);
}

type TokenBalanceChange = {
  userAccount: string;
  tokenAccount: string;
  mint: string;
  rawTokenAmount: { tokenAmount: string; decimals: number };
};

type AccountData = {
  account: string;
  nativeBalanceChange: number;
  tokenBalanceChanges: TokenBalanceChange[];
};

type EnhancedTx = {
  signature: string;
  timestamp: number;
  type: string;
  source?: string;
  feePayer?: string;
  accountData?: AccountData[];
};

async function fetchEnhancedBatch(sigs: string[]): Promise<EnhancedTx[]> {
  const r = await fetch(ENHANCED_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transactions: sigs }),
  });
  if (!r.ok) throw new Error(`enhanced-tx ${r.status}: ${await r.text()}`);
  return await r.json() as EnhancedTx[];
}

export async function fetchEnhanced(sigs: string[], onProgress?: (done: number, total: number) => void): Promise<EnhancedTx[]> {
  const out: EnhancedTx[] = [];
  for (let i = 0; i < sigs.length; i += SIG_BATCH) {
    const batch = sigs.slice(i, i + SIG_BATCH);
    let attempt = 0;
    while (true) {
      try {
        const res = await fetchEnhancedBatch(batch);
        out.push(...res);
        break;
      } catch (e) {
        attempt++;
        if (attempt > 4) throw e;
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    onProgress?.(out.length, sigs.length);
  }
  return out;
}

// Tiny tolerance to ignore decimal-rounding dust when classifying swap direction.
const DUST_TOKEN_UNITS = 1e-9;

// Extract a buy/sell ledger entry per swap by reading the wallet's *net* balance change in accountData.
// This works uniformly across every Solana DEX (Pump.fun, Jupiter, Raydium, Orca, Meteora...) because
// it's pure accounting: regardless of routing, we look at what the user actually gained/lost.
//
// Direction rules:
//   net SOL out + exactly one mint with positive delta → BUY (one mint at a time, into the wallet)
//   net SOL in  + exactly one mint with negative delta → SELL
// SPL↔SPL swaps (no SOL net change) are deferred to Phase 1.
export function extractLedger(txs: EnhancedTx[], wallet: string): LedgerEntry[] {
  const ledger: LedgerEntry[] = [];

  for (const tx of txs) {
    if (tx.type !== "SWAP") continue;
    if (!tx.accountData?.length) continue;

    // Sum native SOL delta on wallet + delta on its WSOL token account (covers wrap/unwrap edge case).
    let netLamports = 0;
    const mintDeltas = new Map<string, number>();

    for (const acc of tx.accountData) {
      if (acc.account === wallet) netLamports += acc.nativeBalanceChange ?? 0;
      for (const tb of acc.tokenBalanceChanges ?? []) {
        if (tb.userAccount !== wallet) continue;
        const raw = Number(tb.rawTokenAmount.tokenAmount);
        if (!Number.isFinite(raw) || raw === 0) continue;
        const human = raw / 10 ** tb.rawTokenAmount.decimals;
        if (tb.mint === WSOL) {
          netLamports += raw; // WSOL is 9 decimals same as SOL, raw == lamports
          continue;
        }
        mintDeltas.set(tb.mint, (mintDeltas.get(tb.mint) ?? 0) + human);
      }
    }

    const significantDeltas = [...mintDeltas].filter(([, v]) => Math.abs(v) > DUST_TOKEN_UNITS);
    if (significantDeltas.length !== 1) continue; // skip SPL↔SPL and complex multi-token

    const [mint, delta] = significantDeltas[0];
    const netSol = netLamports / LAMPORTS_PER_SOL;

    // BUY: token delta positive (received), SOL net negative (paid out — fees included)
    if (delta > 0 && netSol < 0) {
      ledger.push({
        signature: tx.signature, ts: tx.timestamp, mint,
        side: "buy", tokenAmount: delta, solAmount: -netSol,
      });
      continue;
    }
    // SELL: token delta negative (sent), SOL net positive (received — after fees)
    if (delta < 0 && netSol > 0) {
      ledger.push({
        signature: tx.signature, ts: tx.timestamp, mint,
        side: "sell", tokenAmount: -delta, solAmount: netSol,
      });
      continue;
    }
    // else: same-sign or zero-SOL (SPL↔SPL routed through WSOL but netting to ~0) → skip
  }

  ledger.sort((a, b) => a.ts - b.ts);
  return ledger;
}
