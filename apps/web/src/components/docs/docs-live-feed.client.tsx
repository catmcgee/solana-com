"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  usePolledState,
  type TipBlock,
  type TipPayload,
} from "@/components/slot200/usePolled";
import { Tooltip } from "./docs-tooltip";
import concepts from "../../../../docs/concepts/concepts.en.json";

/**
 * <LiveFeed /> on "Solana in action": mainnet as it runs. Polls
 * /api/slot-time/tip about once a second (CDN-cached for a second, so every
 * reader shares one sampling round): the confirmed tip, every block in the
 * slots just behind it with its transaction count, and one signature from
 * each of the newest blocks.
 *
 * - The slot counter steps through the slots between two observed tips at
 *   the measured slot time, never past the newest observed tip. As it
 *   passes each block, the block lands as a tile.
 * - The transaction list stays calm: one transaction per block at most,
 *   one new row a second, five rows. Most blocks don't add a row; the tiles
 *   and their counts carry the volume.
 * - Transactions per second: the transactions in the last BLOCK_WINDOW
 *   slots (skipped slots count as empty) over the measured slot time.
 * - The terms (slot, blocks, transactions) explain themselves on hover,
 *   focus, or tap, with the docs' Tooltip. Tiles and transactions open one
 *   shared popup (the tile row clips its overflow) with the definition, a
 *   "Learn more" link, and an Explorer link; the tile or signature itself
 *   also links to Explorer. While a popup is open the feed holds still.
 *
 * Polling and stepping pause while the tab is hidden. With reduced motion,
 * the feed polls every two seconds and redraws in place, with no stepping
 * or sliding.
 */
const POLL_MS = 1_000;
const POLL_REDUCED_MS = 2_000;
const MAX_TILES = 12;
const MAX_ROWS = 5;
/** One new transaction row a second at most. */
const ROW_MS = 1_000;
/** Rows waiting to be shown: only the newest, so the list stays current. */
const QUEUE_MAX = 2;
const SAMPLE_WINDOW = 20;
const BLOCK_WINDOW = 20;
const KEEP_SLOTS = 60;
const CLOSE_MS = 150;
const EXPLORER = "https://explorer.solana.com";
const GLOSSARY = "/developers/docs/references/terminology";

const nf = new Intl.NumberFormat("en-US");

