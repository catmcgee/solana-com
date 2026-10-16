import {
  generateKeyPairSigner,
  type Address,
  type KeyPairSigner,
  type Signature,
} from "@solana/kit";
import {
  fetchToken,
  getConfidentialDepositInstruction,
  getFreezeAccountInstruction,
  getMintToCheckedInstruction,
} from "@solana-program/token-2022";
import { beforeAll, describe, expect, it } from "vitest";
import { fundSol } from "../../../test/fixtures/fund";
import { runExample } from "../../../test/record";
import { clawBack, failure, pause, resume } from "./blocked-transfer";
import { rpc, send } from "./config";
import { balanceOf, demoApprove, demoBlocked, demoCreate } from "./demo";
import { approveHolder, openAccount, tokenAccountOf } from "./approve-holder";
import { run } from "./run";
import { runConfidential } from "./confidential";

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

  it("confidential: same asset plus ConfidentialTransferMint; the issuer approves each holder", async () => {
    const ctIssuer = await generateKeyPairSigner();
    await fundSol(ctIssuer.address, 2);
    const r = await runExample(() => runConfidential(ctIssuer), {
      output: out("confidential"),
    });
    const ctHolder = r.value.holder;
    expect(r.value.asset.extensions).toEqual(
      expect.arrayContaining([
        "MetadataPointer",
        "TokenMetadata",
        "PausableConfig",
        "PermanentDelegate",
        "DefaultAccountState",
        "ConfidentialTransferMint",
      ]),
    );
    expect(r.value.autoApprove).toBe(false);
    expect(r.value.auditor).toEqual({
      __option: "Some",
      value: r.value.auditorPubkey,
    });
    // Configuring works on a frozen account, but it isn't approved yet.
    expect(r.value.enabled.state).toBe("Frozen");
    expect(r.value.enabled.confidentialApproved).toBe(false);
    expect(r.value.approved.state).toBe("Initialized");
    expect(r.value.approved.confidentialApproved).toBe(true);

    // Checks behind the page's notes on how the other controls interact (not
    // printed): pause and freeze block a confidential deposit, and the
    // permanent delegate moves only the public balance.
    const mint = r.value.asset.mint;
    const token = await tokenAccountOf(ctHolder.address, mint);
    await send(ctIssuer, [
      getMintToCheckedInstruction({
        mint,
        token,
        mintAuthority: ctIssuer,
        amount: 10_000_000n,
        decimals: 6,
      }),
    ]);
    const deposit = (amount: bigint) =>
      send(
        ctHolder,
        [
          getConfidentialDepositInstruction({
            token,
            mint,
            authority: ctHolder,
            amount,
            decimals: 6,
          }),
        ],
        { skipPreflight: true },
      ).then(
        (sig) => failure(sig),
        (e: { signature: Signature }) => failure(e.signature),
      );
    const code = (f: Awaited<ReturnType<typeof failure>>) =>
      JSON.stringify(f.err, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
    expect((await deposit(4_000_000n)).err).toBeNull();
    await pause(ctIssuer, mint);
    // Token-2022 MintPaused = custom error 67.
    expect(code(await deposit(1_000_000n))).toBe(
      '{"InstructionError":[0,{"Custom":67}]}',
    );
    await resume(ctIssuer, mint);
    await openAccount(ctIssuer, mint, ctIssuer.address);
    await approveHolder(ctIssuer, mint, ctIssuer.address);
    await clawBack(ctIssuer, mint, ctHolder.address, 6_000_000n);
    const { data } = await fetchToken(rpc, token);
    expect(data.amount).toBe(0n);
    const ctAccount =
      data.extensions.__option === "Some"
        ? data.extensions.value.find(
            (e) => e.__kind === "ConfidentialTransferAccount",
          )
        : undefined;
    // The 4 LSF deposit is still in the (encrypted) pending balance.
    expect(
      ctAccount?.__kind === "ConfidentialTransferAccount" &&
        ctAccount.pendingBalanceCreditCounter,
    ).toBe(1n);
    // A frozen account can't use confidential instructions: AccountFrozen = 17.
    await send(ctIssuer, [
      getMintToCheckedInstruction({
        mint,
        token,
        mintAuthority: ctIssuer,
        amount: 1_000_000n,
        decimals: 6,
      }),
      getFreezeAccountInstruction({ account: token, mint, owner: ctIssuer }),
    ]);
    expect(code(await deposit(1_000_000n))).toBe(
      '{"InstructionError":[0,{"Custom":17}]}',
    );
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
