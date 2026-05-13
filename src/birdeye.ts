import type { TokenStats } from "./types.ts";

const API_KEY = process.env.BIRDEYE_API_KEY!;
if (!API_KEY) throw new Error("BIRDEYE_API_KEY missing in .env");

const BASE = "https://public-api.birdeye.so";

// Birdeye free tier ≈ 1 req/sec. Pace every request through a single gate; the
// spike doesn't need parallelism, and one bad burst trips a 429 for a minute.
const MIN_GAP_MS = 1100;
let nextOk = 0;
async function pace() {
  const now = Date.now();
  if (now < nextOk) await new Promise((r) => setTimeout(r, nextOk - now));
  nextOk = Date.now() + MIN_GAP_MS;
}

const headers = {
  "X-API-KEY": API_KEY,
  "x-chain": "solana",
  accept: "application/json",
};

async function be<T>(path: string): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    await pace();
    const r = await fetch(`${BASE}${path}`, { headers });
    if (r.status === 429) {
      // back off harder than the gate, then retry
      await new Promise((res) => setTimeout(res, 3000 * (attempt + 1)));
      continue;
    }
    if (!r.ok) throw new Error(`birdeye ${path} ${r.status}: ${await r.text().catch(() => "")}`);
    const j = await r.json() as { success: boolean; data: T; message?: string };
    if (!j.success) throw new Error(`birdeye ${path}: ${j.message ?? "unknown"}`);
    return j.data;
  }
  throw new Error(`birdeye ${path}: rate-limited after 5 retries`);
}

type Overview = {
  symbol?: string;
  name?: string;
  price?: number;            // USD
  liquidity?: number;        // USD
  history24hPrice?: number;
  supply?: number;
};

type HistPriceItem = { unixTime: number; value: number };
type HistPriceResp = { items: HistPriceItem[] };

// Get USD-per-SOL at a moment using SOL's price history (cached for the run).
const SOL_MINT = "So11111111111111111111111111111111111111112";
let solUsdSeries: HistPriceItem[] | null = null;

async function loadSolSeries(fromTs: number, toTs: number) {
  // Daily granularity is plenty for converting per-tx USD↔SOL. One call covers years.
  const data = await be<HistPriceResp>(
    `/defi/history_price?address=${SOL_MINT}&address_type=token&type=1D&time_from=${fromTs}&time_to=${toTs}`,
  );
  solUsdSeries = data.items;
}

export async function primeSolPrices(fromTs: number, toTs: number) {
  await loadSolSeries(fromTs, toTs);
}

export function solUsdAt(ts: number): number {
  if (!solUsdSeries || !solUsdSeries.length) throw new Error("SOL series not primed");
  // Binary search nearest
  let lo = 0, hi = solUsdSeries.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (solUsdSeries[mid].unixTime < ts) lo = mid + 1;
    else hi = mid;
  }
  return solUsdSeries[lo].value;
}

// Pull token-lifetime OHLCV at 1H, scan for max USD price → ATH in USD, convert to SOL using SOL/USD at that ts.
// Also fetches current price + liquidity from token_overview.
export async function getTokenStats(mint: string, walletFirstTs: number, nowTs: number): Promise<TokenStats | null> {
  let overview: Overview;
  try {
    overview = await be<Overview>(`/defi/token_overview?address=${mint}`);
  } catch {
    return null;
  }

  // Pull history from wallet's first trade onward; 1H granularity. Chunk by 30 days.
  const items: HistPriceItem[] = [];
  let cursor = walletFirstTs;
  const CHUNK = 60 * 60 * 24 * 30;
  while (cursor < nowTs) {
    const end = Math.min(cursor + CHUNK, nowTs);
    try {
      const data = await be<HistPriceResp>(
        `/defi/history_price?address=${mint}&address_type=token&type=1H&time_from=${cursor}&time_to=${end}`,
      );
      items.push(...data.items);
    } catch {
      // skip chunk on error; partial data is fine for ATH
    }
    cursor = end + 1;
  }

  let athUsd = 0, athTs = 0;
  for (const it of items) {
    if (it.value > athUsd) { athUsd = it.value; athTs = it.unixTime; }
  }

  const currentPriceUsd = overview.price ?? 0;
  const liquidity = overview.liquidity ?? 0;
  const isAlive = currentPriceUsd > 0 && liquidity > 1000;

  const athPriceSol = athTs ? athUsd / solUsdAt(athTs) : 0;
  const currentPriceSol = currentPriceUsd > 0 ? currentPriceUsd / solUsdAt(nowTs) : 0;

  return {
    mint,
    symbol: overview.symbol ?? null,
    name: overview.name ?? null,
    currentPriceSol,
    currentLiquidityUsd: liquidity,
    athPriceSol,
    athTs,
    isAlive,
  };
}

export async function getTokenStatsBatch(
  mints: string[],
  walletFirstTs: number,
  nowTs: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, TokenStats>> {
  const out = new Map<string, TokenStats>();
  // Sequential to stay friendly to rate limits on Standard Plus.
  // Bump to Promise.all chunks of 5 if/when on Premium.
  for (let i = 0; i < mints.length; i++) {
    const stats = await getTokenStats(mints[i], walletFirstTs, nowTs);
    if (stats) out.set(mints[i], stats);
    onProgress?.(i + 1, mints.length);
  }
  return out;
}