/** The first sentence of a glossary entry, without inline markdown. */
function firstSentence(md: string) {
  const plain = md.replace(/[*_`]/g, "");
  return plain.match(/^.*?\.(?=\s|$)/)?.[0] ?? plain;
}

const TERMS = {
  slot: {
    headline: "Slot",
    tip: "A slot is a short window, about 200 milliseconds, in which one validator can produce a block. The number counts every slot since the network started.",
    href: `${GLOSSARY}#slot`,
  },
  block: {
    headline: "Blocks",
    tip: "A block is the batch of transactions one validator produces in its slot. Each tile is one block, with how many transactions it held.",
    href: `${GLOSSARY}#block`,
  },
  transaction: {
    headline: concepts.transaction.name,
    tip: `${firstSentence(concepts.transaction.short)} This list shows about one a second, taken from the newest blocks.`,
    href: concepts.transaction.href,
  },
};
const LEARN_MORE = concepts._ui.learnMore;

interface Row {
  sig: string;
  slot: number;
}
interface Sample {
  tip: number;
  at: number;
}
type Pop =
  | { kind: "block"; slot: number; txs: number }
  | { kind: "skipped"; slot: number }
  | { kind: "tx"; slot: number; sig: string };

function popKey(p: Pop) {
  return p.kind === "tx" ? p.sig : `${p.kind}-${p.slot}`;
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

const POP_ID = "sol-live-pop";

export function LiveFeed() {
  const reduced = useReducedMotion();
  const { data, failed } = usePolledState<TipPayload>(
    "/api/slot-time/tip",
    reduced ? POLL_REDUCED_MS : POLL_MS,
  );
  const [shown, setShown] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [pop, setPop] = useState<Pop | null>(null);
  const known = useRef(new Map<number, TipBlock | null>());
  const samples = useRef<Sample[]>([]);
  const target = useRef({ from: 0, to: 0, t0: 0, step: 200 });
  const passed = useRef(0);
  const queue = useRef<Row[]>([]);
  const hold = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const popEl = useRef<HTMLSpanElement>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const tap = useRef({ touch: false, wasOpen: false });

  useEffect(() => {
    hold.current = !!pop;
  }, [pop]);

  // A new poll: remember its blocks, and step toward its tip.
  useEffect(() => {
    if (!data) return;
    const map = known.current;
    for (const b of data.blocks) {
      // Older blocks come back without their signature: keep the one we have.
      const sig = b.sig ?? map.get(b.slot)?.sig;
      map.set(b.slot, sig ? { ...b, sig } : b);
    }
    for (const s of data.skipped) map.set(s, null);

    const list = samples.current;
    if (!list.length || data.tip > list[list.length - 1].tip) {
      list.push({ tip: data.tip, at: data.serverTime });
      while (list.length > SAMPLE_WINDOW) list.shift();
    }
    // While a popup is open, the tiles hold still under it.
    if (hold.current) return;
    for (const s of map.keys()) if (s <= data.tip - KEEP_SLOTS) map.delete(s);

    const t = target.current;
    const now = performance.now();
    const current = t.to
      ? Math.min(t.to, t.from + Math.floor((now - t.t0) / t.step))
      : 0;
    if (data.tip <= current) return;
    const jump = !!current && data.tip - current > 30;
    const from = reduced || !current || jump ? data.tip : current;
    // Back from a hidden tab: start the list over from the new tip.
    if (jump) queue.current = [];
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
      if (document.hidden || hold.current) return;
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

  // Blocks the counter has passed offer their transaction to the list; only
  // the newest QUEUE_MAX wait, so at most one row a block, never a backlog.
  useEffect(() => {
    if (!shown) return;
    const map = known.current;
    const start = Math.max(passed.current + 1, shown - BLOCK_WINDOW);
    for (let s = start; s <= shown; s++) {
      const sig = map.get(s)?.sig;
      if (sig) queue.current.push({ sig, slot: s });
    }
    queue.current = queue.current.slice(-QUEUE_MAX);
    passed.current = shown;
  }, [shown]);

  // One row a second, newest on top; the oldest drops off.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden || hold.current || !queue.current.length) return;
      const row = queue.current.shift()!;
      setRows((prev) =>
        prev.some((r) => r.sig === row.sig)
          ? prev
          : [row, ...prev].slice(0, MAX_ROWS),
      );
    }, ROW_MS);
    return () => clearInterval(id);
  }, []);

  // ---- The shared popup for tiles and transactions.
  const cancelClose = useCallback(() => clearTimeout(closeTimer.current), []);
  const close = useCallback(() => {
    cancelClose();
    anchor.current = null;
    setPop(null);
  }, [cancelClose]);
  const closeSoon = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(close, CLOSE_MS);
  }, [cancelClose, close]);
  const open = useCallback(
    (p: Pop, el: HTMLElement) => {
      cancelClose();
      anchor.current = el;
      setPop((cur) => (cur && popKey(cur) === popKey(p) ? cur : p));
    },
    [cancelClose],
  );

  // Place the popup above its tile or row (below it near the top of the
  // window), inside the feed's edges.
  useLayoutEffect(() => {
    const el = popEl.current;
    const a = anchor.current;
    const box = root.current;
    if (!pop || !el || !a || !box) return;
    const r = box.getBoundingClientRect();
    const ar = a.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const center = ar.left + ar.width / 2 - r.left;
    const left = Math.max(4, Math.min(center - w / 2, r.width - w - 4));
    const below = ar.top - h - 8 < 0;
    el.style.left = `${left}px`;
    el.style.top = `${below ? ar.bottom - r.top + 8 : ar.top - r.top - h - 8}px`;
  }, [pop]);

  // Close on Escape, or on a tap or click anywhere else.
  useEffect(() => {
    if (!pop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: Event) => {
      const t = e.target as Node;
      if (popEl.current?.contains(t) || anchor.current?.contains(t)) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [pop, close]);

  useEffect(() => cancelClose, [cancelClose]);

  /** Hover, focus, and tap handlers for a tile or row that opens `p`. */
  function trigger(p: Pop) {
    const key = popKey(p);
    const isOpen = !!pop && popKey(pop) === key;
    return {
      "aria-describedby": isOpen ? POP_ID : undefined,
      // Read before the tap's focus opens the popup, so the click below
      // knows whether this tap is the first.
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        tap.current = { touch: e.pointerType === "touch", wasOpen: isOpen };
      },
      onPointerEnter: (e: PointerEvent<HTMLElement>) => {
        if (e.pointerType !== "touch") open(p, e.currentTarget);
      },
      onPointerLeave: (e: PointerEvent<HTMLElement>) => {
        if (e.pointerType !== "touch") closeSoon();
      },
      onFocus: (e: FocusEvent<HTMLElement>) => open(p, e.currentTarget),
      onBlur: (e: FocusEvent<HTMLElement>) => {
        if (!popEl.current?.contains(e.relatedTarget as Node)) closeSoon();
      },
      // On touch, the first tap explains; a second tap follows the link.
      onClick: (e: MouseEvent<HTMLElement>) => {
        if (tap.current.touch && !tap.current.wasOpen) {
          e.preventDefault();
          open(p, e.currentTarget);
        }
        tap.current = { touch: false, wasOpen: false };
      },
    };
  }

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
      ref={root}
      className="sol-live not-prose"
      data-stale={failed || undefined}
      data-motion={reduced ? "reduce" : undefined}
    >
      <div className="sol-live-head">
        <span
          className="sol-live-dot"
          data-stale={failed || undefined}
          data-held={pop ? "" : undefined}
        />
        <span className="sol-live-title">Mainnet</span>
        <span className="sol-live-slot">
          <Tooltip {...TERMS.slot} cta={LEARN_MORE}>
            slot
          </Tooltip>{" "}
          <b>{nf.format(head)}</b>
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

      <p className="sol-live-h">
        <Tooltip {...TERMS.block} cta={LEARN_MORE}>
          Blocks
        </Tooltip>{" "}
        as they&apos;re produced
      </p>
      <ol className="sol-live-tiles">
        {tiles.map(({ slot, block }) =>
          block ? (
            <li key={slot}>
              <a
                href={`${EXPLORER}/block/${slot}`}
                rel="noopener"
                {...trigger({ kind: "block", slot, txs: block.txs })}
              >
                <span className="sol-live-n">{nf.format(block.txs)}</span>
                <span className="sol-live-u">txs</span>
                <span className="sol-live-s">{nf.format(slot)}</span>
                <i style={{ width: `${(block.txs / maxTxs) * 100}%` }} />
              </a>
            </li>
          ) : (
            <li key={slot} data-skipped="">
              <span tabIndex={0} {...trigger({ kind: "skipped", slot })}>
                skipped
              </span>
            </li>
          ),
        )}
      </ol>

      <p className="sol-live-h">
        Latest{" "}
        <Tooltip {...TERMS.transaction} cta={LEARN_MORE}>
          transactions
        </Tooltip>
      </p>
      <ol className="sol-live-list">
        {rows.map((r) => (
          <li key={r.sig}>
            <a
              href={`${EXPLORER}/tx/${r.sig}`}
              rel="noopener"
              className="sol-live-sig"
              {...trigger({ kind: "tx", slot: r.slot, sig: r.sig })}
            >
              {short(r.sig)}
            </a>
            <span className="sol-live-muted">block {nf.format(r.slot)}</span>
          </li>
        ))}
      </ol>

      {pop ? (
        <span
          ref={popEl}
          id={POP_ID}
          role="tooltip"
          className="tooltip-popup sol-live-pop"
          onPointerEnter={cancelClose}
          onPointerLeave={(e) => {
            if (e.pointerType !== "touch") closeSoon();
          }}
        >
          <PopBody pop={pop} />
        </span>
      ) : null}
    </div>
  );
}

