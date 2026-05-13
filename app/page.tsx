"use client";

import { useEffect, useRef, useState } from "react";
import type { CopeReceipt } from "../src/types.ts";

type Status = "idle" | "running" | "done" | "error";

export default function Page() {
  const [wallet, setWallet] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ kind: string; done: number; total: number } | null>(null);
  const [receipt, setReceipt] = useState<CopeReceipt | null>(null);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

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

    const es = new EventSource(`/api/cope?wallet=${encodeURIComponent(wallet.trim())}`);

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
      else setReceipt(receipt);
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
        <div className="brand">
          <span className="brand-mark">peggy.cash</span>
          <span className="brand-tag">the cope calculator</span>
        </div>
        <p className="hero-pitch">
          <strong>the number you don&apos;t want to know.</strong> paste your wallet. we replay every
          memecoin you sold and tell you what you&apos;d have if you&apos;d just held. it will hurt.
          that is the point.
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

      <footer className="footer">peggy.cash · the more you cope, the more we know</footer>
    </main>
  );
}

function fmtSol(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M SOL`;
  if (n >= 1_000) return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} SOL`;
  return `${n.toFixed(2)} SOL`;
}
function shortAddr(a: string) {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function Receipt({ receipt: r }: { receipt: CopeReceipt }) {
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
          <div className="stat-caption">
            if you&apos;d sold every position at its top — god mode
          </div>
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
