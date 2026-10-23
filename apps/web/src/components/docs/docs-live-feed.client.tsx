"use client";

import { useEffect, useRef, useState } from "react";
import {
  usePolledState,
  type TipBlock,
  type TipPayload,
} from "@/components/slot200/usePolled";

/**
 * <LiveFeed /> on "Solana in action": mainnet as it runs. Polls
 * /api/slot-time/tip about once a second (CDN-cached for a second, so every
 * reader shares one sampling round): the confirmed tip, and every block in
 * the slots just behind it with its transaction count and first signatures.
 *
 * - The slot counter steps through the slots between two observed tips at
 *   the measured slot time, never past the newest observed tip. As it
 *   passes each block, the block lands as a tile and its first transaction
 *   joins the list.
 * - Transactions per second: the transactions in the last BLOCK_WINDOW
 *   slots (skipped slots count as empty) over the measured slot time.
 * - Every tile and transaction is real and links to Explorer.
 *
 * Polling and stepping pause while the tab is hidden. With reduced motion,
 * the feed polls every two seconds and redraws in place, with no stepping
 * or sliding.
 */
const POLL_MS = 1_000;
const POLL_REDUCED_MS = 2_000;
const MAX_TILES = 12;
const MAX_ROWS = 6;
const ROW_MS = 400;
const SAMPLE_WINDOW = 20;
const BLOCK_WINDOW = 20;
const KEEP_SLOTS = 60;
const EXPLORER = "https://explorer.solana.com";

const nf = new Intl.NumberFormat("en-US");

interface Row {
  sig: string;
  slot: number;
}
interface Sample {
  tip: number;
  at: number;
}

