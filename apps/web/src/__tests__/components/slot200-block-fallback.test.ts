import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => ({
  getConfirmedSlot: vi.fn(),
  getBlockFull: vi.fn(),
}));

vi.mock("@/lib/slot200/rpc", () => ({
  ...rpc,
  RpcError: class RpcError extends Error {},
  txProgramIds: vi.fn(),
}));

vi.mock("@/lib/slot200/programs", () => ({ classifyTx: vi.fn() }));

describe("sampled block fallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T00:00:00Z"));
    vi.resetModules();
    rpc.getConfirmedSlot.mockReset().mockResolvedValue(1234);
    rpc.getBlockFull.mockReset().mockResolvedValue({
      blockTime: 1_780_704_000,
      transactions: [],
    });
  });

  afterEach(() => vi.useRealTimers());

  it("reuses a recent sample during failure and cooldown, then rejects it after expiry", async () => {
    const { GET } = await import("@/app/api/slot-time/block/route");
    const first = await GET();
    const sample = await first.json();
    expect(first.status).toBe(200);
    expect(sample.slot).toBe(1232);
    expect(rpc.getBlockFull).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.parse("2026-10-06T00:04:59Z"));
    rpc.getBlockFull.mockRejectedValueOnce(new Error("RPC unavailable"));
    const fallback = await GET();
    expect(fallback.status).toBe(200);
    expect(await fallback.json()).toEqual(sample);
    expect(rpc.getBlockFull).toHaveBeenCalledTimes(2);

    vi.setSystemTime(Date.parse("2026-10-06T00:05:00Z"));
    const expired = await GET();
    expect(expired.status).toBe(502);
    expect(rpc.getBlockFull).toHaveBeenCalledTimes(2);

    vi.setSystemTime(Date.parse("2026-10-06T00:05:30Z"));
    const recovered = await GET();
    expect(recovered.status).toBe(200);
    expect(rpc.getBlockFull).toHaveBeenCalledTimes(3);
  });

  it("keeps the full signature and fee of each tape transaction", async () => {
    const sig = "5".repeat(88);
    rpc.getBlockFull.mockResolvedValue({
      blockTime: 1_780_704_000,
      transactions: [
        {
          meta: { fee: 7500, computeUnitsConsumed: 1000 },
          transaction: { signatures: [sig], message: { accountKeys: [] } },
        },
      ],
    });
    const programs = await import("@/lib/slot200/programs");
    vi.mocked(programs.classifyTx).mockReturnValue("Transfers");
    const { GET } = await import("@/app/api/slot-time/block/route");
    const sample = await (await GET()).json();
    expect(sample.tape).toEqual([
      { sig: sig.slice(0, 8), p: "Transfers", id: sig, fee: 7500 },
    ]);
  });
});
