// Solana Tracker Data API client.
// Docs: https://docs.solanatracker.io  (base: https://data.solanatracker.io)
// Replaces both Helius swap-parsing and Birdeye historical prices: PnL is pre-computed per token.

const API_KEY = process.env.SOLANA_TRACKER_API_KEY!;
if (!API_KEY) throw new Error("SOLANA_TRACKER_API_KEY missing in .env");

const BASE = "https://data.solanatracker.io";
const SOL_MINT = "So11111111111111111111111111111111111111112";

const headers = { "x-api-key": API_KEY, accept: "application/json" } as const;

// 429 backoff with large jitter to prevent thundering-herd retries under concurrency.
// Concurrency comes from the caller via parallelMap; this fn only handles per-request retry.
async function st<T>(path: string, init?: RequestInit): Promise<T> {
  const MAX_ATTEMPTS = 8;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const r = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) },
    });
    if (r.status === 429) {
      const base = 600 * 2 ** attempt;
      const jitter = Math.random() * 1500;
      await new Promise((res) => setTimeout(res, base + jitter));
      continue;
    }
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`tracker ${path} ${r.status}: ${text.slice(0, 300)}`);
    }
    return await r.json() as T;
  }
  throw new Error(`tracker ${path}: rate-limited after ${MAX_ATTEMPTS} retries`);
}

// Worker-pool parallelism. Runs `fn` on each item with at most `concurrency` in flight.
// Results preserve input order. Progress fires after each completion.
async function parallelMap<T, R>(
  items: T[],
  fn: (item: T, idx: number) => Promise<R>,
  concurrency: number,
  onComplete?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
      done++;
      onComplete?.(done, items.length);
    }
  }

  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type PnlPosition = {
  holding: number;        // tokens still held
  held: number;           // total tokens ever passed through
  sold: number;           // total tokens sold
  sold_usd: number;       // total USD received from selling
  realized: number;       // realized PnL USD
  unrealized: number;     // unrealized PnL USD
  total: number;          // total PnL USD
  total_invested: number; // total USD spent buying
  current_value: number;  // USD value of current holdings
  cost_basis: number;     // USD per token (average cost)
  first_buy_time: number; // ms
  last_buy_time: number;  // ms
  last_sell_time: number; // ms
  last_trade_time: number;
  buy_transactions: number;
  sell_transactions: number;
  total_transactions: number;
};

export type WalletPnL = {
  tokens: Record<string, PnlPosition>;
  summary?: unknown;
};

export type AthInfo = {
  highest_price: number;   // USD per token
  highest_market_cap: number;
  timestamp: number;       // ms
  pool_id: string;
};

export type PriceInfo = {
  price: number;            // USD per token
  priceQuote?: number;
  liquidity: number;        // USD
  marketCap: number;
  lastUpdated: number;
};

// ─── Endpoints ───────────────────────────────────────────────────────────────

export async function getWalletPnl(wallet: string): Promise<WalletPnL> {
  return st<WalletPnL>(`/pnl/${wallet}`);
}

export async function getTokenAth(mint: string): Promise<AthInfo | null> {
  try {
    return await st<AthInfo>(`/tokens/${mint}/ath`);
  } catch {
    return null; // token deleted, scam, or no recorded peak
  }
}

export async function getMultiPrice(mints: string[]): Promise<Map<string, PriceInfo>> {
  const out = new Map<string, PriceInfo>();
  if (!mints.length) return out;
  // Endpoint caps at 100 tokens per request.
  for (let i = 0; i < mints.length; i += 100) {
    const batch = mints.slice(i, i + 100);
    const res = await st<Record<string, PriceInfo>>(`/price/multi`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tokens: batch }),
    });
    for (const [mint, info] of Object.entries(res)) out.set(mint, info);
  }
  return out;
}

export async function getCurrentSolUsd(): Promise<number> {
  const p = await st<PriceInfo>(`/price?token=${SOL_MINT}`);
  return p.price;
}

export type TokenInfo = { symbol: string; name: string; mint: string; decimals: number };

export async function getTokenInfo(mint: string): Promise<TokenInfo | null> {
  try {
    const res = await st<{ token: TokenInfo }>(`/tokens/${mint}`);
    return res.token;
  } catch {
    return null;
  }
}

// Concurrency tuned for Solana Tracker free tier. Empirically: 5 trips so many 429s
// that some calls exhaust retries and silently drop ATHs. 3 holds without losses.
const ATH_CONCURRENCY = 3;
const INFO_CONCURRENCY = 3;

export async function getAthBatch(
  mints: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, AthInfo>> {
  const out = new Map<string, AthInfo>();
  const results = await parallelMap(mints, (m) => getTokenAth(m), ATH_CONCURRENCY, onProgress);
  for (let i = 0; i < mints.length; i++) {
    if (results[i]) out.set(mints[i], results[i] as AthInfo);
  }
  return out;
}

// ─── Trades ──────────────────────────────────────────────────────────────────

const WSOL = "So11111111111111111111111111111111111111112";

export type TradeLeg = {
  address: string;
  amount: number;
  token?: { name?: string; symbol?: string; decimals?: number };
  priceUsd?: number;
};

export type Trade = {
  tx: string;
  from: TradeLeg;
  to: TradeLeg;
  price?: { usd?: number; sol?: string | number };
  volume?: { usd?: number; sol?: number };
  wallet: string;
  program?: string;
  time: number;  // ms
};

type TradesResponse = { trades: Trade[]; nextCursor?: string };

export async function getWalletTradesPage(wallet: string, cursor?: string): Promise<TradesResponse> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return st<TradesResponse>(`/wallet/${wallet}/trades${qs}`);
}

// Fetch buy + sell trades for the wallet, filtering to mints we care about.
// Paginates up to maxPages; for free-tier safety we cap rather than scanning lifetime.
export async function getWalletTokenTrades(
  wallet: string,
  mintsOfInterest: Set<string>,
  maxPages = 3,
): Promise<{ buys: Trade[]; sells: Trade[] }> {
  const buys: Trade[] = [];
  const sells: Trade[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const resp = await getWalletTradesPage(wallet, cursor);
    const trades = resp.trades ?? [];
    if (!trades.length) break;
    for (const t of trades) {
      // SELL: user sent a non-WSOL token, received WSOL.
      if (t.to.address === WSOL && t.from.address !== WSOL && mintsOfInterest.has(t.from.address)) {
        sells.push(t);
        continue;
      }
      // BUY: user sent WSOL, received a non-WSOL token.
      if (t.from.address === WSOL && t.to.address !== WSOL && mintsOfInterest.has(t.to.address)) {
        buys.push(t);
      }
    }
    if (!resp.nextCursor) break;
    cursor = resp.nextCursor;
  }
  return { buys, sells };
}

export async function getTokenInfoBatch(
  mints: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, TokenInfo>> {
  const out = new Map<string, TokenInfo>();
  const results = await parallelMap(mints, (m) => getTokenInfo(m), INFO_CONCURRENCY, onProgress);
  for (let i = 0; i < mints.length; i++) {
    if (results[i]) out.set(mints[i], results[i] as TokenInfo);
  }
  return out;
}
