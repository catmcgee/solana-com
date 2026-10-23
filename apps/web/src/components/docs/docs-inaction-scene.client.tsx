"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/tx-walkthrough/tx-walkthrough.client";

/**
 * <InActionScene kind="checkout" /> and <InActionScene kind="paywall" /> on
 * "Solana in action": one action and its result, in the spirit of
 * payments.org's live demo. Each action sends a real devnet USDC transfer
 * through /api/demo/checkout or /api/demo/paywall-call (server-held test
 * wallets) and links it to Explorer once it's confirmed, with the measured
 * confirmation time. If the route can't send one (no wallets on this
 * deployment, out of test USDC, rate-limited), the scene still plays and
 * says quietly that the Explorer link is unavailable.
 *
 * Each scene runs once by itself when it scrolls into view, and its button
 * runs it again. Reduced motion drops the animation, not the transaction.
 */
export type SceneKind = "checkout" | "paywall";

export function InActionScene({ kind }: { kind: SceneKind }) {
  return kind === "checkout" ? <CheckoutScene /> : <PaywallScene />;
}

/** The shortest a pending state shows, so a fast reply still reads. */
const PENDING_MS = 750;
const LINE_MS = 520;
const AUTO_CALLS = 3;
const CALL_GAP_MS = 1_600;
const PRICE = 0.001;
const TIMEOUT_MS = 25_000;
const EXPLORER = "https://explorer.solana.com/tx";

/** A confirmed devnet transfer, or null when none was sent. */
type Sent = { signature: string; ms: number } | null;

