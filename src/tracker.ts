// Solana Tracker Data API client.
// Docs: https://docs.solanatracker.io  (base: https://data.solanatracker.io)
// Replaces both Helius swap-parsing and Birdeye historical prices: PnL is pre-computed per token.

const API_KEY = process.env.SOLANA_TRACKER_API_KEY!;
if (!API_KEY) throw new Error("SOLANA_TRACKER_API_KEY missing in .env");

const BASE = "https://data.solanatracker.io";
const SOL_MINT = "So11111111111111111111111111111111111111112";

// Soft rate-limit: free tier is request-budget capped (10k/mo), but bursts still 429.
// One request per 350ms = ~2.8 rps. Plenty for spike scale.
const MIN_GAP_MS = 350;
let nextOk = 0;
async function pace() {
  const now = Date.now();
  if (now < nextOk) await new Promise((r) => setTimeout(r, nextOk - now));
  nextOk = Date.now() + MIN_GAP_MS;
}

const headers = { "x-api-key": API_KEY, accept: "application/json" } as const;

async function st<T>(path: string, init?: RequestInit): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    await pace();
    const r = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers ?? {}) },
    });
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
      continue;
    }
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`tracker ${path} ${r.status}: ${text.slice(0, 300)}`);
    }
    return await r.json() as T;
  }
  throw new Error(`tracker ${path}: rate-limited after 5 retries`);
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

export async function getAthBatch(
  mints: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, AthInfo>> {
  const out = new Map<string, AthInfo>();
  for (let i = 0; i < mints.length; i++) {
    const ath = await getTokenAth(mints[i]);
    if (ath) out.set(mints[i], ath);
    onProgress?.(i + 1, mints.length);
  }
  return out;
}
