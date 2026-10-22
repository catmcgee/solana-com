"use client";

import { useEffect, useState } from "react";
import {
  usePolledState,
  type BlockSample,
} from "@/components/slot200/usePolled";

/**
 * <LiveFeed /> on "Solana in action": a recent mainnet block from the
 * /200ms page's sampler (/api/slot-time/block, CDN-cached so every reader
 * shares one sample every 30 seconds), the blocks seen since the page
 * opened, and the first transactions in the latest one, each linking to
 * Explorer. Polling pauses while the tab is hidden (usePolledState).
 */
const POLL_MS = 15_000;
const MAX_BLOCKS = 6;
const MAX_TXS = 8;
const EXPLORER = "https://explorer.solana.com";

const nf = new Intl.NumberFormat("en-US");

function short(sig: string) {
  return sig.length > 12 ? `${sig.slice(0, 5)}…${sig.slice(-5)}` : sig;
}

function sol(lamports: number) {
  return `${(lamports / 1e9).toFixed(lamports < 1e6 ? 6 : 4)} SOL`;
}

function age(blockTime: number | null, now: number) {
  if (!blockTime) return null;
  const s = Math.max(0, Math.round(now / 1000 - blockTime));
  return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
}

export function LiveFeed() {
  const { data: block, failed } = usePolledState<BlockSample>(
    "/api/slot-time/block",
    POLL_MS,
  );
  const [blocks, setBlocks] = useState<BlockSample[]>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!block) return;
    setBlocks((prev) =>
      prev[0]?.slot === block.slot
        ? prev
        : [block, ...prev.filter((b) => b.slot !== block.slot)].slice(
            0,
            MAX_BLOCKS,
          ),
    );
  }, [block]);

  // The "seconds ago" labels tick once a second while the tab is visible.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (!block) {
    return (
      <div className="sol-live not-prose" data-state={failed ? "off" : "wait"}>
        <p className="sol-live-quiet">
          {failed ? "Live data unavailable." : "Loading live mainnet data…"}
        </p>
      </div>
    );
  }

  const txs = block.tape.filter((t) => t.id).slice(0, MAX_TXS);

  return (
    <div className="sol-live not-prose" aria-live="off">
      <div className="sol-live-head">
        <span className="sol-live-dot" data-stale={failed || undefined} />
        <span className="sol-live-title">
          Mainnet ·{" "}
          <a href={`${EXPLORER}/block/${block.slot}`} rel="noopener">
            block {nf.format(block.slot)}
          </a>
        </span>
        <span className="sol-live-age">{age(block.blockTime, now)}</span>
      </div>
      <dl className="sol-live-stats">
        <div>
          <dt>Transactions</dt>
          <dd>{nf.format(block.txs)}</dd>
        </div>
        {block.feeLamports != null && (
          <div>
            <dt>Fees in the block</dt>
            <dd>{sol(block.feeLamports)}</dd>
          </div>
        )}
        {block.cuPct != null && (
          <div>
            <dt>Block compute used</dt>
            <dd>{block.cuPct}%</dd>
          </div>
        )}
      </dl>
      <div className="sol-live-cols">
        <div className="sol-live-col">
          <p className="sol-live-h">Blocks sampled since you opened the page</p>
          <ol className="sol-live-list">
            {blocks.map((b) => (
              <li key={b.slot}>
                <a href={`${EXPLORER}/block/${b.slot}`} rel="noopener">
                  {nf.format(b.slot)}
                </a>
                <span>{nf.format(b.txs)} txs</span>
                <span className="sol-live-muted">{age(b.blockTime, now)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="sol-live-col">
          <p className="sol-live-h">First transactions in the latest block</p>
          {txs.length ? (
            <ol className="sol-live-list">
              {txs.map((t) => (
                <li key={t.id}>
                  <a
                    href={`${EXPLORER}/tx/${t.id}`}
                    rel="noopener"
                    className="sol-live-sig"
                  >
                    {short(t.id!)}
                  </a>
                  <span>{t.p}</span>
                  {t.fee != null && (
                    <span className="sol-live-muted">{sol(t.fee)}</span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="sol-live-quiet">No transactions in this sample.</p>
          )}
        </div>
      </div>
    </div>
  );
}
