// Per-wallet share page. Server-rendered from the cache so it unfurls cleanly on Twitter
// and renders fast for every visitor. If we don't have the wallet cached, we redirect to
// the home page with the address pre-filled so the visitor can score it themselves.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { cacheGet, latestReceiptKey } from "../../../src/cache.ts";
import type { CopeReceipt } from "../../../src/types.ts";
import { Receipt, fmtSol, shortAddr } from "../../components/Receipt.tsx";

const SOLANA_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type RouteParams = { wallet: string };

async function loadReceipt(wallet: string): Promise<CopeReceipt | null> {
  if (!SOLANA_ADDR.test(wallet)) return null;
  return cacheGet<CopeReceipt>(latestReceiptKey(wallet));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { wallet } = await params;
  const receipt = await loadReceipt(wallet);

  if (!receipt) {
    return {
      title: "peggy.cash — the cope calculator",
      description: "score your wallet at peggy.cash",
    };
  }

  const headline = receipt.peakCopeSol > 0
    ? `${fmtSol(receipt.peakCopeSol)} fumbled · ${receipt.tier.name}`
    : receipt.tier.name;

  // Prefer the single-sell narrative for the description — specific stories travel.
  const ws = receipt.worstSingleSell;
  const single = ws && ws.fumbleSol > 0 && ws.symbol
    ? ` worst single sell: $${ws.symbol} (${ws.peakMultiplier.toFixed(1)}x, ${fmtSol(ws.fumbleSol)} fumbled)`
    : receipt.worstSell?.symbol && receipt.worstSell.peakCopeSol > 0
      ? ` worst fumble: $${receipt.worstSell.symbol} (${fmtSol(receipt.worstSell.peakCopeSol)})`
      : "";
  const description = `${shortAddr(wallet)} — ${headline}.${single}`;

  const ogImage = `/api/og?wallet=${wallet}`;

  return {
    title: `${headline} — peggy.cash`,
    description,
    openGraph: {
      title: headline,
      description,
      url: `/r/${wallet}`,
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: headline,
      description,
      images: [ogImage],
    },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { wallet } = await params;
  const receipt = await loadReceipt(wallet);

  // No cache hit → bounce the visitor to home with the wallet pre-filled.
  if (!receipt) {
    if (SOLANA_ADDR.test(wallet)) redirect(`/?wallet=${wallet}`);
    redirect("/");
  }

  return (
    <main>
      <header className="hero">
        <a href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="brand">
            <span className="brand-mark">peggy.cash</span>
            <span className="brand-tag">the cope calculator</span>
          </div>
        </a>
        <p className="hero-pitch">
          a wallet&apos;s public receipt. you can score yours too —{" "}
          <a href="/" style={{ color: "var(--accent)", textDecoration: "none" }}>
            try it
          </a>
          .
        </p>
      </header>

      <Receipt receipt={receipt} />

      <footer className="footer">peggy.cash · the more you cope, the more we know</footer>
    </main>
  );
}
