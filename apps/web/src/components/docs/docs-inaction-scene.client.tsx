"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/tx-walkthrough/tx-walkthrough.client";

/**
 * <InActionScene kind="checkout" /> and <InActionScene kind="paywall" /> on
 * "Solana in action": one device, one action, and the result, in the spirit
 * of payments.org's live demo.
 *
 * Each scene plays by itself once it scrolls into view, and its button runs
 * it again. With reduced motion the scene starts at its end state and the
 * buttons change the state without animating.
 */
export type SceneKind = "checkout" | "paywall";

export function InActionScene({ kind }: { kind: SceneKind }) {
  return kind === "checkout" ? <CheckoutScene /> : <PaywallScene />;
}

const PENDING_MS = 750;
const LINE_MS = 520;
const AUTO_CALLS = 3;
const CALL_GAP_MS = 1_600;
const PRICE = 0.001;

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

/** setTimeout that is cleared when the component unmounts. */
function useTimers() {
  const ids = useRef<number[]>([]);
  useEffect(() => () => ids.current.forEach((id) => clearTimeout(id)), []);
  return useCallback((fn: () => void, ms: number) => {
    ids.current.push(window.setTimeout(fn, ms));
  }, []);
}

type PayPhase = "idle" | "pending" | "done";

function CheckoutScene() {
  const reduced = useReducedMotion();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const later = useTimers();
  const [phase, setPhase] = useState<PayPhase>("idle");
  const [order, setOrder] = useState(1001);
  const started = useRef(false);

  const pay = useCallback(() => {
    started.current = true;
    if (phase === "pending") return;
    if (phase === "done") setOrder((n) => n + 1);
    if (reduced) {
      setPhase("done");
      return;
    }
    setPhase("pending");
    later(() => setPhase("done"), PENDING_MS);
  }, [phase, reduced, later]);

  // Reduced motion: start paid.
  useEffect(() => {
    if (reduced && !started.current) {
      started.current = true;
      setPhase("done");
    }
  }, [reduced]);

  // Pay once by itself when the scene comes into view.
  useEffect(() => {
    if (!seen || reduced || started.current) return;
    later(() => {
      if (!started.current) pay();
    }, 600);
  }, [seen, reduced, later, pay]);

  const done = phase === "done";
  const label = `Order #${order}`;

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
          disabled={phase === "pending"}
          onClick={pay}
        >
          {phase === "pending" ? (
            <>
              <span className="sol-scene-spin" aria-hidden="true" /> Paying
            </>
          ) : done ? (
            <>
              <CheckIcon /> Paid
            </>
          ) : (
            "Pay 1 USDC"
          )}
        </button>
      </div>

      <div className="sol-scene-link" aria-hidden="true">
        <svg viewBox="0 0 200 40" preserveAspectRatio="none">
          <path className="sol-scene-arc" d="M4 36 Q100 -10 196 36" />
        </svg>
      </div>

      <div className="sol-scene-receipt" aria-live="polite">
        {done ? (
          <>
            <p className="sol-scene-receipt-head">
              <CheckIcon /> Paid
            </p>
            <p className="sol-scene-receipt-amt">1 USDC</p>
            <p className="sol-scene-receipt-time">Settled in under a second</p>
            <dl>
              <div>
                <dt>To</dt>
                <dd>Sticker shop</dd>
              </div>
              <div>
                <dt>Fee</dt>
                <dd>under $0.01</dd>
              </div>
            </dl>
            <button type="button" className="sol-scene-again" onClick={pay}>
              Pay again
            </button>
          </>
        ) : null}
      </div>

      <div className="sol-scene-device sol-scene-shop">
        {done ? (
          <p className="sol-scene-toast" key={order}>
            <CheckIcon /> Order paid
          </p>
        ) : null}
        <p className="sol-scene-name">Sticker shop</p>
        <p className="sol-scene-sub">Orders</p>
        <div className="sol-scene-order">
          <span>
            <span className="sol-scene-order-id">{label}</span>
            <span className="sol-scene-sub">1 USDC</span>
          </span>
          <span className="sol-scene-pill" data-ok={done || undefined}>
            {done ? "Paid ✓" : "Waiting"}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Lines in one call: 0 none, 1 request, 2 402, 3 paid, 4 200. */
function PaywallScene() {
  const reduced = useReducedMotion();
  const [ref, seen] = useSeen<HTMLDivElement>();
  const later = useTimers();
  const [step, setStep] = useState(0);
  const [calls, setCalls] = useState(0);
  const [running, setRunning] = useState(false);
  const [auto, setAuto] = useState(true);
  const started = useRef(false);

  const call = useCallback(() => {
    started.current = true;
    if (reduced) {
      setStep(4);
      setCalls((n) => n + 1);
      return;
    }
    setRunning(true);
    setStep(1);
    for (const s of [2, 3, 4]) later(() => setStep(s), LINE_MS * (s - 1));
    later(() => {
      setCalls((n) => n + 1);
      setRunning(false);
    }, LINE_MS * 3);
  }, [reduced, later]);

  // Reduced motion: start after one call.
  useEffect(() => {
    if (reduced && !started.current) {
      started.current = true;
      setStep(4);
      setCalls(1);
    }
  }, [reduced]);

  // A few calls by themselves once the scene is in view.
  useEffect(() => {
    if (!seen || reduced || !auto || running || calls >= AUTO_CALLS) return;
    later(call, calls === 0 ? 500 : CALL_GAP_MS);
  }, [seen, reduced, auto, running, calls, later, call]);

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
            <li>
              <span className="sol-scene-dir">→</span>{" "}
              <span className="sol-scene-code" data-tone="pay">
                pays
              </span>{" "}
              $0.001
            </li>
          ) : null}
          {step >= 4 ? (
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
              call();
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
