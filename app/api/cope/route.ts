import { NextRequest } from "next/server";
import { scoreFromTracker } from "../../../src/score.ts";
import {
  getAthBatch,
  getCurrentSolUsd,
  getMultiPrice,
  getTokenInfo,
  getWalletPnl,
} from "../../../src/tracker.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SOLANA_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim();
  if (!wallet || !SOLANA_ADDR.test(wallet)) {
    return new Response(JSON.stringify({ error: "invalid wallet" }), { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send("step", { msg: "fetching wallet PnL from solana tracker…" });
        const pnl = await getWalletPnl(wallet);
        const mints = Object.keys(pnl.tokens ?? {});
        send("step", { msg: `${mints.length} positions found` });

        if (!mints.length) {
          send("done", {
            empty: true,
            message: "no positions found. either this wallet is brand new, or you're already free.",
          });
          controller.close();
          return;
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
        const first = scoreFromTracker(wallet, pnl.tokens, aths, prices, solUsd, empty);

        const topMints = [...first.positions]
          .filter((p) => !p.excluded)
          .sort((a, b) => b.peakCopeUsd - a.peakCopeUsd)
          .slice(0, 5)
          .map((p) => p.mint);

        const symbols = new Map<string, string>();
        if (topMints.length) {
          send("step", { msg: `fetching symbols for top ${topMints.length} positions…` });
          for (const mint of topMints) {
            const info = await getTokenInfo(mint);
            if (info?.symbol) symbols.set(mint, info.symbol);
          }
        }

        const { receipt } = scoreFromTracker(wallet, pnl.tokens, aths, prices, solUsd, symbols);

        send("done", { empty: false, receipt });
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
