export type Side = "buy" | "sell";

export type LedgerEntry = {
  signature: string;
  ts: number;            // unix seconds
  mint: string;
  side: Side;
  tokenAmount: number;   // human units (decimals applied)
  solAmount: number;     // SOL spent (buy) or received (sell)
};

export type ClosedLot = {
  mint: string;
  buySig: string;
  sellSig: string;
  buyTs: number;
  sellTs: number;
  tokenAmount: number;
  solCostBasis: number;  // SOL spent to acquire this slice
  solProceeds: number;   // SOL received from selling this slice
  buyPriceSol: number;   // per-token
  sellPriceSol: number;  // per-token
};

export type TokenStats = {
  mint: string;
  symbol: string | null;
  name: string | null;
  currentPriceSol: number;       // 0 if dead
  currentLiquidityUsd: number;
  athPriceSol: number;
  athTs: number;
  isAlive: boolean;
};

export type ScoredLot = ClosedLot & {
  symbol: string | null;
  athPriceSol: number;
  athTs: number;
  currentPriceSol: number;
  peakCopeSol: number;     // (ath - sell) * tokens, clamped >= 0
  diamondCopeSol: number;  // (current - sell) * tokens, clamped >= 0
  peakMultiplier: number;  // ath / sell
  excluded: boolean;
  exclusionReason?: string;
};

export type WorstSingleSell = {
  txSig: string;
  ts: number;            // ms
  mint: string;
  symbol: string | null;
  tokensSold: number;
  solReceived: number;
  sellPriceUsd: number;
  athPriceUsd: number;
  peakMultiplier: number;
  fumbleSol: number;     // (ath - sell) * tokens, converted to SOL at current rate
};

export type ShortestHold = {
  mint: string;
  symbol: string | null;
  firstBuyTs: number;    // ms
  firstSellTs: number;   // ms
  holdMs: number;
  peakCopeSol: number;
  peakMultiplier: number;
};

export type DayFromHell = {
  dateMs: number;        // UTC midnight of that day
  fumbleSol: number;
  sellCount: number;
  symbols: string[];     // up to 5 tickers fumbled that day, biggest first
};

export type CopeReceipt = {
  wallet: string;
  tokensEvaluated: number;
  tokensExcluded: number;
  closedLots: number;
  peakCopeSol: number;
  diamondCopeSol: number;
  worstSell: ScoredLot | null;
  worstSingleSell: WorstSingleSell | null;
  bestHoldThatNeverWas: ScoredLot | null;
  biggestCopeMultiplier?: ScoredLot | null;
  shortestHold?: ShortestHold | null;
  dayFromHell?: DayFromHell | null;
  tier: Tier;
  totalSoldPositions?: number;  // total positions with any sells (before slicing by depth)
  scoredPositions?: number;     // positions actually scored (depth-limited)
  solUsd?: number;              // SOL/USD rate at scoring time — for UI approximations
};

export type Tier = {
  name: string;
  range: [number, number];   // SOL diamond cope range
  blurb: string;
};
