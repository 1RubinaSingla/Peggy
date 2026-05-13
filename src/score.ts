// Scorer for the Solana Tracker pipeline.
// Math is simple per token:
//   peakCopeUsd    = max(0, ATH_price_usd * tokens_sold - usd_received)
//   diamondCopeUsd = max(0, current_price_usd * tokens_sold - usd_received)
// Aggregate algebra: identical whether the user sold at one price or twenty — sum of (p_i * a_i) = sold_usd.

import { assignTier } from "./tiers.ts";
import type { AthInfo, PnlPosition, PriceInfo, Trade } from "./tracker.ts";
import type { CopeReceipt, DayFromHell, ScoredLot, ShortestHold, WorstSingleSell } from "./types.ts";

const DAY_MS = 86_400_000;

const WSOL = "So11111111111111111111111111111111111111112";
const MIN_INVESTED_USD = 1;          // skip dust positions
const MIN_LIQUIDITY_USD = 5_000;     // current liq floor; below = treat current value as dead

export type ScoredPosition = {
  mint: string;
  symbol: string | null;
  sold: number;
  soldUsd: number;
  avgSellPriceUsd: number;
  athPriceUsd: number;
  athTs: number;
  currentPriceUsd: number;
  liquidityUsd: number;
  isAlive: boolean;
  peakCopeUsd: number;
  diamondCopeUsd: number;
  peakMultiplier: number;
  excluded: boolean;
  exclusionReason?: string;
};

export type Scored = {
  positions: ScoredPosition[];
  receipt: CopeReceipt;
};

// Scan individual sell trades and return the single biggest peak-cope fumble.
// "Worst single sell" = one transaction, one moment in time — the quote-tweet hook.
export function findWorstSingleSell(
  trades: Trade[],
  aths: Map<string, AthInfo>,
  symbols: Map<string, string>,
  solUsd: number,
): WorstSingleSell | null {
  let best: WorstSingleSell | null = null;

  for (const t of trades) {
    const mint = t.from.address;
    const ath = aths.get(mint);
    if (!ath || !ath.highest_price) continue;

    const sellPriceUsd = t.from.priceUsd ?? 0;
    const tokensSold = t.from.amount ?? 0;
    const solReceived = t.to.amount ?? 0;
    if (sellPriceUsd <= 0 || tokensSold <= 0) continue;

    const athPriceUsd = ath.highest_price;
    // Skip sells that happened AT or ABOVE the recorded ATH — either honest tops, or
    // data noise. Either way there's no cope to extract.
    if (athPriceUsd <= sellPriceUsd) continue;
    // ATH must postdate the trade — couldn't have sold at a peak that hadn't happened yet
    // if it predates this trade by a lot. Actually: peak BEFORE the trade is fine for
    // "you could've sold higher then." So no time filter — peak >= trade time OR before
    // is both valid cope.

    const fumbleUsd = (athPriceUsd - sellPriceUsd) * tokensSold;
    const fumbleSol = fumbleUsd / solUsd;

    if (!best || fumbleSol > best.fumbleSol) {
      best = {
        txSig: t.tx,
        ts: t.time,
        mint,
        symbol: t.from.token?.symbol ?? symbols.get(mint) ?? null,
        tokensSold,
        solReceived,
        sellPriceUsd,
        athPriceUsd,
        peakMultiplier: athPriceUsd / sellPriceUsd,
        fumbleSol,
      };
    }
  }

  return best;
}

