// Thin wrapper over Upstash Redis with a graceful no-op fallback for local dev.
// If UPSTASH_REDIS_REST_URL / TOKEN are missing, every call short-circuits to "miss"
// so the API still works — just without persistence. Production sets the env vars.

import { Redis } from "@upstash/redis";

const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const upstashEnabled = Boolean(URL && TOKEN);
const redis = upstashEnabled ? new Redis({ url: URL!, token: TOKEN! }) : null;

// Local dev fallback: in-memory map so share-URL + OG flows work without Upstash.
// In serverless prod this is per-instance and useless across cold starts — Upstash takes over.
type Entry = { value: unknown; expiresAt: number };
const localCache = new Map<string, Entry>();

export const cacheEnabled = () => true; // always "enabled" — falls back to memory if no Redis

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (redis) {
    try {
      return (await redis.get<T>(key)) ?? null;
    } catch {
      return null;
    }
  }
  const entry = localCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    localCache.delete(key);
    return null;
  }
  return entry.value as T;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (redis) {
    try {
      await redis.set(key, value, { ex: ttlSeconds });
    } catch {
      // silent — cache failures should never break a request
    }
    return;
  }
  localCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

// Receipt cache key. We include the limit because top-10 and all return different data.
// 0 (unlimited) gets its own slot so re-running "all" is instant.
export function receiptKey(wallet: string, limit: number): string {
  return `cope:r:${wallet}:${limit}`;
}

// "Latest" key for the share page. Always mirrors the most recent scoring of any depth
// for a given wallet, so /r/<wallet> always finds *something* if the wallet has been scored.
export function latestReceiptKey(wallet: string): string {
  return `cope:latest:${wallet}`;
}

// Receipt TTL: 24h. Memecoin prices move; we don't want stale ATHs forever.
export const RECEIPT_TTL_SECONDS = 60 * 60 * 24;