async function sendTransfer(path: string): Promise<Sent> {
  try {
    const res = await fetch(path, {
      method: "POST",
      signal: AbortSignal.timeout?.(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<{
      signature: string;
      ms: number;
    }>;
    return typeof body.signature === "string" && typeof body.ms === "number"
      ? { signature: body.signature, ms: body.ms }
      : null;
  } catch {
    return null;
  }
}

/** Seconds with one decimal, never "0.0". */
function seconds(ms: number) {
  return `${Math.max(0.1, ms / 1000).toFixed(1)} s`;
}

function ExplorerLink({ sent }: { sent: Sent }) {
  return sent ? (
    <a
      className="sol-scene-tx"
      href={`${EXPLORER}/${sent.signature}?cluster=devnet`}
      target="_blank"
      rel="noopener"
    >
      View on Explorer
    </a>
  ) : (
    <span className="sol-scene-tx" data-off="">
      Explorer link unavailable
    </span>
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** True once the element has been mostly on screen. */
function useSeen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen] as const;
}

/** A promise that resolves after `ms`, or at once with reduced motion. */
function useWait(reduced: boolean) {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const wait = useCallback(
    (ms: number) =>
      new Promise<void>((r) => (reduced ? r() : setTimeout(r, ms))),
    [reduced],
  );
  return [wait, alive] as const;
}

type PayPhase = "idle" | "pending" | "done";

function CheckoutScene() {
  const reduced = useReducedMotion();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [wait, alive] = useWait(reduced);
  const [phase, setPhase] = useState<PayPhase>("idle");
  const [sent, setSent] = useState<Sent>(null);
  const [order, setOrder] = useState(1001);
  const started = useRef(false);

  const pay = useCallback(async () => {
    started.current = true;
    if (phase === "pending") return;
    if (phase === "done") setOrder((n) => n + 1);
    setPhase("pending");
    const [result] = await Promise.all([
      sendTransfer("/api/demo/checkout"),
      wait(PENDING_MS),
    ]);
    if (!alive.current) return;
    setSent(result);
    setPhase("done");
  }, [phase, wait, alive]);

  // Pay once by itself when the scene comes into view.
  useEffect(() => {
    if (!seen || started.current) return;
    const id = setTimeout(() => {
      if (!started.current) void pay();
    }, 600);
    return () => clearTimeout(id);
  }, [seen, pay]);

  const done = phase === "done";

  return (
    <div
      ref={ref}
      className="sol-scene not-prose"
      data-kind="checkout"
      data-phase={phase}
      data-motion={reduced ? "off" : "on"}
    >
      <div className="sol-scene-device">
        <div className="sol-scene-merchant">
          <span className="sol-scene-logo" aria-hidden="true">
            <StarIcon />
          </span>
          <span>
            <span className="sol-scene-name">Sticker shop</span>
            <span className="sol-scene-sub">Holographic sticker</span>
          </span>
        </div>
        <p className="sol-scene-amount">
          1 <span>USDC</span>
        </p>
        <button
          type="button"
          className="sol-scene-btn"
          data-state={phase}
          disabled={phase !== "idle"}
          onClick={() => void pay()}
          aria-live="polite"
        >
          {phase === "pending" ? (
            <>
              <span className="sol-scene-spin" aria-hidden="true" /> Paying
            </>
          ) : done ? (
            <>
              <CheckIcon /> {sent ? `Paid in ${seconds(sent.ms)}` : "Paid"}
            </>
          ) : (
            "Pay 1 USDC"
          )}
        </button>
        <p className="sol-scene-foot">
          {done ? (
            <button
              type="button"
              className="sol-scene-again"
              onClick={() => void pay()}
            >
              Pay again
            </button>
          ) : null}
        </p>
      </div>

      <div className="sol-scene-note" aria-live="polite">
        <span className="sol-scene-sub">Sticker shop</span>
        {done ? (
          <>
            <p className="sol-scene-order" key={order} data-ok="">
              <CheckIcon /> Order #{order} paid
            </p>
            <ExplorerLink sent={sent} />
          </>
        ) : (
          <p className="sol-scene-order">Order #{order} waiting</p>
        )}
      </div>
    </div>
  );
}

/** Lines in one call: 0 none, 1 request, 2 402, 3 paying, 4 paid, 5 200. */
function PaywallScene() {
  const reduced = useReducedMotion();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const [wait, alive] = useWait(reduced);
  const [step, setStep] = useState(0);
  const [sent, setSent] = useState<Sent>(null);
  const [calls, setCalls] = useState(0);
  const [running, setRunning] = useState(false);
  const [auto, setAuto] = useState(true);

  const call = useCallback(async () => {
    setRunning(true);
    setSent(null);
    setStep(1);
    await wait(LINE_MS);
    if (!alive.current) return;
    setStep(2);
    const transfer = sendTransfer("/api/demo/paywall-call");
    await wait(LINE_MS);
    if (!alive.current) return;
    setStep(3);
    const [result] = await Promise.all([transfer, wait(LINE_MS)]);
    if (!alive.current) return;
    setSent(result);
    setStep(4);
    await wait(LINE_MS);
    if (!alive.current) return;
    setStep(5);
    setCalls((n) => n + 1);
    setRunning(false);
  }, [wait, alive]);

  // A few calls by themselves once the scene is in view.
  useEffect(() => {
    if (!seen || !auto || running || calls >= AUTO_CALLS) return;
    const id = setTimeout(() => void call(), calls === 0 ? 500 : CALL_GAP_MS);
    return () => clearTimeout(id);
  }, [seen, auto, running, calls, call]);

  const spent = `$${(calls * PRICE).toFixed(3)}`;

  return (
    <div
      ref={ref}
      className="sol-scene not-prose"
      data-kind="paywall"
      data-motion={reduced ? "off" : "on"}
    >
      <div className="sol-scene-term">
        <div className="sol-scene-term-head" aria-hidden="true">
          <i />
          <i />
          <i />
          <span>client</span>
        </div>
        <ol className="sol-scene-lines" aria-live="polite" key={calls}>
          {step >= 1 ? (
            <li>
              <span className="sol-scene-dir">→</span> GET /forecast
            </li>
          ) : null}
          {step >= 2 ? (
            <li>
              <span className="sol-scene-dir">←</span>{" "}
              <span className="sol-scene-code" data-tone="ask">
                402
              </span>{" "}
              $0.001
            </li>
          ) : null}
          {step >= 3 ? (
            <li data-wrap="">
              <span className="sol-scene-dir">→</span>{" "}
              <span className="sol-scene-code" data-tone="pay">
                pays
              </span>{" "}
              $0.001
              {step === 3 ? (
                <span className="sol-scene-spin" aria-label="Confirming" />
              ) : (
                <>
                  {sent ? (
                    <span className="sol-scene-dir">in {seconds(sent.ms)}</span>
                  ) : null}
                  <ExplorerLink sent={sent} />
                </>
              )}
            </li>
          ) : null}
          {step >= 5 ? (
            <li>
              <span className="sol-scene-dir">←</span>{" "}
              <span className="sol-scene-code" data-tone="ok">
                200
              </span>{" "}
              Sunny, 24°C
            </li>
          ) : null}
        </ol>
        <div className="sol-scene-term-foot">
          <p className="sol-scene-count">
            calls: <b>{calls}</b> · spent: <b>{spent}</b>
          </p>
          <button
            type="button"
            className="sol-scene-again"
            disabled={running}
            onClick={() => {
              setAuto(false);
              void call();
            }}
          >
            Call again
          </button>
        </div>
      </div>
    </div>
  );
}

const CheckIcon = () => (
  <Icon size={15}>
    <path d="m5 12 5 5 9-10" />
  </Icon>
);

const StarIcon = () => (
  <Icon size={18}>
    <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
  </Icon>
);
