// Global, public leaderboard — same view for every visitor.
// Server-rendered with a 30s revalidation window so the page feels live
// without polling. Data lives in Upstash; see src/leaderboard.ts.

import type { Metadata } from "next";
import Link from "next/link";
import { getWallOfPain, type LeaderboardEntry } from "../../src/leaderboard.ts";
import { AirdropClaim } from "../components/AirdropClaim.tsx";
import { fmtSol, fmtUsd, shortAddr } from "../components/Receipt.tsx";

export const metadata: Metadata = {
  title: "wall of pain — peggy.cash",
  description: "the worst memecoin sellers on Solana, ranked. updated as wallets get scored.",
};

// Server-render and revalidate every 30s. Each visitor reads the cached HTML
// until that TTL elapses, then the next visitor gets a fresh render.
export const revalidate = 30;

function fmtAgo(ms: number) {
  const secs = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function Row({ rank, entry }: { rank: number; entry: LeaderboardEntry }) {
  const usd = entry.solUsd ? entry.peakCopeSol * entry.solUsd : 0;
  return (
    <li className={`lb-row${rank <= 3 ? " top" : ""}`}>
      <span className="lb-rank">#{rank}</span>
      <div className="lb-main">
        <Link href={`/r/${entry.wallet}`} className="lb-wallet" title={entry.wallet}>
          {shortAddr(entry.wallet)}
        </Link>
        <div className="lb-meta">
          <span className="lb-tier">{entry.tierName}</span>
          {entry.worstSymbol && <span className="lb-token">· ${entry.worstSymbol}</span>}
          <span className="lb-ago">· {fmtAgo(entry.scoredAt)}</span>
        </div>
      </div>
      <div className="lb-score">
        <div className="lb-sol">{fmtSol(entry.peakCopeSol)}</div>
        {usd > 0 && <div className="lb-usd">{fmtUsd(usd)}</div>}
      </div>
    </li>
  );
}

export default async function LeaderboardPage() {
  const entries = await getWallOfPain(20);

  return (
    <main className="leaderboard">
      <header className="hero">
        <p className="hero-kicker">wall of pain</p>
        <h1 className="hero-title">the worst sellers on solana.</h1>
        <p className="hero-pitch">
          live ranking of the most cope per wallet, scored within the last 7 days.
          your wallet shows up here automatically when it gets scored — the more you cope,
          the higher you climb.
        </p>
      </header>

      <section className="lb-card">
        <div className="lb-card-head">
          <span className="k">top 20</span>
          <span className="k">by peak cope · 7d window</span>
        </div>

        {entries.length === 0 ? (
          <div className="lb-empty">
            no qualifying wallets in the last 7 days. score one to seed the board.
          </div>
        ) : (
          <ol className="lb-list">
            {entries.map((entry, i) => (
              <Row key={entry.wallet} rank={i + 1} entry={entry} />
            ))}
          </ol>
        )}
      </section>

      <AirdropClaim />

      <p className="lb-note">
        wallets are added automatically when they&apos;re scored. dust and zero-cope wallets are
        skipped. entries fall off the board 7 days after their last scoring.
      </p>
    </main>
  );
}