function short(sig: string) {
  return sig.length > 12 ? `${sig.slice(0, 6)}…${sig.slice(-6)}` : sig;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Mean ms per slot over the observed tips; null until it can be measured. */
function slotMs(samples: Sample[]): number | null {
  if (samples.length < 3) return null;
  const a = samples[0];
  const b = samples[samples.length - 1];
  if (b.tip <= a.tip) return null;
  const ms = (b.at - a.at) / (b.tip - a.tip);
  return ms > 50 && ms < 2_000 ? ms : null;
}

export function LiveFeed() {
  const reduced = useReducedMotion();
  const { data, failed } = usePolledState<TipPayload>(
    "/api/slot-time/tip",
    reduced ? POLL_REDUCED_MS : POLL_MS,
  );
  const [shown, setShown] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const known = useRef(new Map<number, TipBlock | null>());
  const samples = useRef<Sample[]>([]);
  const target = useRef({ from: 0, to: 0, t0: 0, step: 200 });
  const passed = useRef(0);
  const queue = useRef<Row[]>([]);

  // A new poll: remember its blocks, and step toward its tip.
  useEffect(() => {
    if (!data) return;
    const map = known.current;
    for (const b of data.blocks) map.set(b.slot, b);
    for (const s of data.skipped) map.set(s, null);
    for (const s of map.keys()) if (s <= data.tip - KEEP_SLOTS) map.delete(s);

    const list = samples.current;
    if (!list.length || data.tip > list[list.length - 1].tip) {
      list.push({ tip: data.tip, at: data.serverTime });
      while (list.length > SAMPLE_WINDOW) list.shift();
    }

    const t = target.current;
    const now = performance.now();
    const current = t.to
      ? Math.min(t.to, t.from + Math.floor((now - t.t0) / t.step))
      : 0;
    if (data.tip <= current) return;
    const jump = !!current && data.tip - current > 30;
    const from = reduced || !current || jump ? data.tip : current;
    // Back from a hidden tab: start the list over from the new tip.
    if (jump && !reduced) {
      queue.current = [];
      passed.current = 0;
      setRows([]);
    }
    const gap = Math.max(1, data.tip - from);
    target.current = {
      from,
      to: data.tip,
      t0: now,
      step: Math.min(slotMs(list) ?? 200, (POLL_MS * 1.1) / gap),
    };
    setShown((s) => Math.max(s, from));
  }, [data, reduced]);

  // Step the slot counter toward the target.
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      const t = target.current;
      if (!t.to) return;
      const next = Math.min(
        t.to,
        t.from + Math.floor((performance.now() - t.t0) / t.step),
      );
      setShown((s) => (next > s ? next : s));
    }, 50);
    return () => clearInterval(id);
  }, [reduced]);

  // Blocks the counter has passed send their first transaction to the list.
  useEffect(() => {
    if (!shown) return;
    const map = known.current;
    if (reduced) {
      passed.current = shown;
      const fresh: Row[] = [];
      for (
        let s = shown;
        s > shown - BLOCK_WINDOW && fresh.length < MAX_ROWS;
        s--
      ) {
        const b = map.get(s);
        if (b?.sigs[0]) fresh.push({ sig: b.sigs[0], slot: s });
      }
      setRows(fresh);
      return;
    }
    const start = Math.max(passed.current + 1, shown - MAX_ROWS);
    for (let s = start; s <= shown; s++) {
      const b = map.get(s);
      if (b?.sigs[0]) queue.current.push({ sig: b.sigs[0], slot: s });
    }
    queue.current = queue.current.slice(-MAX_ROWS);
    passed.current = shown;
  }, [shown, reduced]);

  // Drain the queue a row at a time, so the list moves at a readable pace.
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      if (document.hidden || !queue.current.length) return;
      const row = queue.current.shift()!;
      setRows((prev) =>
        prev.some((r) => r.sig === row.sig)
          ? prev
          : [row, ...prev].slice(0, MAX_ROWS),
      );
    }, ROW_MS);
    return () => clearInterval(id);
  }, [reduced]);

  if (!data) {
    return (
      <div className="sol-live not-prose" data-state={failed ? "off" : "wait"}>
        <p className="sol-live-quiet">
          {failed ? "Live data unavailable." : "Loading live mainnet data…"}
        </p>
      </div>
    );
  }

  const head = shown || data.tip;
  const map = known.current;
  const tiles: { slot: number; block: TipBlock | null }[] = [];
  for (let s = head; s > head - KEEP_SLOTS && tiles.length < MAX_TILES; s--) {
    if (map.has(s)) tiles.push({ slot: s, block: map.get(s)! });
  }

  // Transactions per second over the last BLOCK_WINDOW slots the feed knows.
  const ms = slotMs(samples.current);
  let txs = 0;
  let slots = 0;
  for (let s = head; s > head - BLOCK_WINDOW; s--) {
    if (!map.has(s)) continue;
    slots++;
    txs += map.get(s)?.txs ?? 0;
  }
  const tps = ms && slots >= 8 ? Math.round((txs * 1000) / (slots * ms)) : null;
  const maxTxs = Math.max(1, ...tiles.map((t) => t.block?.txs ?? 0));

  return (
    <div
      className="sol-live not-prose"
      data-stale={failed || undefined}
      data-motion={reduced ? "reduce" : undefined}
    >
      <div className="sol-live-head">
        <span className="sol-live-dot" data-stale={failed || undefined} />
        <span className="sol-live-title">Mainnet</span>
        <span className="sol-live-slot">
          slot <b>{nf.format(head)}</b>
        </span>
        <span className="sol-live-rate">
          {failed ? (
            "Live data unavailable. Retrying…"
          ) : ms ? (
            <>
              {tps ? (
                <>
                  <b>{nf.format(tps)}</b> transactions a second ·{" "}
                </>
              ) : null}
              <b>{Math.round(ms)}</b> ms slots
            </>
          ) : (
            "Measuring…"
          )}
        </span>
      </div>

      <p className="sol-live-h">Blocks as they&apos;re produced</p>
      <ol className="sol-live-tiles">
        {tiles.map(({ slot, block }) =>
          block ? (
            <li key={slot}>
              <a href={`${EXPLORER}/block/${slot}`} rel="noopener">
                <span className="sol-live-n">{nf.format(block.txs)}</span>
                <span className="sol-live-u">txs</span>
                <span className="sol-live-s">{nf.format(slot)}</span>
                <i style={{ width: `${(block.txs / maxTxs) * 100}%` }} />
              </a>
            </li>
          ) : (
            <li key={slot} data-skipped="">
              <span title={`Slot ${nf.format(slot)} was skipped`}>skipped</span>
            </li>
          ),
        )}
      </ol>

      <p className="sol-live-h">Latest transactions</p>
      <ol className="sol-live-list">
        {rows.map((r) => (
          <li key={r.sig}>
            <a
              href={`${EXPLORER}/tx/${r.sig}`}
              rel="noopener"
              className="sol-live-sig"
            >
              {short(r.sig)}
            </a>
            <span className="sol-live-muted">block {nf.format(r.slot)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
