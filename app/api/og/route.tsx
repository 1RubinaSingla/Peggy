// 1200×630 PNG receipt card for Twitter/Telegram/Discord unfurls.
// Leads with the tier name as the visual identity. Numbers as supporting evidence.
// Reads from the same cache the share page reads — both stay in sync.

import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { cacheGet, latestReceiptKey } from "../../../src/cache.ts";
import type { CopeReceipt } from "../../../src/types.ts";

export const runtime = "nodejs";

const SOLANA_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const COLORS = {
  bg: "#0a0a0b",
  bgElev: "#111114",
  border: "#1f1f24",
  fg: "#fafafa",
  muted: "#8b8b95",
  dim: "#5a5a63",
  accent: "#00ff88",
  warn: "#ff4d4d",
  amber: "#ffb84d",
};

// Tier-aware accent color (more pain → redder; mild → green-ish)
function tierColor(tier: string): string {
  const t = tier.toLowerCase();
  if (t.includes("emperor") || t.includes("bonk") || t.includes("fumbler")) return COLORS.warn;
  if (t.includes("mid")) return COLORS.amber;
  if (t.includes("fine") || t.includes("diamond")) return COLORS.accent;
  return COLORS.warn;
}

function fmtSol(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M SOL`;
  if (n >= 1_000) return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} SOL`;
  return `${n.toFixed(2)} SOL`;
}
function shortAddr(a: string) {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}
function fmtTokens(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmtShortDate(ms: number) {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ErrorCard(message: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: COLORS.bg,
          color: COLORS.fg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "monospace",
          fontSize: 36,
          padding: 80,
        }}
      >
        {message}
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim();
  if (!wallet || !SOLANA_ADDR.test(wallet)) return ErrorCard("invalid wallet");

  const r = await cacheGet<CopeReceipt>(latestReceiptKey(wallet));
  if (!r) return ErrorCard("no receipt cached — score the wallet first at peggy.cash");

  const accent = tierColor(r.tier.name);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: COLORS.bg,
          color: COLORS.fg,
          display: "flex",
          flexDirection: "column",
          padding: 56,
          fontFamily: "monospace",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <div
              style={{
                width: 8,
                height: 36,
                background: COLORS.accent,
                marginRight: 4,
                alignSelf: "center",
              }}
            />
            <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: -0.5 }}>peggy.cash</div>
            <div style={{ fontSize: 18, color: COLORS.dim }}>// the cope calculator</div>
          </div>
          <div style={{ fontSize: 20, color: COLORS.muted, letterSpacing: 1 }}>
            {shortAddr(wallet)}
          </div>
        </div>

        {/* tier as identity */}
        <div style={{ marginTop: 48, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 14, color: COLORS.dim, letterSpacing: 4, textTransform: "uppercase" }}>
            your tier
          </div>
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              color: accent,
              letterSpacing: -2,
              textTransform: "uppercase",
              lineHeight: 1,
              marginTop: 12,
            }}
          >
            {r.tier.name}
          </div>
          {r.worstSingleSell && r.worstSingleSell.fumbleSol > 0 ? (
            <div
              style={{
                fontSize: 26,
                color: COLORS.fg,
                marginTop: 18,
                maxWidth: 1080,
                lineHeight: 1.35,
              }}
            >
              {`$${r.worstSingleSell.symbol ?? shortAddr(r.worstSingleSell.mint)} · ${fmtTokens(r.worstSingleSell.tokensSold)} sold for ${fmtSol(r.worstSingleSell.solReceived)} on ${fmtShortDate(r.worstSingleSell.ts)} · ATH ${r.worstSingleSell.peakMultiplier.toFixed(1)}x`}
            </div>
          ) : (
            <div
              style={{
                fontSize: 22,
                color: COLORS.muted,
                marginTop: 16,
                maxWidth: 1000,
                lineHeight: 1.4,
              }}
            >
              {r.tier.blurb}
            </div>
          )}
        </div>

        {/* footer row: numbers + worst fumble */}
        <div
          style={{
            marginTop: "auto",
            paddingTop: 32,
            borderTop: `1px solid ${COLORS.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div style={{ display: "flex", gap: 64 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  fontSize: 12,
                  color: COLORS.dim,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                }}
              >
                peak cope
              </div>
              <div style={{ fontSize: 44, fontWeight: 600, color: COLORS.warn, marginTop: 6 }}>
                {fmtSol(r.peakCopeSol)}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  fontSize: 12,
                  color: COLORS.dim,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                }}
              >
                diamond cope
              </div>
              <div style={{ fontSize: 44, fontWeight: 600, color: COLORS.fg, marginTop: 6 }}>
                {fmtSol(r.diamondCopeSol)}
              </div>
            </div>
            {r.worstSingleSell && r.worstSingleSell.fumbleSol > 0 ? (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div
                  style={{
                    fontSize: 12,
                    color: COLORS.dim,
                    letterSpacing: 3,
                    textTransform: "uppercase",
                  }}
                >
                  one-click fumble
                </div>
                <div style={{ fontSize: 44, fontWeight: 600, color: COLORS.warn, marginTop: 6 }}>
                  {fmtSol(r.worstSingleSell.fumbleSol)}
                </div>
              </div>
            ) : r.worstSell && r.worstSell.peakCopeSol > 0 ? (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div
                  style={{
                    fontSize: 12,
                    color: COLORS.dim,
                    letterSpacing: 3,
                    textTransform: "uppercase",
                  }}
                >
                  worst fumble
                </div>
                <div style={{ fontSize: 44, fontWeight: 600, color: COLORS.fg, marginTop: 6 }}>
                  {`$${r.worstSell.symbol ?? shortAddr(r.worstSell.mint)}`}
                </div>
                <div style={{ fontSize: 18, color: COLORS.muted, marginTop: 2 }}>
                  {`${fmtSol(r.worstSell.peakCopeSol)} · ${r.worstSell.peakMultiplier.toFixed(1)}x`}
                </div>
              </div>
            ) : null}
          </div>
          <div style={{ fontSize: 18, color: COLORS.dim }}>peggy.cash</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
