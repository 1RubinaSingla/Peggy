"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import type { CopeReceipt } from "../src/types.ts";
import { Receipt } from "./components/Receipt.tsx";

type Status = "idle" | "running" | "done" | "error";

type DepthPreset = "10" | "25" | "50" | "all" | "custom";

// Empirical on Solana Tracker free tier. The throttle is bursty — first few calls fast,
// then 1-3s/call once it kicks in. ~1.5s/token + 6s overhead matches observed runs.
// Bump these once we move to a paid plan (will drop to ~0.4s/token).
const PER_TOKEN_SECONDS = 1.5;
const OVERHEAD_SECONDS = 6;

function estimateSeconds(n: number) {
  return Math.ceil(OVERHEAD_SECONDS + n * PER_TOKEN_SECONDS);
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PageInner />
    </Suspense>
  );
}

type PhantomProvider = {
  isPhantom?: boolean;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
};

const RECENT_KEY = "peggy:recent";
const RECENT_MAX = 5;
type RecentEntry = { address: string; lastUsed: number };

function loadRecent(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveRecent(address: string) {
  if (typeof window === "undefined") return;
  const list = loadRecent().filter((r) => r.address !== address);
  list.unshift({ address, lastUsed: Date.now() });
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
}

function PageInner() {
  const searchParams = useSearchParams();
  const [wallet, setWallet] = useState(searchParams.get("wallet") ?? "");
  const [hasPhantom, setHasPhantom] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [recent, setRecent] = useState<RecentEntry[]>([]);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  useEffect(() => {
    const phantom = (window as unknown as { phantom?: { solana?: PhantomProvider } }).phantom?.solana;
    if (phantom?.isPhantom) setHasPhantom(true);
  }, []);

  async function connectPhantom() {
    const phantom = (window as unknown as { phantom?: { solana?: PhantomProvider } }).phantom?.solana;
    if (!phantom) return;
    setConnecting(true);
    try {
      const res = await phantom.connect();
      setWallet(res.publicKey.toString());
    } catch {
      // user dismissed
    } finally {
      setConnecting(false);
    }
  }

  const [depth, setDepth] = useState<DepthPreset>("25");
  const [customDepth, setCustomDepth] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ kind: string; done: number; total: number } | null>(null);
  const [receipt, setReceipt] = useState<CopeReceipt | null>(null);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  function resolvedLimit(): number {
    if (depth === "all") return 0;
    if (depth === "custom") {
      const n = parseInt(customDepth, 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    return parseInt(depth, 10);
  }

  function estimateLabel(): string {
    if (depth === "all") return "~30s–2min";
    const n = resolvedLimit();
    if (!n) return "—";
    return `~${estimateSeconds(n)}s`;
  }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [log, progress]);

  function reset() {
    setStatus("idle");
    setLog([]);
    setProgress(null);
    setReceipt(null);
    setEmptyMessage(null);
    setErrorMessage(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet.trim() || status === "running") return;
    reset();
    setStatus("running");

    const limit = resolvedLimit();
    const url = `/api/cope?wallet=${encodeURIComponent(wallet.trim())}${limit ? `&limit=${limit}` : ""}`;
    const es = new EventSource(url);

    es.addEventListener("step", (ev: MessageEvent) => {
      const { msg } = JSON.parse(ev.data);
      setLog((prev) => [...prev, msg]);
      setProgress(null);
    });
    es.addEventListener("progress", (ev: MessageEvent) => {
      const p = JSON.parse(ev.data);
      setProgress(p);
    });
    es.addEventListener("done", (ev: MessageEvent) => {
      const { empty, message, receipt } = JSON.parse(ev.data);
      if (empty) setEmptyMessage(message);
      else {
        setReceipt(receipt);
        saveRecent(wallet.trim());
        setRecent(loadRecent());
      }
      setStatus("done");
      setProgress(null);
      es.close();
    });
    es.addEventListener("error", (ev: MessageEvent) => {
      let msg = "something broke on the way. try again.";
      try {
        const d = JSON.parse(ev.data);
        if (d?.message) msg = d.message;
      } catch {}
      setErrorMessage(msg);
      setStatus("error");
      es.close();
    });
  }

  const showLog = status === "running" || log.length > 0 || errorMessage;

  return (
    <main>
      <header className="hero">
        <p className="hero-kicker">know your cope score</p>
        <h1 className="hero-title">the number you don&apos;t want to know.</h1>
        <p className="hero-pitch">
          paste your wallet. we replay every memecoin you sold and tell you what you&apos;d have
          if you&apos;d just held. it will hurt. that is the point.
        </p>
      </header>

      <section className="card">
        <div className="card-head">
          <span>
            <span className={`dot ${status === "running" ? "" : "idle"}`} />
            {status === "running" ? "in session" : "ready"}
          </span>
          <span>solana</span>
        </div>
        <div className="card-body">
          <form onSubmit={onSubmit} className="form">
            <input
              type="text"
              placeholder="wallet address"
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              disabled={status === "running"}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
            <button type="submit" className="cta" disabled={status === "running" || !wallet.trim()}>
              {status === "running" ? "coping…" : "Cope"}
            </button>
          </form>

          {hasPhantom && (
            <button
              type="button"
              className="connect-link"
              onClick={connectPhantom}
              disabled={connecting || status === "running"}
            >
              {connecting ? "connecting…" : "→ use my phantom wallet"}
            </button>
          )}

          {recent.length > 0 && (
            <div className="recent-row">
              <span className="depth-label">recent</span>
              {recent.map((r) => (
                <button
                  key={r.address}
                  type="button"
                  className="chip recent-chip"
                  disabled={status === "running"}
                  onClick={() => setWallet(r.address)}
                  title={r.address}
                >
                  {r.address.slice(0, 4)}…{r.address.slice(-4)}
                </button>
              ))}
            </div>
          )}

          <div className="depth-row">
            <span className="depth-label">depth</span>
            {(["10", "25", "50", "all"] as DepthPreset[]).map((d) => (
              <button
                key={d}
                type="button"
                className={`chip ${depth === d ? "selected" : ""}`}
                disabled={status === "running"}
                onClick={() => setDepth(d)}
              >
                {d === "all" ? "all" : `top ${d}`}
              </button>
            ))}
            <input
              type="text"
              className="depth-custom"
              placeholder="n"
              inputMode="numeric"
              maxLength={4}
              value={depth === "custom" ? customDepth : ""}
              disabled={status === "running"}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                setCustomDepth(v);
                setDepth(v ? "custom" : "25");
              }}
              onFocus={() => customDepth && setDepth("custom")}
              aria-label="custom depth"
            />
            <span className="depth-estimate">
              est. <strong>{estimateLabel()}</strong>
            </span>
          </div>
        </div>
      </section>

      {showLog && (
        <section className="card log">
          <div className="card-head">
            <span>
              <span className={`dot ${status === "running" ? "" : "idle"}`} />
              execution log
            </span>
            <span>peggy v0.1</span>
          </div>
          <div className="log-stream">
            {log.map((line, i) => (
              <div key={i} className="log-line">
                <span className="log-prompt">$</span>
                <span className="log-text">{line}</span>
              </div>
            ))}
            {progress && (
              <div className="log-line active">
                <span className="log-prompt">$</span>
                <span className="log-text">
                  {progress.kind} {progress.done}/{progress.total}
                </span>
              </div>
            )}
            {status === "running" && (
              <div className="log-line active">
                <span className="log-prompt">$</span>
                <span className="cursor" />
              </div>
            )}
            {errorMessage && (
              <div className="log-line error">
                <span className="log-prompt">!</span>
                <span className="log-text">{errorMessage}</span>
              </div>
            )}
            <div ref={logEndRef} />
          </div>
        </section>
      )}

      {emptyMessage && (
        <section className="card receipt">
          <div className="card-body" style={{ textAlign: "center", color: "var(--fg-muted)" }}>
            {emptyMessage}
          </div>
        </section>
      )}

      {receipt && <Receipt receipt={receipt} />}

      <section className="peggy-intro">
        <div className="peggy-intro-head">
          <span className="peggy-intro-tag">$peggy</span>
          <h2 className="peggy-intro-title">the cope reward</h2>
        </div>
        <p className="peggy-intro-body">
          peggy.cash has a native Solana token — <span className="hl-accent">$PEGGY</span>. the
          top 20 wallets on the wall of pain are airdropped a tiered amount of $PEGGY directly to
          their wallet. no presale. no team allocation. every $PEGGY in circulation enters the
          world by being claimed off the leaderboard.
        </p>
        <ul className="peggy-intro-bullets">
          <li>
            <span className="peggy-intro-bullet-k">rank</span>
            <span>top 20 on /leaderboard, refreshed every 30s, 7-day window</span>
          </li>
          <li>
            <span className="peggy-intro-bullet-k">tier</span>
            <span>#1 → 5× · #2-3 → 3× · #4-10 → 1.5× · #11-20 → 1×</span>
          </li>
          <li>
            <span className="peggy-intro-bullet-k">claim</span>
            <span>connect phantom, sign a one-line message, get the airdrop on-chain</span>
          </li>
        </ul>
        <div className="peggy-intro-actions">
          <Link href="/leaderboard" className="peggy-intro-cta primary">see the leaderboard →</Link>
          <Link href="/whitepaper" className="peggy-intro-cta">read the whitepaper →</Link>
        </div>
      </section>

      <footer className="footer">peggy.cash · the more you cope, the more we know</footer>
    </main>
  );
}