// Find the fumbled position the user exited the fastest. "You didn't even hold for an hour."
// Requires both first-buy and first-sell timestamps from the raw trade stream.
export function findShortestHold(
  buys: Trade[],
  sells: Trade[],
  scoredByMint: Map<string, ScoredPosition>,
  symbols: Map<string, string>,
  solUsd: number,
): ShortestHold | null {
  const firstBuy = new Map<string, number>();
  for (const t of buys) {
    const mint = t.to.address;
    const prev = firstBuy.get(mint);
    if (prev === undefined || t.time < prev) firstBuy.set(mint, t.time);
  }
  const firstSell = new Map<string, number>();
  for (const t of sells) {
    const mint = t.from.address;
    const prev = firstSell.get(mint);
    if (prev === undefined || t.time < prev) firstSell.set(mint, t.time);
  }

  let best: ShortestHold | null = null;
  for (const [mint, buyTs] of firstBuy) {
    const sellTs = firstSell.get(mint);
    if (sellTs === undefined || sellTs <= buyTs) continue;
    const scored = scoredByMint.get(mint);
    if (!scored || scored.excluded || scored.peakCopeUsd <= 0) continue;

    const holdMs = sellTs - buyTs;
    if (!best || holdMs < best.holdMs) {
      best = {
        mint,
        symbol: scored.symbol ?? symbols.get(mint) ?? null,
        firstBuyTs: buyTs,
        firstSellTs: sellTs,
        holdMs,
        peakCopeSol: scored.peakCopeUsd / solUsd,
        peakMultiplier: scored.peakMultiplier,
      };
    }
  }
  return best;
}

// Group sell trades by UTC day, sum per-sell peak-cope fumble, return the worst day.
export function findDayFromHell(
  sells: Trade[],
  aths: Map<string, AthInfo>,
  solUsd: number,
): DayFromHell | null {
  type DayBucket = { fumbleUsd: number; count: number; bySymbol: Map<string, { symbol: string; fumbleUsd: number }> };
  const days = new Map<number, DayBucket>();

  for (const t of sells) {
    const mint = t.from.address;
    const ath = aths.get(mint);
    if (!ath?.highest_price) continue;
    const sellPriceUsd = t.from.priceUsd ?? 0;
    const tokens = t.from.amount ?? 0;
    if (sellPriceUsd <= 0 || tokens <= 0) continue;
    if (ath.highest_price <= sellPriceUsd) continue;

    const fumbleUsd = (ath.highest_price - sellPriceUsd) * tokens;
    const dayKey = Math.floor(t.time / DAY_MS) * DAY_MS;
    const bucket = days.get(dayKey) ?? { fumbleUsd: 0, count: 0, bySymbol: new Map() };
    bucket.fumbleUsd += fumbleUsd;
    bucket.count += 1;
    const symbol = t.from.token?.symbol ?? mint.slice(0, 4);
    const existing = bucket.bySymbol.get(mint);
    if (existing) existing.fumbleUsd += fumbleUsd;
    else bucket.bySymbol.set(mint, { symbol, fumbleUsd });
    days.set(dayKey, bucket);
  }

  if (!days.size) return null;
  let worstDay: number | null = null;
  let worstBucket: DayBucket | null = null;
  for (const [day, bucket] of days) {
    if (!worstBucket || bucket.fumbleUsd > worstBucket.fumbleUsd) {
      worstDay = day;
      worstBucket = bucket;
    }
  }
  if (!worstBucket || !worstDay) return null;
  const symbols = [...worstBucket.bySymbol.values()]
    .sort((a, b) => b.fumbleUsd - a.fumbleUsd)
    .slice(0, 5)
    .map((s) => s.symbol);
  return {
    dateMs: worstDay,
    fumbleSol: worstBucket.fumbleUsd / solUsd,
    sellCount: worstBucket.count,
    symbols,
  };
}

