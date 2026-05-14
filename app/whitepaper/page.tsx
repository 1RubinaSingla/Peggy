import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "whitepaper — peggy.cash",
  description:
    "the complete document. what cope is, how it's measured, how the leaderboard ranks fumblers, and how the $PEGGY airdrop rewards them.",
};

const SECTIONS = [
  { id: "abstract", n: "01", title: "abstract" },
  { id: "thesis", n: "02", title: "the thesis" },
  { id: "score", n: "03", title: "the score" },
  { id: "receipt", n: "04", title: "the receipt" },
  { id: "leaderboard", n: "05", title: "the leaderboard" },
  { id: "peggy", n: "06", title: "what is $peggy" },
  { id: "airdrop", n: "07", title: "the airdrop claim" },
  { id: "architecture", n: "08", title: "architecture" },
  { id: "privacy", n: "09", title: "privacy & trust" },
  { id: "limits", n: "10", title: "what we can't see" },
  { id: "roadmap", n: "11", title: "roadmap" },
];

function H({ n, title, id }: { n: string; title: string; id: string }) {
  return (
    <h2 id={id} className="wp-heading">
      <span className="wp-num">{n}</span>
      <span>{title}</span>
    </h2>
  );
}

export default function WhitepaperPage() {
  return (
    <main className="whitepaper methodology">
      <header className="hero">
        <p className="hero-kicker">whitepaper · v1</p>
        <h1 className="hero-title">peggy.cash</h1>
        <p className="hero-pitch">
          the complete document. what cope is, how it&apos;s measured, how the leaderboard ranks
          fumblers, and how the $PEGGY airdrop rewards the worst of them.
        </p>
      </header>

      <section className="wp-toc">
        <div className="wp-toc-head">contents</div>
        <ol className="wp-toc-list">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>
                <span className="wp-toc-num">{s.n}</span>
                <span>{s.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      <section className="doc-section">
        <H n="01" title="abstract" id="abstract" />
        <p>
          peggy.cash is a public, on-chain regret calculator for Solana memecoin traders. paste a
          wallet, get back two numbers — <span className="hl">peak cope</span> and{" "}
          <span className="hl">diamond cope</span> — that quantify how much SOL you fumbled by
          selling. the wallet&apos;s worst trades become a shareable receipt. the worst wallets
          land on a public leaderboard called the <span className="hl">wall of pain</span>.
          eligible top-20 wallets can claim a tiered{" "}
          <span className="hl-accent">$PEGGY</span> airdrop directly from the site.
        </p>
        <p>
          there is no auth. nothing is stored per-user except the localStorage chip of your last
          searches. the math is honest, the tone is not.
        </p>
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      <section className="doc-section">
        <H n="02" title="the thesis" id="thesis" />
        <p>
          every Solana memecoin trader has sold the same coin too early. they all know. nobody
          talks about it. portfolio trackers focus on what you made — peggy focuses on what you{" "}
          <span className="hl">didn&apos;t</span>. the regret has always been there; we just turn
          it into a number so it can be shared.
        </p>
        <p>
          the bet is simple: the most viral on-chain content is the kind that hurts. the more
          people cope, the more we know about how to measure cope. that&apos;s the loop.
        </p>
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      <section className="doc-section">
        <H n="03" title="the score" id="score" />
        <p>
          two numbers come out of every scoring run.{" "}
          <span className="hl">peak cope</span> is what you&apos;d have if you&apos;d sold each
          position at its all-time high.{" "}
          <span className="hl">diamond cope</span> is what you&apos;d have if you&apos;d just held
          everything until now.
        </p>
        <pre className="formula">
{`peak_cope_sol    = Σ max(0, ATH_price_usd     - avg_sell_price_usd) × tokens_sold / sol_usd
diamond_cope_sol = Σ max(0, current_price_usd - avg_sell_price_usd) × tokens_sold / sol_usd`}
        </pre>
        <p>
          for most memecoin traders, diamond cope is{" "}
          <span className="hl-warn">0 SOL</span> — everything they sold went to zero. peak cope
          captures the real fumble: there <em>was</em> a moment you could&apos;ve sold higher, and
          you didn&apos;t.
        </p>
        <p>
          tiers are assigned by peak cope; the full formula breakdown — exclusions, dust filters,
          the depth selector — lives in the{" "}
          <Link href="/methodology" className="hl-link">methodology page</Link>.
        </p>
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      <section className="doc-section">
        <H n="04" title="the receipt" id="receipt" />
        <p>
          every scored wallet produces a receipt with seven cards. the first two are aggregates;
          the rest are specific roasts pulled from the trade history.
        </p>
        <dl className="kv">
          <div><dt>peak cope</dt><dd>the headline number. SOL fumbled across every position.</dd></div>
          <div><dt>diamond cope</dt><dd>SOL still on the table if you&apos;d held everything.</dd></div>
          <div><dt>worst single sell</dt><dd>one transaction. biggest (ATH − sell) × tokens.</dd></div>
          <div><dt>worst fumble</dt><dd>token-level. biggest aggregate cope across a single ticker.</dd></div>
          <div><dt>biggest cope</dt><dd>highest ATH ÷ avg-sell multiplier. relative regret, not dollars.</dd></div>
          <div><dt>shortest hold</dt><dd>fastest first-buy → first-sell on a fumbled position.</dd></div>
          <div><dt>day from hell</dt><dd>the UTC day with the worst cumulative peak cope.</dd></div>
          <div><dt>best hold-that-never-was</dt><dd>a sell that&apos;s still mooning. the only amber card.</dd></div>
        </dl>
        <p>
          every fumble card prints the token&apos;s contract address with a one-click copy. tokens
          that never had a peak (sold at/above their ATH, missing data) are excluded by design.
        </p>
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      <section className="doc-section">
        <H n="05" title="the leaderboard" id="leaderboard" />
        <p>
          every successful scoring run lands the wallet on the{" "}
          <Link href="/leaderboard" className="hl-link">wall of pain</Link> — a single global
          leaderboard ranked by peak cope. the page is server-rendered and revalidates every 30s,
          so it feels live without sockets.
        </p>
        <dl className="kv">
          <div><dt>window</dt><dd>7 days. wallets fall off the board 7 days after their last scoring.</dd></div>
          <div><dt>rank scope</dt><dd>top 20 displayed. server overfetches 50 to handle TTL gaps cleanly.</dd></div>
          <div><dt>excludes</dt><dd>wallets with peak cope = 0 (no fumble) and any that scored empty.</dd></div>
          <div><dt>storage</dt><dd>upstash redis sorted set keyed by peakCopeSol, with per-wallet metadata.</dd></div>
        </dl>
        <p>
          there is no anti-spam yet. at current volume that&apos;s fine; if the site scales we&apos;d
          add IP-level rate limiting on the scoring endpoint and a minimum activity threshold.
        </p>
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      <section className="doc-section">
        <H n="06" title="what is $peggy" id="peggy" />
        <p>
          <span className="hl-accent">$PEGGY</span> is the native token of peggy.cash. it&apos;s a
          standard Solana SPL token, transferable like any other. its purpose is single and
          deliberate: to reward the worst sellers on the wall of pain — the people willing to
          paste their wallet and own the fumble in public.
        </p>
        <p>
          there is no presale, no team allocation, no points farm. every $PEGGY in circulation
          enters the world by being claimed off the leaderboard. the more cope the network surfaces,
          the more of the supply gets distributed.
        </p>
        <h3 className="wp-subhead">specs</h3>
        <dl className="kv">
          <div><dt>network</dt><dd>Solana (mainnet)</dd></div>
          <div><dt>standard</dt><dd>SPL token</dd></div>
          <div><dt>ticker</dt><dd>$PEGGY</dd></div>
          <div><dt>mint address</dt><dd>published at launch · pinned on <a href="https://x.com/PeggyOnPF" target="_blank" rel="noopener noreferrer" className="hl-link">@PeggyOnPF</a></dd></div>
          <div><dt>supply</dt><dd>fixed at mint · no inflation, no reissue</dd></div>
        </dl>
        <h3 className="wp-subhead">distribution</h3>
        <p>
          the entire claimable supply lives in the dev wallet and only leaves it through the
          airdrop claim flow described in the next section. tier multipliers shape who gets what:
          the #1 fumbler walks away with five times the base; rank #20 still walks away with
          something. drift off the top-20 within seven days and the seat opens up for someone
          worse.
        </p>
        <h3 className="wp-subhead">utility</h3>
        <ol className="num-list">
          <li>
            <span className="hl">claim reward</span> — the immediate utility. you cope, you get
            paid.
          </li>
          <li>
            <span className="hl">social proof</span> — holding $PEGGY is a receipt of public
            humiliation. that&apos;s the point.
          </li>
          <li>
            <span className="hl">future hooks</span> — token-gated leaderboard cosmetics,
            seasonal rewards, and snapshot-based airdrops for the worst weeks/months are on the
            roadmap. anything that gets added compounds on the same supply already in circulation.
          </li>
        </ol>
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      <section className="doc-section">
        <H n="07" title="the airdrop claim" id="airdrop" />
        <p>
          the top 20 wallets on the wall of pain are eligible to claim a tiered{" "}
          <span className="hl-accent">$PEGGY</span> airdrop directly from{" "}
          <Link href="/leaderboard" className="hl-link">/leaderboard</Link>. the bigger the cope,
          the bigger the bag.
        </p>
        <p>tier multipliers on a configurable base amount:</p>
        <ul className="tier-list">
          <li><span className="range">rank #1</span><span>5× base</span></li>
          <li><span className="range">ranks #2 – 3</span><span>3× base</span></li>
          <li><span className="range">ranks #4 – 10</span><span>1.5× base</span></li>
          <li><span className="range">ranks #11 – 20</span><span>1× base</span></li>
          <li><span className="range">outside top 20</span><span>not eligible</span></li>
        </ul>
        <p>
          eligibility is re-checked against the <em>live</em> top-20 at claim time — not against a
          stale snapshot the client provides. claiming a stale rank that&apos;s since dropped off
          the board returns an error.
        </p>
        <h3 className="wp-subhead">claim flow</h3>
        <ol className="num-list">
          <li>connect Phantom; the UI reads your pubkey.</li>
          <li>UI hits the eligibility endpoint — server reports your rank, tier, amount, and whether you&apos;ve already claimed.</li>
          <li>if eligible and unclaimed, click <span className="hl">claim</span>. Phantom prompts you to sign a short message containing your wallet address and a current timestamp.</li>
          <li>UI posts the signature + timestamp to the claim endpoint. server verifies the ed25519 signature, re-checks eligibility against the live board, takes an atomic redis lock, and sends an SPL transfer from the dev wallet to your ATA (creating the ATA if needed).</li>
          <li>on confirmation, the claim is recorded permanently. the UI shows a solscan link to the transaction.</li>
        </ol>
        <h3 className="wp-subhead">security model</h3>
        <dl className="kv">
          <div><dt>signer key</dt><dd>lives only in a server-side env var. never reaches any client bundle.</dd></div>
          <div><dt>ownership proof</dt><dd>5-minute freshness window on the signed message. signature is verified against a canonical message the server reconstructs from (wallet, ts), so the client can&apos;t inject arbitrary payloads.</dd></div>
          <div><dt>double-claim</dt><dd>per-wallet redis lock for the duration of the transfer; permanent claim record on success.</dd></div>
          <div><dt>rate limit</dt><dd>5 claim attempts per IP per 60s.</dd></div>
          <div><dt>graceful disable</dt><dd>if any required env var is missing or malformed, the feature self-disables and the claim card stays hidden — the rest of the site is unaffected.</dd></div>
        </dl>
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      <section className="doc-section">
        <H n="08" title="architecture" id="architecture" />
        <dl className="kv">
          <div><dt>frontend</dt><dd>next.js 15 app router · react 19 · server components everywhere except the small interactive bits (wallet input, claim widget).</dd></div>
          <div><dt>data plane</dt><dd>solana tracker rest api for PnL, ATHs, current prices, and individual trades. one stream per scoring run.</dd></div>
          <div><dt>cache</dt><dd>upstash redis for receipt cache (24h TTL), share-page lookup, leaderboard sorted set, claim records, and rate-limiting counters. local in-memory fallback for dev.</dd></div>
          <div><dt>chain</dt><dd>@solana/web3.js + @solana/spl-token. mainnet. signer wallet pays transaction fees and ATA rent.</dd></div>
          <div><dt>hosting</dt><dd>vercel. node 22+ runtime on every api route. streamed responses for the scoring pipeline.</dd></div>
        </dl>
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      <section className="doc-section">
        <H n="09" title="privacy & trust" id="privacy" />
        <p>
          peggy.cash has no accounts, no email, no analytics tying you to a session. you paste a
          wallet, we score it, the result is public — same as the on-chain history it came from.
        </p>
        <dl className="kv">
          <div><dt>what we store</dt><dd>the scored receipt (24h TTL), leaderboard metadata (8d TTL), claim records (permanent).</dd></div>
          <div><dt>what we don&apos;t</dt><dd>your IP beyond rate-limit windows, your phantom pubkey unless you claim, cross-session identity.</dd></div>
          <div><dt>what stays on your device</dt><dd>the recent-search chips on the home page. localStorage only. cleared if you clear site data.</dd></div>
        </dl>
        <p>
          the airdrop signer key is generated by the operator and held in env. we recommend a
          dedicated wallet funded only with the airdrop budget so blast radius is bounded if the
          key ever leaks.
        </p>
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      <section className="doc-section">
        <H n="10" title="what we can't see" id="limits" />
        <p>this is an entertainment product. the math is honest, but it has limits:</p>
        <dl className="kv">
          <div><dt>spl ↔ spl swaps</dt><dd>we only score sells where the trader received SOL. routing through an intermediate token hides the trade.</dd></div>
          <div><dt>airdrop sells</dt><dd>no cost basis from a buy → no usable peak cope math.</dd></div>
          <div><dt>pre-indexing ATHs</dt><dd>peaks that happened before solana tracker started indexing the token are invisible.</dd></div>
          <div><dt>sol/usd drift</dt><dd>we convert at the current rate, not the trade-time rate. trades from much higher sol prices are slightly under-counted in sol terms.</dd></div>
          <div><dt>noisy ATHs</dt><dd>a $5m mcap on $200 of volume can still inflate peak cope. dust positions are filtered; the ATH itself is not yet liquidity-floor-checked.</dd></div>
        </dl>
        <p>
          if you find a wallet where the number is clearly wrong, send it — we&apos;ll look at it
          and improve the filters.
        </p>
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      <section className="doc-section">
        <H n="11" title="roadmap" id="roadmap" />
        <ul className="num-list">
          <li>liquidity-floor on ATH so dead-token peaks don&apos;t inflate scores.</li>
          <li>trade-time sol/usd conversion for historical accuracy.</li>
          <li>spl-to-spl swap support so non-sol-routed sells count.</li>
          <li>more roast cards: revenge buy, rug-holder, weekend trader.</li>
          <li>per-wallet share images that quote the worst card on a 1200×630 canvas.</li>
          <li>seasonal leaderboards (weekly / monthly hall of pain).</li>
          <li>retroactive airdrop snapshots so each cycle has a clean eligibility set.</li>
        </ul>
      </section>

      <footer className="footer">peggy.cash · the more you cope, the more we know</footer>
    </main>
  );
}
