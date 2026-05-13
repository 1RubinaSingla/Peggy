// Pure render component — works as a server component or inside a client component.
// Shared between the live scoring page and the /r/[wallet] share page.

import type { CopeReceipt } from "../../src/types.ts";

export function fmtSol(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M SOL`;
  if (n >= 1_000) return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} SOL`;
  return `${n.toFixed(2)} SOL`;
}

export function shortAddr(a: string) {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

export function Receipt({ receipt: r }: { receipt: CopeReceipt }) {
  return (
    <section className="card receipt" aria-live="polite">
      <div className="receipt-meta">
        <span className="group">
          <span className="k">wallet</span>
          <span className="v">{shortAddr(r.wallet)}</span>
        </span>
        <span className="group">
          <span className="k">scored</span>
          <span className="v">
            {r.tokensEvaluated - r.tokensExcluded}
            {r.tokensExcluded > 0 && <span className="k"> · {r.tokensExcluded} excluded</span>}
            {r.totalSoldPositions !== undefined &&
              r.scoredPositions !== undefined &&
              r.scoredPositions < r.totalSoldPositions && (
                <span className="k"> · of {r.totalSoldPositions} total</span>
              )}
          </span>
        </span>
      </div>

      <div className="receipt-body">
        <div className="stat">
          <div className="stat-label">Diamond cope</div>
          <div className="stat-value">{fmtSol(r.diamondCopeSol)}</div>
          <div className="stat-caption">would-be value if you&apos;d just held</div>
        </div>

        <div className="stat">
          <div className="stat-label">Peak cope</div>
          <div className="stat-value secondary">{fmtSol(r.peakCopeSol)}</div>
          <div className="stat-caption">if you&apos;d sold every position at its top — god mode</div>
        </div>

        <div className="divider" />

        <div className="tier">
          <div className="stat-label">Your tier</div>
          <div className="tier-name">{r.tier.name}</div>
          <div className="tier-blurb">{r.tier.blurb}</div>
        </div>

        {r.worstSell && r.worstSell.peakCopeSol > 0 && (
          <div className="fumble">
            <div className="fumble-tag">worst fumble</div>
            <div className="fumble-symbol">${r.worstSell.symbol ?? shortAddr(r.worstSell.mint)}</div>
            <div className="fumble-detail">
              sold {r.worstSell.tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
              tokens for {fmtSol(r.worstSell.solProceeds)}
            </div>
            <div className="fumble-detail">
              ATH was {r.worstSell.peakMultiplier.toFixed(1)}x your average sell price
            </div>
            <div className="fumble-detail highlight">fumbled {fmtSol(r.worstSell.peakCopeSol)}</div>
          </div>
        )}

        {r.bestHoldThatNeverWas &&
          r.bestHoldThatNeverWas.diamondCopeSol > 0 &&
          r.bestHoldThatNeverWas.mint !== r.worstSell?.mint && (
            <div className="fumble">
              <div className="fumble-tag amber">best hold-that-never-was</div>
              <div className="fumble-symbol">
                ${r.bestHoldThatNeverWas.symbol ?? shortAddr(r.bestHoldThatNeverWas.mint)}
              </div>
              <div className="fumble-detail">still alive. still mooning. without you.</div>
              <div className="fumble-detail highlight amber">
                holding today would be worth +{fmtSol(r.bestHoldThatNeverWas.diamondCopeSol)}
              </div>
            </div>
          )}
      </div>
    </section>
  );
}