export function scoreFromTracker(
  wallet: string,
  pnl: Record<string, PnlPosition>,
  aths: Map<string, AthInfo>,
  prices: Map<string, PriceInfo>,
  solUsd: number,
  symbols: Map<string, string>,
): Scored {
  const positions: ScoredPosition[] = [];

  for (const [mint, p] of Object.entries(pnl)) {
    if (mint === WSOL) continue; // selling SOL isn't cope

    const sold = p.sold ?? 0;
    const soldUsd = p.sold_usd ?? 0;
    const invested = p.total_invested ?? 0;
    const ath = aths.get(mint);
    const price = prices.get(mint);

    let excluded = false;
    let reason: string | undefined;
    if (sold <= 0) { excluded = true; reason = "never sold"; }
    else if (invested < MIN_INVESTED_USD && soldUsd < MIN_INVESTED_USD) { excluded = true; reason = "dust"; }
    else if (!ath) { excluded = true; reason = "no ATH data"; }

    const avgSellPriceUsd = sold > 0 ? soldUsd / sold : 0;
    const athPriceUsd = ath?.highest_price ?? 0;
    const liquidityUsd = price?.liquidity ?? 0;
    const isAlive = (price?.price ?? 0) > 0 && liquidityUsd > MIN_LIQUIDITY_USD;
    const currentPriceUsd = isAlive ? price!.price : 0;

    // Sanity: if avg sell price is at/above the recorded ATH, our data missed the peak.
    if (!excluded && athPriceUsd > 0 && athPriceUsd <= avgSellPriceUsd) {
      excluded = true; reason = "sold at/above recorded ATH";
    }

    const peakCopeUsd = excluded ? 0 : Math.max(0, athPriceUsd * sold - soldUsd);
    const diamondCopeUsd = excluded ? 0 : Math.max(0, currentPriceUsd * sold - soldUsd);
    const peakMultiplier = avgSellPriceUsd > 0 ? athPriceUsd / avgSellPriceUsd : 0;

    positions.push({
      mint,
      symbol: symbols.get(mint) ?? null,
      sold, soldUsd, avgSellPriceUsd,
      athPriceUsd, athTs: ath?.timestamp ?? 0,
      currentPriceUsd, liquidityUsd, isAlive,
      peakCopeUsd, diamondCopeUsd, peakMultiplier,
      excluded, exclusionReason: reason,
    });
  }

  const included = positions.filter((p) => !p.excluded);
  const peakCopeUsd = included.reduce((a, p) => a + p.peakCopeUsd, 0);
  const diamondCopeUsd = included.reduce((a, p) => a + p.diamondCopeUsd, 0);

  const peakCopeSol = peakCopeUsd / solUsd;
  const diamondCopeSol = diamondCopeUsd / solUsd;

  const worst = included.length ? included.reduce((a, b) => (b.peakCopeUsd > a.peakCopeUsd ? b : a)) : null;
  const bestHold = included.length ? included.reduce((a, b) => (b.diamondCopeUsd > a.diamondCopeUsd ? b : a)) : null;
  // Highest peak multiplier among fumbled positions. Captures relative regret independent
  // of bag size — small position sold for 1/100th of ATH still earns a chapter.
  const fumbled = included.filter((p) => p.peakCopeUsd > 0 && p.peakMultiplier >= 3);
  const biggest = fumbled.length
    ? fumbled.reduce((a, b) => (b.peakMultiplier > a.peakMultiplier ? b : a))
    : null;

  // Adapt to existing CopeReceipt shape so the printer doesn't change.
  const toScoredLot = (p: ScoredPosition | null): ScoredLot | null => {
    if (!p) return null;
    return {
      mint: p.mint,
      buySig: "", sellSig: "", buyTs: 0, sellTs: 0,
      tokenAmount: p.sold,
      solCostBasis: 0, solProceeds: p.soldUsd / solUsd,
      buyPriceSol: 0, sellPriceSol: p.avgSellPriceUsd / solUsd,
      symbol: p.symbol,
      athPriceSol: p.athPriceUsd / solUsd,
      athTs: p.athTs,
      currentPriceSol: p.currentPriceUsd / solUsd,
      peakCopeSol: p.peakCopeUsd / solUsd,
      diamondCopeSol: p.diamondCopeUsd / solUsd,
      peakMultiplier: p.peakMultiplier,
      excluded: false,
    };
  };

  const receipt: CopeReceipt = {
    wallet,
    tokensEvaluated: positions.length,
    tokensExcluded: positions.length - included.length,
    closedLots: included.length,
    peakCopeSol,
    diamondCopeSol,
    worstSell: toScoredLot(worst),
    worstSingleSell: null,  // filled in by the route after fetching trades
    bestHoldThatNeverWas: toScoredLot(bestHold),
    biggestCopeMultiplier: biggest && biggest.mint !== worst?.mint ? toScoredLot(biggest) : null,
    // Tier on Peak Cope: in a market where ~all memecoins go to zero, Diamond Cope
    // ends up at 0 for most degens, so peak captures the real fumble.
    tier: assignTier(peakCopeSol),
  };

  return { positions, receipt };
}
