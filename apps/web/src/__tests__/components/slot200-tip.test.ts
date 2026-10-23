import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => ({
  getConfirmedSlot: vi.fn(),
  getBlockSignatures: vi.fn(),
}));

vi.mock("@/lib/slot200/rpc", () => ({
  ...rpc,
  RpcError: class RpcError extends Error {
    constructor(
      message: string,
      readonly code?: number,
    ) {
      super(message);
    }
  },
}));

describe("/api/slot-time/tip", () => {
  beforeEach(() => {
    vi.resetModules();
    rpc.getConfirmedSlot.mockReset();
    rpc.getBlockSignatures.mockReset();
  });

  it("returns every recent block once, marks skipped slots, and reads each block only once", async () => {
    const { RpcError } = await import("@/lib/slot200/rpc");
    const Err = RpcError as unknown as new (m: string, c: number) => Error;
    rpc.getBlockSignatures.mockImplementation(async (slot: number) => {
      if (slot === 98) throw new Err("skipped", -32007);
      if (slot === 100) throw new Err("not yet", -32004);
      return {
        blockTime: null,
        signatures: [`s${slot}a`, `s${slot}b`, `s${slot}c`],
      };
    });
    const { GET } = await import("@/app/api/slot-time/tip/route");

    rpc.getConfirmedSlot.mockResolvedValue(100);
    const first = await (await GET()).json();
    expect(first.tip).toBe(100);
    expect(first.blocks.map((b: { slot: number }) => b.slot)).toEqual([
      95, 96, 97, 99,
    ]);
    expect(first.blocks[0]).toEqual({
      slot: 95,
      txs: 3,
      sigs: ["s95a", "s95b"],
    });
    expect(first.skipped).toEqual([98]);
    expect(rpc.getBlockSignatures).toHaveBeenCalledTimes(6);

    // Next round: only the slots not read yet (100 again, and 101).
    rpc.getConfirmedSlot.mockResolvedValue(101);
    rpc.getBlockSignatures.mockClear();
    const second = await (await GET()).json();
    expect(rpc.getBlockSignatures.mock.calls.map((c) => c[0]).sort()).toEqual([
      100, 101,
    ]);
    expect(second.blocks.at(-1).slot).toBe(101);
  });

  it("answers 502 when the RPC fails", async () => {
    rpc.getConfirmedSlot.mockRejectedValue(new Error("RPC unavailable"));
    const { GET } = await import("@/app/api/slot-time/tip/route");
    const res = await GET();
    expect(res.status).toBe(502);
  });
});
