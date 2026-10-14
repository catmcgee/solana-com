import {
  generateKeyPairSigner,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";
import { beforeAll, describe, expect, it } from "vitest";
import { fundSol } from "../../../test/fixtures/fund";
import { runExample } from "../../../test/record";
import { failure } from "./blocked-transfer";
import { balanceOf, demoApprove, demoBlocked, demoCreate } from "./demo";
import { approveHolder, openAccount } from "./approve-holder";
import { run } from "./run";

const out = (name: string) => new URL(`./${name}.output.txt`, import.meta.url);

describe("paths/assets/issue-asset (Token-2022 restricted asset)", () => {
  let issuer: KeyPairSigner;
  let holder: KeyPairSigner;
  let approved: KeyPairSigner;
  let unapproved: KeyPairSigner;
  let mint: Address;

  beforeAll(async () => {
    [issuer, holder, approved, unapproved] = (await Promise.all(
      [0, 1, 2, 3].map(() => generateKeyPairSigner()),
    )) as [KeyPairSigner, KeyPairSigner, KeyPairSigner, KeyPairSigner];
    await fundSol(issuer.address, 2);
    await fundSol(holder.address);
  });

  it("create: mint with metadata, pausable, permanent delegate, default frozen", async () => {
    const r = await runExample(() => demoCreate(issuer), {
      output: out("create-asset"),
    });
    mint = r.value.mint;
    expect(r.value.extensions).toEqual(
      expect.arrayContaining([
        "MetadataPointer",
        "TokenMetadata",
        "PausableConfig",
        "PermanentDelegate",
        "DefaultAccountState",
      ]),
    );
  });

  it("approve: accounts start frozen; the issuer thaws and mints to a holder", async () => {
    const r = await runExample(
      async () => {
        const a = await demoApprove(
          issuer,
          mint,
          holder.address,
          1_000_000_000n,
        );
        const b = await demoApprove(issuer, mint, approved.address, 0n);
        return [a, b];
      },
      { output: out("approve-holder") },
    );
    expect(r.value.map((x) => x.state)).toEqual(["Initialized", "Initialized"]);
    expect(r.value[0]!.balance).toBe(1_000_000_000n);
    // The issuer's own treasury account, where the permanent delegate step
    // moves tokens to (setup, not printed).
    await openAccount(issuer, mint, issuer.address);
    await approveHolder(issuer, mint, issuer.address);
  });

  it("blocked: transfer to a frozen account fails with Custom 17 and still pays the fee", async () => {
    const r = await runExample(
      () =>
        demoBlocked(issuer, mint, holder, approved.address, unapproved.address),
      { output: out("blocked-transfer"), failedLabel: /Failed signature/ },
    );
    const { blocked, rejected, pausedError } = r.value;
    expect(r.failed).toEqual([blocked.signature]);
    // Token-2022 AccountFrozen = custom error 17 (0x11).
    expect(
      JSON.stringify(blocked.err, (_k, v) =>
        typeof v === "bigint" ? Number(v) : v,
      ),
    ).toBe('{"InstructionError":[0,{"Custom":17}]}');
    expect(blocked.fee).toBeGreaterThan(0n);
    expect(blocked.log).toMatch(/Account is frozen/);
    expect(rejected.accountFrozen).toBe(true);
    expect(pausedError).not.toBe("");
    expect(await balanceOf(unapproved.address, mint)).toBe(0n);
    expect(await balanceOf(approved.address, mint)).toBe(50_000_000n);
    expect(await balanceOf(holder.address, mint)).toBe(900_000_000n);
    expect(await balanceOf(issuer.address, mint)).toBe(50_000_000n);
  });

  it("run: the page's run.ts script does the whole sequence on a fresh asset", async () => {
    const runner = await generateKeyPairSigner();
    await fundSol(runner.address, 2);
    const r = await run(runner);
    expect((await failure(r.sent)).err).toBeNull();
    expect(
      JSON.stringify((await failure(r.blocked.signature)).err, (_k, v) =>
        typeof v === "bigint" ? Number(v) : v,
      ),
    ).toBe('{"InstructionError":[0,{"Custom":17}]}');
    expect(r.pausedTransferFailed).toBe(true);
    expect((await failure(r.recovered)).err).toBeNull();
    expect(await balanceOf(runner.address, r.mint)).toBe(50_000_000n);
  });
});
