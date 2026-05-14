// Global leaderboard — Wall of Pain.
//
// Every successful scoring writes the wallet to a shared, append-only board.
// Anyone hitting /leaderboard sees the same global view: top 20 by peakCopeSol
// scored within the last 7 days.
//
// Storage:
//   lb:peakcope             — sorted set, score = peakCopeSol, member = wallet
//   lb:entry:<wallet>       — string JSON, the per-row metadata, TTL = 8d
//
// The two-key split lets us TTL the metadata cheaply while keeping the sorted
// set as the natural ranked index. On read we filter out entries whose JSON
// has aged out — and lazily ZREM them so the sorted set doesn't grow forever.

import { cacheGet, cacheSet, sortedAdd, sortedRemove, sortedTopDesc } from "./cache.ts";
import type { CopeReceipt } from "./types.ts";

export type LeaderboardEntry = {
  wallet: string;
  peakCopeSol: number;
  diamondCopeSol: number;
  tierName: string;
  scoredAt: number;          // ms epoch
  solUsd?: number;           // for UI USD approximations
  worstSymbol?: string | null;
  worstMint?: string | null;
};

const BOARD_KEY = "lb:peakcope";
const ENTRY_TTL_SECONDS = 60 * 60 * 24 * 8;   // 8 days — slightly more than the 7d window
const SLIDING_WINDOW_MS = 1000 * 60 * 60 * 24 * 7;
const TOP_N = 20;
const OVERFETCH = 50;                          // pull extra so we can filter out stale entries

function entryKey(wallet: string) {
  return `lb:entry:${wallet}`;
}

// Called after a successful scoring run. Skips empty receipts and zero-cope
// wallets so the board only surfaces signal.
export async function recordWalletScore(receipt: CopeReceipt): Promise<void> {
  if (!receipt.wallet || receipt.peakCopeSol <= 0) return;

  const entry: LeaderboardEntry = {
    wallet: receipt.wallet,
    peakCopeSol: receipt.peakCopeSol,
    diamondCopeSol: receipt.diamondCopeSol,
    tierName: receipt.tier.name,
    scoredAt: Date.now(),
    solUsd: receipt.solUsd,
    worstSymbol: receipt.worstSell?.symbol ?? receipt.worstSingleSell?.symbol ?? null,
    worstMint: receipt.worstSell?.mint ?? receipt.worstSingleSell?.mint ?? null,
  };

  await Promise.all([
    cacheSet(entryKey(receipt.wallet), entry, ENTRY_TTL_SECONDS),
    sortedAdd(BOARD_KEY, receipt.peakCopeSol, receipt.wallet),
  ]);
}

// Top N by peak cope within the 7-day sliding window. Overfetches, drops
// expired entries, and lazily prunes the sorted set of dead members.
export async function getWallOfPain(limit = TOP_N): Promise<LeaderboardEntry[]> {
  const ranked = await sortedTopDesc(BOARD_KEY, OVERFETCH);
  if (!ranked.length) return [];

  const entries = await Promise.all(ranked.map((r) => cacheGet<LeaderboardEntry>(entryKey(r.member))));

  const cutoff = Date.now() - SLIDING_WINDOW_MS;
  const stale: string[] = [];
  const fresh: LeaderboardEntry[] = [];

  for (let i = 0; i < ranked.length; i++) {
    const entry = entries[i];
    if (!entry) {
      stale.push(ranked[i].member);
      continue;
    }
    if (entry.scoredAt < cutoff) {
      stale.push(ranked[i].member);
      continue;
    }
    fresh.push(entry);
  }

  if (stale.length) {
    // fire-and-forget — don't await; readers shouldn't pay for cleanup latency
    void sortedRemove(BOARD_KEY, stale);
  }

  // Already in descending order from the sorted set; just slice.
  return fresh.slice(0, limit);
}
