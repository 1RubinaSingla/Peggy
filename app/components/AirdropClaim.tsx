"use client";

// Airdrop claim widget for the /leaderboard page.
//
// State machine:
//   idle           — nothing connected; "connect phantom" button
//   connecting     — Phantom prompt open
//   checking       — wallet connected, hitting /api/airdrop/eligibility
//   ineligible     — connected but not on the board
//   ready          — eligible, not yet claimed; "claim X tokens" button
//   signing        — Phantom signMessage modal open
//   claiming       — POSTing /api/airdrop/claim, waiting for on-chain confirmation
//   claimed        — terminal success, show tx signature link
//   already-claimed — re-connected after a prior claim; show the tx
//   error          — show retry button

import { useEffect, useState } from "react";
import bs58 from "bs58";

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  signMessage: (msg: Uint8Array, display?: "utf8" | "hex") => Promise<{ signature: Uint8Array }>;
};

type Eligibility = {
  configured: boolean;
  eligible: boolean;
  rank?: number;
  multiplier?: number;
  amount?: number;
  claimed?: boolean;
  txSignature?: string;
  reason?: string;
  tokenSymbol?: string;
};

type UIState =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "checking" }
  | { kind: "ineligible"; reason?: string }
  | { kind: "ready"; data: Eligibility }
  | { kind: "signing" }
  | { kind: "claiming" }
  | { kind: "claimed"; txSignature: string; amount: number }
  | { kind: "error"; message: string };

function buildClaimMessage(wallet: string, ts: number): string {
  return [
    "peggy.cash airdrop claim",
    "version: v1",
    `wallet: ${wallet}`,
    `ts: ${ts}`,
  ].join("\n");
}

function getPhantom(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { phantom?: { solana?: PhantomProvider } }).phantom?.solana ?? null;
}

export function AirdropClaim() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [symbol, setSymbol] = useState("COPE");
  const [wallet, setWallet] = useState<string | null>(null);
  const [state, setState] = useState<UIState>({ kind: "idle" });
  const [hasPhantom, setHasPhantom] = useState(false);

  // Probe configured flag once on mount with a dummy wallet — server tells us
  // whether the feature is on without leaking config.
  useEffect(() => {
    setHasPhantom(Boolean(getPhantom()?.isPhantom));
    fetch("/api/airdrop/eligibility?wallet=11111111111111111111111111111111")
      .then((r) => r.json())
      .then((j: Eligibility) => {
        setConfigured(Boolean(j.configured));
        if (j.tokenSymbol) setSymbol(j.tokenSymbol);
      })
      .catch(() => setConfigured(false));
  }, []);

  async function connect() {
    const phantom = getPhantom();
    if (!phantom) return;
    setState({ kind: "connecting" });
    try {
      const res = await phantom.connect();
      const addr = res.publicKey.toString();
      setWallet(addr);
      await refreshEligibility(addr);
    } catch {
      setState({ kind: "idle" });
    }
  }

  async function refreshEligibility(addr: string) {
    setState({ kind: "checking" });
    try {
      const r = await fetch(`/api/airdrop/eligibility?wallet=${addr}`);
      const j: Eligibility = await r.json();
      if (j.tokenSymbol) setSymbol(j.tokenSymbol);
      if (!j.configured) {
        setConfigured(false);
        return;
      }
      if (!j.eligible) {
        setState({ kind: "ineligible", reason: j.reason });
        return;
      }
      if (j.claimed && j.txSignature) {
        setState({ kind: "claimed", txSignature: j.txSignature, amount: j.amount ?? 0 });
        return;
      }
      setState({ kind: "ready", data: j });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "lookup failed" });
    }
  }

  async function claim() {
    if (state.kind !== "ready" || !wallet) return;
    const phantom = getPhantom();
    if (!phantom) return;

    setState({ kind: "signing" });
    let signatureBase58: string;
    let ts: number;
    try {
      ts = Date.now();
      const message = buildClaimMessage(wallet, ts);
      const encoded = new TextEncoder().encode(message);
      const { signature } = await phantom.signMessage(encoded, "utf8");
      signatureBase58 = bs58.encode(signature);
    } catch {
      // user rejected
      setState({ kind: "ready", data: state.data });
      return;
    }

    setState({ kind: "claiming" });
    try {
      const r = await fetch("/api/airdrop/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet, ts, signature: signatureBase58 }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setState({ kind: "error", message: j.reason ?? `error ${r.status}` });
        return;
      }
      setState({ kind: "claimed", txSignature: j.txSignature, amount: j.amount });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "claim failed" });
    }
  }

  // Don't render anything until we know whether the feature is configured.
  if (configured === null) return null;
  if (!configured) return null;

  return (
    <section className="airdrop-card">
      <div className="airdrop-head">
        <span className="airdrop-tag">airdrop</span>
        <h2 className="airdrop-title">claim your reward</h2>
        <p className="airdrop-sub">
          top 20 wallets on the wall of pain are eligible for a tiered ${symbol} airdrop.
          connect your wallet to check.
        </p>
      </div>

      {state.kind === "idle" && (
        <button type="button" className="airdrop-cta" onClick={connect} disabled={!hasPhantom}>
          {hasPhantom ? "connect phantom" : "install phantom to claim"}
        </button>
      )}

      {state.kind === "connecting" && <div className="airdrop-status">connecting…</div>}

      {state.kind === "checking" && (
        <div className="airdrop-status">
          checking eligibility for {shorten(wallet)}…
        </div>
      )}

      {state.kind === "ineligible" && (
        <div className="airdrop-status muted">
          <div className="airdrop-wallet">{shorten(wallet)}</div>
          <div>not in the current top 20. cope harder and try again.</div>
          {state.reason && <div className="airdrop-reason">{state.reason}</div>}
        </div>
      )}

      {state.kind === "ready" && (
        <div className="airdrop-ready">
          <div className="airdrop-wallet">{shorten(wallet)} · rank #{state.data.rank}</div>
          <div className="airdrop-amount">
            {formatAmount(state.data.amount ?? 0)} <span className="airdrop-ticker">${symbol}</span>
          </div>
          <div className="airdrop-tier">
            tier multiplier: <strong>{state.data.multiplier}x</strong>
          </div>
          <button type="button" className="airdrop-cta primary" onClick={claim}>
            claim {formatAmount(state.data.amount ?? 0)} ${symbol}
          </button>
        </div>
      )}

      {state.kind === "signing" && (
        <div className="airdrop-status">approve the signature request in phantom…</div>
      )}

      {state.kind === "claiming" && (
        <div className="airdrop-status">sending on-chain… this can take a few seconds.</div>
      )}

      {state.kind === "claimed" && (
        <div className="airdrop-claimed">
          <div className="airdrop-claimed-headline">claimed {formatAmount(state.amount)} ${symbol}</div>
          <a
            href={`https://solscan.io/tx/${state.txSignature}`}
            target="_blank"
            rel="noopener noreferrer"
            className="airdrop-tx"
          >
            view tx ↗
          </a>
        </div>
      )}

      {state.kind === "error" && (
        <div className="airdrop-status error">
          <div>{state.message}</div>
          <button
            type="button"
            className="airdrop-cta"
            onClick={() => (wallet ? refreshEligibility(wallet) : setState({ kind: "idle" }))}
          >
            retry
          </button>
        </div>
      )}
    </section>
  );
}

function shorten(addr: string | null): string {
  if (!addr) return "";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function formatAmount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
