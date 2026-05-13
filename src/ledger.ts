import type { ClosedLot, LedgerEntry } from "./types.ts";

type OpenLot = { sig: string; ts: number; remainingTokens: number; pricePerTokenSol: number };

// FIFO match: for each mint, queue buys; each sell consumes from the front of the queue,
// producing one ClosedLot per buy-slice consumed. Sells without a matching buy are dropped
// (airdrop/transfer-in tokens have no cost basis — exactly the filter we want).
export function buildClosedLots(ledger: LedgerEntry[]): ClosedLot[] {
  const byMint = new Map<string, LedgerEntry[]>();
  for (const e of ledger) {
    const arr = byMint.get(e.mint) ?? [];
    arr.push(e);
    byMint.set(e.mint, arr);
  }

  const lots: ClosedLot[] = [];

  for (const [mint, entries] of byMint) {
    const openLots: OpenLot[] = [];
    for (const e of entries) {
      if (e.side === "buy") {
        openLots.push({
          sig: e.signature,
          ts: e.ts,
          remainingTokens: e.tokenAmount,
          pricePerTokenSol: e.solAmount / e.tokenAmount,
        });
        continue;
      }

      // sell: consume from FIFO
      let remainingToSell = e.tokenAmount;
      const sellPricePerToken = e.solAmount / e.tokenAmount;
      while (remainingToSell > 0 && openLots.length) {
        const head = openLots[0];
        const take = Math.min(head.remainingTokens, remainingToSell);
        lots.push({
          mint,
          buySig: head.sig,
          sellSig: e.signature,
          buyTs: head.ts,
          sellTs: e.ts,
          tokenAmount: take,
          solCostBasis: take * head.pricePerTokenSol,
          solProceeds: take * sellPricePerToken,
          buyPriceSol: head.pricePerTokenSol,
          sellPriceSol: sellPricePerToken,
        });
        head.remainingTokens -= take;
        remainingToSell -= take;
        if (head.remainingTokens <= 1e-12) openLots.shift();
      }
      // any unmatched remainder is no-cost-basis (airdrop sell etc.) — drop silently
    }
  }

  return lots;
}
