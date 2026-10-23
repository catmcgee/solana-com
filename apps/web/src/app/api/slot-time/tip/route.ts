import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import {
  getBlockSignatures,
  getConfirmedSlot,
  RpcError,
} from "@/lib/slot200/rpc";
import type { TipBlock, TipPayload } from "@/components/slot200/usePolled";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The confirmed tip and the blocks just behind it, light: each block's slot,
 * transaction count, and first signatures (getBlock with signatures only,
 * about 35 KB a block at 200 ms slots). The docs live feed polls this about
 * once a second; the one-second CDN and data cache mean every reader shares
 * one sampling round a second, however many are watching. Each round reads
 * only the blocks this instance hasn't read yet, at most FETCH_SLOTS.
 */
const TIP_CACHE_SECONDS = 1;
const TIP_EDGE_STALE_SECONDS = 2;
const TIP_CACHE_KEY = "slot200-tip-v2";
/** Slots read per round, newest first: about 1.2 s of 200 ms slots. */
const FETCH_SLOTS = 6;
/** Slots returned per response, so a reader who missed a poll can catch up. */
const RETURN_SLOTS = 20;
const KEEP_SLOTS = 40;
const SIGNATURES_PER_BLOCK = 2;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// No block was produced in this slot (skipped), or it was cleaned up.
const SKIPPED = [-32007, -32009];
// The block isn't available yet: try it again next round.
const NOT_YET = [-32004, -32014];

/** Blocks read so far on this instance, by slot; null for a skipped slot. */
const known = new Map<number, TipBlock | null>();

async function readSlot(slot: number): Promise<void> {
  try {
    const block = await getBlockSignatures(slot);
    if (!block) return;
    known.set(slot, {
      slot,
      txs: block.signatures.length,
      sigs: block.signatures.slice(0, SIGNATURES_PER_BLOCK),
    });
  } catch (error) {
    const code = error instanceof RpcError ? (error.code ?? 0) : 0;
    if (SKIPPED.includes(code)) known.set(slot, null);
    else if (!NOT_YET.includes(code)) throw error;
  }
}

async function loadTip(): Promise<TipPayload> {
  const tip = await getConfirmedSlot();
  const wanted: number[] = [];
  for (let s = tip; s > tip - FETCH_SLOTS; s--)
    if (!known.has(s)) wanted.push(s);
  const results = await Promise.allSettled(wanted.map(readSlot));
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length === wanted.length && failed.length > 0)
    throw (failed[0] as PromiseRejectedResult).reason;

  for (const s of known.keys()) if (s <= tip - KEEP_SLOTS) known.delete(s);
  const blocks: TipBlock[] = [];
  const skipped: number[] = [];
  for (let s = tip - RETURN_SLOTS + 1; s <= tip; s++) {
    const b = known.get(s);
    if (b) blocks.push(b);
    else if (b === null) skipped.push(s);
  }
  if (!blocks.length) throw new Error("no recent block available");
  return { tip, blocks, skipped, serverTime: Date.now() };
}

// One upstream round per instance at a time, however many requests arrive.
let inFlight: Promise<TipPayload> | null = null;
function loadTipOnce() {
  inFlight ??= loadTip().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

const getTip = IS_PRODUCTION
  ? unstable_cache(loadTipOnce, [TIP_CACHE_KEY], {
      revalidate: TIP_CACHE_SECONDS,
    })
  : loadTipOnce;

export async function GET() {
  try {
    const data = await getTip();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": `public, max-age=0, s-maxage=${TIP_CACHE_SECONDS}, stale-while-revalidate=${TIP_EDGE_STALE_SECONDS}`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to sample tip" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
