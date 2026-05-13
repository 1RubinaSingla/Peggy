import { NextRequest } from "next/server";
import { scoreFromTracker } from "../../../src/score.ts";
import {
  getAthBatch,
  getCurrentSolUsd,
  getMultiPrice,
  getTokenInfoBatch,
  getWalletPnl,
} from "../../../src/tracker.ts";
import {
  cacheGet,
  cacheSet,
  latestReceiptKey,
  receiptKey,
  RECEIPT_TTL_SECONDS,
} from "../../../src/cache.ts";
import type { CopeReceipt } from "../../../src/types.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SOLANA_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim();
  if (!wallet || !SOLANA_ADDR.test(wallet)) {
    return new Response(JSON.stringify({ error: "invalid wallet" }), { status: 400 });
  }
  // Cap how many positions to score. 0 / unset = score everything.
  const limit = Math.max(0, parseInt(req.nextUrl.searchParams.get("limit") ?? "0") || 0);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Cache check first — share-URL traffic and re-runs return instantly.
        const cached = await cacheGet<CopeReceipt>(receiptKey(wallet, limit));
        if (cached) {
          send("step", { msg: "reading from the cope archive…" });
          send("step", { msg: "found a previous reading." });
          send("done", { empty: false, receipt: cached, cached: true });
          controller.close();
          return;
        }

        send("step", { msg: "fetching wallet PnL from solana tracker…" });
        const pnl = await getWalletPnl(wallet);
        const allEntries = Object.entries(pnl.tokens ?? {});
        send("step", { msg: `${allEntries.length} positions found` });

        if (!allEntries.length) {
          send("done", {
            empty: true,
            message: "no positions found. either this wallet is brand new, or you're already free.",
          });
          controller.close();
          return;
        }

        // Rank by USD sold (the only thing that drives cope size). Positions with no sells
        // produce zero cope no matter what so skip them — saves ATH calls every time.
        const ranked = allEntries
          .filter(([, p]) => (p.sold_usd ?? 0) > 0)
          .sort(([, a], [, b]) => (b.sold_usd ?? 0) - (a.sold_usd ?? 0));

        const totalRanked = ranked.length;
        const sliced = limit > 0 ? ranked.slice(0, limit) : ranked;
        const mints = sliced.map(([m]) => m);
        const scoringTokens: Record<string, (typeof pnl.tokens)[string]> = {};
        for (const [m, p] of sliced) scoringTokens[m] = p;

        if (limit > 0 && limit < totalRanked) {
          send("step", { msg: `scoring top ${mints.length} of ${totalRanked} sold positions` });
        } else {
          send("step", { msg: `scoring ${mints.length} sold positions` });
        }

        send("step", { msg: "fetching current prices…" });
        const prices = await getMultiPrice(mints);
        send("step", { msg: `${prices.size}/${mints.length} prices returned` });

        send("step", { msg: "fetching ATH per token…" });
        const aths = await getAthBatch(mints, (d, t) => {
          send("progress", { kind: "ath", done: d, total: t });
        });
        send("step", { msg: `${aths.size}/${mints.length} ATHs returned` });

        send("step", { msg: "fetching SOL/USD…" });
        const solUsd = await getCurrentSolUsd();
        send("step", { msg: `SOL = $${solUsd.toFixed(2)}` });

        send("step", { msg: "computing cope…" });
        const empty = new Map<string, string>();
        const first = scoreFromTracker(wallet, scoringTokens, aths, prices, solUsd, empty);

        const topMints = [...first.positions]
          .filter((p) => !p.excluded)
          .sort((a, b) => b.peakCopeUsd - a.peakCopeUsd)
          .slice(0, 5)
          .map((p) => p.mint);

        const symbols = new Map<string, string>();
        if (topMints.length) {
          send("step", { msg: `fetching symbols for top ${topMints.length} positions…` });
          const infos = await getTokenInfoBatch(topMints);
          for (const [mint, info] of infos) if (info.symbol) symbols.set(mint, info.symbol);
        }

        const { receipt } = scoreFromTracker(wallet, scoringTokens, aths, prices, solUsd, symbols);
        // Annotate receipt with scope context so the UI can show "top N of M sold positions".
        const scopedReceipt: CopeReceipt = {
          ...receipt,
          totalSoldPositions: totalRanked,
          scoredPositions: mints.length,
        };

        // Await cache writes before closing so serverless doesn't kill us mid-set.
        // ~50-200ms on Upstash, ~0 on local memory.
        await Promise.all([
          cacheSet(receiptKey(wallet, limit), scopedReceipt, RECEIPT_TTL_SECONDS),
          cacheSet(latestReceiptKey(wallet), scopedReceipt, RECEIPT_TTL_SECONDS),
        ]);

        send("done", { empty: false, receipt: scopedReceipt });
        controller.close();
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : String(err) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