function PopBody({ pop }: { pop: Pop }) {
  if (pop.kind === "skipped") {
    return (
      <>
        <span className="tooltip-headline">
          Slot {nf.format(pop.slot)}: skipped
        </span>
        <span className="tooltip-tip">
          The validator scheduled for this slot didn&apos;t produce a block, so
          the network moved on to the next slot.
        </span>
        <a href={TERMS.slot.href} className="tooltip-cta">
          Learn more about slots
        </a>
      </>
    );
  }
  if (pop.kind === "block") {
    return (
      <>
        <span className="tooltip-headline">Block {nf.format(pop.slot)}</span>
        <span className="tooltip-tip">
          {nf.format(pop.txs)} transactions, validator votes included.{" "}
          {TERMS.block.tip.split(". ")[0]}.
        </span>
        <span className="sol-live-pop-links">
          <a href={TERMS.block.href} className="tooltip-cta">
            Learn more about blocks
          </a>
          <a
            href={`${EXPLORER}/block/${pop.slot}`}
            rel="noopener"
            className="tooltip-cta"
          >
            View in Explorer
          </a>
        </span>
      </>
    );
  }
  return (
    <>
      <span className="tooltip-headline">Transaction {short(pop.sig)}</span>
      <span className="tooltip-tip">
        {firstSentence(concepts.transaction.short)} This one is in block{" "}
        {nf.format(pop.slot)}.
      </span>
      <span className="sol-live-pop-links">
        <a href={TERMS.transaction.href} className="tooltip-cta">
          Learn more about transactions
        </a>
        <a
          href={`${EXPLORER}/tx/${pop.sig}`}
          rel="noopener"
          className="tooltip-cta"
        >
          View in Explorer
        </a>
      </span>
    </>
  );
}
