/**
 * Issues the asset, approves two holders, then shows what the restrictions do:
 * a transfer to an approved holder succeeds; one to an unapproved (frozen)
 * account fails onchain and still pays the fee; pausing blocks everyone; the
 * permanent delegate can move any balance. Each step's prints are the docs'
 * recorded output.
 */
import type { Address, Signature, TransactionSigner } from "@solana/kit";
import { fetchToken } from "@solana-program/token-2022";
import { approveHolder, openAccount, tokenAccountOf } from "./approve-holder";
import {
  clawBack,
  failure,
  pause,
  resume,
  sendToUnapproved,
  sendToUnapprovedWithPreflight,
  transfer,
} from "./blocked-transfer";
import { rpc } from "./config";
import { createAsset } from "./create-asset";

const json = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : x));
const units = (n: bigint) => `${Number(n) / 1e6} LSF`;

export async function feeOf(signature: Signature) {
  return String((await failure(signature)).fee ?? 0n);
}

export async function balanceOf(owner: Address, mint: Address) {
  const { data } = await fetchToken(rpc, await tokenAccountOf(owner, mint));
  return data.amount;
}

export async function demoCreate(
  issuer: TransactionSigner,
): ReturnType<typeof createAsset> {
  const asset = await createAsset(issuer);
  console.log("Mint:", asset.mint);
  console.log("Extensions:", asset.extensions.join(", "));
  console.log("Signature:", asset.signature);
  console.log("Fee:", await feeOf(asset.signature), "lamports");
  return asset;
}

export async function demoApprove(
  issuer: TransactionSigner,
  mint: Address,
  owner: Address,
  amount: bigint,
) {
  const opened = await openAccount(issuer, mint, owner);
  console.log("Opened", opened.account, "state:", opened.state);
  const approved = await approveHolder(issuer, mint, owner, amount);
  console.log(
    "Approved",
    approved.account,
    "state:",
    approved.state,
    "balance:",
    units(approved.balance),
  );
  console.log("Signature:", approved.signature);
  return approved;
}

export async function demoBlocked(
  issuer: TransactionSigner,
  mint: Address,
  holder: TransactionSigner,
  approved: Address,
  unapproved: Address,
) {
  const ok = await transfer(holder, mint, approved, 100_000_000n);
  console.log("Transfer 100 LSF to approved holder: confirmed");
  console.log("Signature:", ok);

  const opened = await openAccount(issuer, mint, unapproved);
  console.log("Unapproved account", opened.account, "state:", opened.state);
  const blocked = await sendToUnapproved(holder, mint, unapproved);
  console.log(
    "Transfer 1 LSF to unapproved holder (skipPreflight): failed onchain",
  );
  console.log("Failed signature:", blocked.signature);
  console.log("  err:", json(blocked.err));
  console.log("  log:", blocked.log);
  console.log("  fee paid anyway:", String(blocked.fee), "lamports");

  const rejected = await sendToUnapprovedWithPreflight(
    holder,
    mint,
    unapproved,
  );
  console.log("Same transfer with preflight: rejected before landing, no fee");
  console.log(
    "  accountFrozen:",
    rejected.accountFrozen,
    "message:",
    rejected.message,
  );

  const paused = await pause(issuer, mint);
  console.log("Paused the asset. Signature:", paused);
  let pausedError = "";
  try {
    await transfer(holder, mint, approved, 1_000_000n);
  } catch (error) {
    const e = error as Error & { cause?: Error; context?: { logs?: string[] } };
    pausedError = (e.cause ?? e).message;
    console.log("Transfer while paused: rejected:", pausedError);
    console.log(
      "  log:",
      e.context?.logs?.find(
        (l) => /error|paused/i.test(l) && l.startsWith("Program log"),
      ),
    );
  }
  const resumed = await resume(issuer, mint);
  console.log("Resumed. Signature:", resumed);

  const moved = await clawBack(issuer, mint, approved, 50_000_000n);
  console.log(
    "Permanent delegate moved 50 LSF out of the approved holder's account",
  );
  console.log("Signature:", moved);
  console.log(
    "Balances: holder",
    units(await balanceOf(holder.address, mint)),
    "| approved",
    units(await balanceOf(approved, mint)),
    "| unapproved",
    units(await balanceOf(unapproved, mint)),
    "| issuer",
    units(await balanceOf(issuer.address, mint)),
  );
  return { ok, blocked, rejected, pausedError, moved };
}
