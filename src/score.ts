// Scorer for the Solana Tracker pipeline.
// Math is simple per token:
//   peakCopeUsd    = max(0, ATH_price_usd * tokens_sold - usd_received)
//   diamondCopeUsd = max(0, current_price_usd * tokens_sold - usd_received)
// Aggregate algebra: identical whether the user sold at one price or twenty — sum of (p_i * a_i) = sold_usd.

import { assignTier } from "./tiers.ts";
import type { AthInfo, PnlPosition, PriceInfo, Trade } from "./tracker.ts";
import type { CopeReceipt, ScoredLot, WorstSingleSell } from "./types.ts";

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
    // Tier on Peak Cope: in a market where ~all memecoins go to zero, Diamond Cope
    // ends up at 0 for most degens, so peak captures the real fumble.
    tier: assignTier(peakCopeSol),
  };

  return { positions, receipt };
}
