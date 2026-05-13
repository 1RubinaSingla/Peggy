// Pure render component — works as a server component or inside a client component.
// Shared between the live scoring page and the /r/[wallet] share page.

import type { CopeReceipt } from "../../src/types.ts";
import { CopyButton } from "./CopyButton.tsx";

export function fmtSol(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M SOL`;
  if (n >= 1_000) return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} SOL`;
  return `${n.toFixed(2)} SOL`;
}

export function fmtUsd(n: number) {
  if (n >= 1_000_000) return `~$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `~$${(n / 1_000).toFixed(1)}K`;
  if (n >= 1) return `~$${n.toFixed(0)}`;
  return `~$${n.toFixed(2)}`;
}

export function shortAddr(a: string) {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function fmtDate(ms: number) {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtTokens(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtDuration(ms: number) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 24) return mm ? `${h}h ${mm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return hh ? `${d}d ${hh}h` : `${d}d`;
}

function CaRow({ mint }: { mint: string }) {
  return (
    <div className="fumble-ca">
      <span className="fumble-ca-label">ca</span>
      <a
        href={`https://solscan.io/token/${mint}`}
        target="_blank"
        rel="noopener noreferrer"
        className="fumble-ca-value"
        title={mint}
      >
        {mint}
      </a>
      <CopyButton text={mint} label="contract address" />
    </div>
  );
}

export function Receipt({ receipt: r }: { receipt: CopeReceipt }) {
  const solUsd = r.solUsd ?? 0;
  const usd = (sol: number) => (solUsd > 0 ? <span className="usd-approx"> · {fmtUsd(sol * solUsd)}</span> : null);
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
          <div className="stat-label">Peak cope</div>
          <div className="stat-value">
            {fmtSol(r.peakCopeSol)}
            {solUsd > 0 && <span className="usd-approx big"> · {fmtUsd(r.peakCopeSol * solUsd)}</span>}
          </div>
          <div className="stat-caption">if you&apos;d sold every position at its top — god mode</div>
        </div>

        <div className="stat">
          <div className="stat-label">Diamond cope</div>
          <div className="stat-value secondary">
            {fmtSol(r.diamondCopeSol)}
            {solUsd > 0 && <span className="usd-approx"> · {fmtUsd(r.diamondCopeSol * solUsd)}</span>}
          </div>
          <div className="stat-caption">would-be value if you&apos;d just held</div>
        </div>

        <div className="divider" />

        <div className="tier">
          <div className="stat-label">Your tier</div>
          <div className="tier-name">{r.tier.name}</div>
          <div className="tier-blurb">{r.tier.blurb}</div>
        </div>

        {r.worstSingleSell && r.worstSingleSell.fumbleSol > 0 && (
          <div className="fumble">
            <div className="fumble-tag">worst single sell</div>
            <div className="fumble-symbol">${r.worstSingleSell.symbol || shortAddr(r.worstSingleSell.mint)}</div>
            <CaRow mint={r.worstSingleSell.mint} />
            <div className="fumble-detail">
              on {fmtDate(r.worstSingleSell.ts)}, sold {fmtTokens(r.worstSingleSell.tokensSold)} tokens
              for {fmtSol(r.worstSingleSell.solReceived)}{usd(r.worstSingleSell.solReceived)}
            </div>
            <div className="fumble-detail">
              ATH was {r.worstSingleSell.peakMultiplier.toFixed(1)}x your sell price
            </div>
            <div className="fumble-detail highlight">
              single-sell fumble: {fmtSol(r.worstSingleSell.fumbleSol)}{usd(r.worstSingleSell.fumbleSol)}
            </div>
          </div>
        )}

        {r.worstSell && r.worstSell.peakCopeSol > 0 && (
          <div className="fumble">
            <div className="fumble-tag">worst fumble</div>
            <div className="fumble-symbol">${r.worstSell.symbol || shortAddr(r.worstSell.mint)}</div>
            <CaRow mint={r.worstSell.mint} />
            <div className="fumble-detail">
              sold {r.worstSell.tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
              tokens for {fmtSol(r.worstSell.solProceeds)}{usd(r.worstSell.solProceeds)}
            </div>
            <div className="fumble-detail">
              ATH was {r.worstSell.peakMultiplier.toFixed(1)}x your average sell price
            </div>
            <div className="fumble-detail highlight">
              fumbled {fmtSol(r.worstSell.peakCopeSol)}{usd(r.worstSell.peakCopeSol)}
            </div>
          </div>
        )}

        {r.biggestCopeMultiplier &&
          r.biggestCopeMultiplier.peakCopeSol > 0 &&
          r.biggestCopeMultiplier.mint !== r.worstSell?.mint && (
            <div className="fumble">
              <div className="fumble-tag">biggest cope</div>
              <div className="fumble-symbol">
                ${r.biggestCopeMultiplier.symbol || shortAddr(r.biggestCopeMultiplier.mint)}
              </div>
              <CaRow mint={r.biggestCopeMultiplier.mint} />
              <div className="fumble-detail">
                you sold at {(1 / r.biggestCopeMultiplier.peakMultiplier).toFixed(3)}x of ATH
                — ATH was {r.biggestCopeMultiplier.peakMultiplier.toFixed(0)}x your avg sell price
              </div>
              <div className="fumble-detail highlight">
                fumbled {fmtSol(r.biggestCopeMultiplier.peakCopeSol)}
                {usd(r.biggestCopeMultiplier.peakCopeSol)}
              </div>
            </div>
          )}

        {r.shortestHold && r.shortestHold.peakCopeSol > 0 && (
          <div className="fumble">
            <div className="fumble-tag">shortest hold</div>
            <div className="fumble-symbol">${r.shortestHold.symbol || shortAddr(r.shortestHold.mint)}</div>
            <CaRow mint={r.shortestHold.mint} />
            <div className="fumble-detail">
              you held for {fmtDuration(r.shortestHold.holdMs)} before exiting
            </div>
            <div className="fumble-detail">
              ATH later was {r.shortestHold.peakMultiplier.toFixed(1)}x your exit price
            </div>
            <div className="fumble-detail highlight">
              fumbled {fmtSol(r.shortestHold.peakCopeSol)}{usd(r.shortestHold.peakCopeSol)}
            </div>
          </div>
        )}

        {r.dayFromHell && r.dayFromHell.fumbleSol > 0 && (
          <div className="fumble">
            <div className="fumble-tag">day from hell</div>
            <div className="fumble-symbol">{fmtDate(r.dayFromHell.dateMs)}</div>
            <div className="fumble-detail">
              {r.dayFromHell.sellCount} sells across{" "}
              {r.dayFromHell.symbols.map((s) => `$${s}`).join(", ")}
            </div>
            <div className="fumble-detail highlight">
              fumbled {fmtSol(r.dayFromHell.fumbleSol)}{usd(r.dayFromHell.fumbleSol)} in one day
            </div>
          </div>
        )}

        {r.bestHoldThatNeverWas &&
          r.bestHoldThatNeverWas.diamondCopeSol > 0 &&
          r.bestHoldThatNeverWas.mint !== r.worstSell?.mint && (
            <div className="fumble">
              <div className="fumble-tag amber">best hold-that-never-was</div>
              <div className="fumble-symbol">
                ${r.bestHoldThatNeverWas.symbol || shortAddr(r.bestHoldThatNeverWas.mint)}
              </div>
              <CaRow mint={r.bestHoldThatNeverWas.mint} />
              <div className="fumble-detail">still alive. still mooning. without you.</div>
              <div className="fumble-detail highlight amber">
                holding today would be worth +{fmtSol(r.bestHoldThatNeverWas.diamondCopeSol)}
                {usd(r.bestHoldThatNeverWas.diamondCopeSol)}
              </div>
            </div>
          )}
      </div>
    </section>
  );
}
