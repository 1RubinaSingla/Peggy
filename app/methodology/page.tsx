import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "methodology — peggy.cash",
  description: "how the cope score is calculated, what gets excluded, and what we can't see.",
};

export default function MethodologyPage() {
  return (
    <main className="methodology">
      <header className="hero">
        <h1 className="hero-title">methodology</h1>
        <p className="hero-pitch">
          how the score is calculated, what gets excluded, and what we cannot see. the math is
          honest. the conclusions are mean. both are intentional.
        </p>
      </header>

      <section className="doc-section">
        <h2>the score</h2>
        <p>
          peggy replays every memecoin you sold on Solana and computes how much SOL you&apos;d have
          if you&apos;d never sold. two numbers come out.
        </p>
      </section>

      <section className="doc-section">
        <h2>diamond cope</h2>
        <p>would-be value if you&apos;d just held everything you sold until today.</p>
        <pre className="formula">
{`diamond_cope_sol = Σ max(0, current_price_usd - avg_sell_price_usd) × tokens_sold
                / current_sol_usd`}
        </pre>
        <p>
          summed across every scored position. for most memecoin traders this is{" "}
          <span className="hl-warn">0 SOL</span> — almost all memecoins go to zero, so holding
          them until now means holding nothing.
        </p>
      </section>

      <section className="doc-section">
        <h2>peak cope</h2>
        <p>would-be value if you&apos;d sold every position at its all-time high.</p>
        <pre className="formula">
{`peak_cope_sol = Σ max(0, ATH_price_usd - avg_sell_price_usd) × tokens_sold
              / current_sol_usd`}
        </pre>
        <p>
          this is the more useful number in a market where everything dies. it captures the
          actual potential you fumbled at some moment in history.
        </p>
      </section>

      <section className="doc-section">
        <h2>worst single sell</h2>
        <p>
          across every individual sell transaction, the one with the highest{" "}
          <span className="hl">(ATH_price − sell_price) × tokens_sold</span>. one transaction.
          one moment. one number to share.
        </p>
      </section>

      <section className="doc-section">
        <h2>tier</h2>
        <p>tiers are assigned by peak cope. ranges, in SOL:</p>
        <ul className="tier-list">
          <li><span className="range">0 – 10</span><span>certified diamond</span></li>
          <li><span className="range">10 – 100</span><span>mostly fine</span></li>
          <li><span className="range">100 – 1,000</span><span>mid-curve cope</span></li>
          <li><span className="range">1k – 10k</span><span>serial fumbler</span></li>
          <li><span className="range">10k – 100k</span><span>paperhand emperor</span></li>
          <li><span className="range">100k+</span><span>should&apos;ve just bought bonk</span></li>
        </ul>
        <p>
          we tier on peak cope (not diamond) because diamond cope tends to 0 for serious
          memecoin traders. peak captures the real fumble.
        </p>
      </section>

      <section className="doc-section">
        <h2>the depth selector</h2>
        <p>
          we rank your positions by total USD sold (descending) and let you pick how many of the
          top positions to fully score. bigger sells = bigger potential fumbles, so top N always
          captures your worst cope. tail positions are typically dust.
        </p>
      </section>

      <section className="doc-section">
        <h2>data sources</h2>
        <dl className="kv">
          <div><dt>solana tracker</dt><dd>wallet PnL · individual trades · per-token ATH · current price · current liquidity</dd></div>
        </dl>
        <p>
          prices are converted USD ↔ SOL using the current SOL/USD rate. per-trade time-accurate
          conversion is a phase-2 problem.
        </p>
      </section>

      <section className="doc-section">
        <h2>what gets excluded</h2>
        <dl className="kv">
          <div><dt>never sold</dt><dd>no PnL to compute, no cope possible</dd></div>
          <div><dt>dust</dt><dd>positions below $1 invested or $1 sold</dd></div>
          <div><dt>no ATH data</dt><dd>solana tracker has no recorded peak for this token</dd></div>
          <div><dt>sold at/above ATH</dt><dd>either an honest top-sell, or our data missed the real peak. either way, no cope to extract.</dd></div>
        </dl>
      </section>

      <section className="doc-section">
        <h2>what we don&apos;t catch (yet)</h2>
        <dl className="kv">
          <div><dt>spl ↔ spl swaps</dt><dd>we only score sells where the trader received SOL</dd></div>
          <div><dt>airdrop sells</dt><dd>no cost basis from a buy → no usable peak cope math</dd></div>
          <div><dt>pre-indexing ATHs</dt><dd>peaks that happened before solana tracker started indexing the token are invisible</dd></div>
        </dl>
      </section>

      <section className="doc-section">
        <h2>limitations</h2>
        <p>this is an entertainment product. the math is honest, but:</p>
        <ol className="num-list">
          <li>
            ATHs are noisy on memecoins. a $5M mcap &quot;ATH&quot; on $200 of volume can still
            inflate your peak cope. we filter dust positions but the ATH itself is not
            liquidity-floor-checked yet.
          </li>
          <li>
            aggregate cope uses the average sell price across all of a token&apos;s sells. the
            single-sell card uses per-trade data.
          </li>
          <li>
            SOL/USD conversion uses the current rate, not the trade-time rate. trades from a
            year ago at higher SOL prices are slightly under-valued in SOL terms.
          </li>
        </ol>
        <p>if you find a bug, post the wallet and we&apos;ll look at it.</p>
      </section>

      <section className="doc-section">
        <h2>cache</h2>
        <p>
          receipts are cached for 24 hours after scoring. share urls (
          <span className="hl">peggy.cash/r/&lt;wallet&gt;</span>) read straight from the cache —
          instant for repeat visitors.
        </p>
      </section>

      <section className="doc-section">
        <h2>why</h2>
        <p>
          because the number hurts. and the number that hurts is the one people share. that&apos;s
          the whole thing.
        </p>
      </section>

      <footer className="footer">peggy.cash · the more you cope, the more we know</footer>
    </main>
  );
}
