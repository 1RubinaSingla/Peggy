// Phase 0 spike — Solana Tracker pipeline.
// One PnL call → list of (mint, sold, sold_usd, ...). Then ATH per token + current prices in one batch.
// Token symbols pulled lazily for the top reportable positions only.

import { getAthBatch, getCurrentSolUsd, getMultiPrice, getTokenInfo, getWalletPnl } from "./tracker.ts";
import { scoreFromTracker } from "./score.ts";

const wallet = process.argv[2];
if (!wallet) {
  console.error("usage: npm run spike -- <wallet>");
  process.exit(1);
}

const log = (m: string) => console.log(`· ${m}`);
const fmtSol = (n: number) => `${n.toFixed(2)} SOL`;
const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

console.log(`\nscoring ${short(wallet)} — this is going to hurt\n`);

log("fetching wallet PnL from solana tracker…");
const pnl = await getWalletPnl(wallet);
const positionCount = Object.keys(pnl.tokens ?? {}).length;
log(`${positionCount} positions found`);

if (!positionCount) {
  console.log("\nno positions found. either this wallet is brand new, or you're already free.\n");
  process.exit(0);
}

const mints = Object.keys(pnl.tokens);

log("fetching current prices…");
const prices = await getMultiPrice(mints);
log(`${prices.size}/${mints.length} prices returned`);

log("fetching ATH per token…");
const aths = await getAthBatch(mints, (d, t) => process.stdout.write(`\r  ${d}/${t}`));
process.stdout.write("\n");
log(`${aths.size}/${mints.length} ATHs returned`);

log("fetching SOL/USD…");
const solUsd = await getCurrentSolUsd();
log(`SOL = $${solUsd.toFixed(2)}`);

// Initial score with no symbols, then enrich top 5 reportable positions.
log("computing cope…");
const empty = new Map<string, string>();
const first = scoreFromTracker(wallet, pnl.tokens, aths, prices, solUsd, empty);

const topMints = [...first.positions]
  .filter((p) => !p.excluded)
  .sort((a, b) => b.peakCopeUsd - a.peakCopeUsd)
  .slice(0, 5)
  .map((p) => p.mint);

const symbols = new Map<string, string>();
if (topMints.length) {
  log(`fetching symbols for top ${topMints.length} positions…`);
  for (const mint of topMints) {
    const info = await getTokenInfo(mint);
    if (info?.symbol) symbols.set(mint, info.symbol);
  }
}

const { receipt: r, positions } = scoreFromTracker(wallet, pnl.tokens, aths, prices, solUsd, symbols);

// ─── Diagnostic block ───────────────────────────────────────────────────────
{
  const breakdown = new Map<string, number>();
  for (const p of positions) breakdown.set(p.exclusionReason ?? "included", (breakdown.get(p.exclusionReason ?? "included") ?? 0) + 1);
  console.log("\n  ─── diagnostic ───");
  for (const [r, c] of breakdown) console.log(`    ${r}: ${c}`);
  const topShown = [...positions].filter((p) => !p.excluded).sort((a, b) => b.peakCopeUsd - a.peakCopeUsd).slice(0, 3);
  for (const p of topShown) {
    console.log(`    [included] $${p.symbol ?? "?"} sold=${p.sold.toLocaleString()} avgSell=$${p.avgSellPriceUsd.toExponential(2)} ATH=$${p.athPriceUsd.toExponential(2)} now=$${p.currentPriceUsd.toExponential(2)} peakCope=$${p.peakCopeUsd.toFixed(2)} diamondCope=$${p.diamondCopeUsd.toFixed(2)}`);
  }
}

// ─── Receipt ────────────────────────────────────────────────────────────────
console.log(`
═══════════════════════════════════════════════════════════════
                    THE RECEIPT
═══════════════════════════════════════════════════════════════

  wallet:           ${short(wallet)}
  tokens scored:    ${r.tokensEvaluated - r.tokensExcluded} (${r.tokensExcluded} excluded)
  positions:        ${r.closedLots}

  DIAMOND COPE:     ${fmtSol(r.diamondCopeSol)}
                    ${"would-be value if you'd just held"}

  PEAK COPE:        ${fmtSol(r.peakCopeSol)}
                    ${"if you'd sold every position at its top (god mode)"}

  TIER:             ${r.tier.name.toUpperCase()}
                    ${r.tier.blurb}
`);

if (r.worstSell) {
  const w = r.worstSell;
  console.log(`  WORST FUMBLE (token-level):`);
  console.log(`    $${w.symbol ?? short(w.mint)}`);
  console.log(`    sold ${w.tokenAmount.toLocaleString()} tokens for ${fmtSol(w.solProceeds)}`);
  console.log(`    ATH was ${w.peakMultiplier > 0 ? `${w.peakMultiplier.toFixed(1)}x your avg sell` : "n/a"}`);
  console.log(`    fumbled: ${fmtSol(w.peakCopeSol)}\n`);
}

if (
  r.bestHoldThatNeverWas &&
  r.bestHoldThatNeverWas.diamondCopeSol > 0 &&
  r.bestHoldThatNeverWas.mint !== r.worstSell?.mint
) {
  const b = r.bestHoldThatNeverWas;
  console.log(`  BEST HOLD-THAT-NEVER-WAS:`);
  console.log(`    $${b.symbol ?? short(b.mint)}`);
  console.log(`    still alive. still mooning. without you.`);
  console.log(`    holding today would be worth: +${fmtSol(b.diamondCopeSol)}\n`);
}

console.log("═══════════════════════════════════════════════════════════════\n");
