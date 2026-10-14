// #region blocked
import {
  isSolanaError,
  type Address,
  type Signature,
  type TransactionSigner,
} from "@solana/kit";
import {
  getPauseInstruction,
  getResumeInstruction,
  getTransferCheckedInstruction,
  isToken2022Error,
  TOKEN_2022_ERROR__ACCOUNT_FROZEN,
} from "@solana-program/token-2022";
import { rpc, send } from "./config";
import { tokenAccountOf } from "./approve-holder";

export async function transfer(
  from: TransactionSigner,
  mint: Address,
  to: Address,
  amount: bigint,
  options: { skipPreflight?: boolean; feePayer?: TransactionSigner } = {},
) {
  return send(
    options.feePayer ?? from,
    [
      getTransferCheckedInstruction({
        source: await tokenAccountOf(from.address, mint),
        mint,
        destination: await tokenAccountOf(to, mint),
        authority: from,
        amount,
        decimals: 6,
      }),
    ],
    options,
  );
}

/** What a failed transaction did onchain: its error, the program log and the fee. */
export async function failure(signature: Signature) {
  const tx = await rpc
    .getTransaction(signature, {
      commitment: "confirmed",
      encoding: "json",
      maxSupportedTransactionVersion: 0,
    })
    .send();
  return {
    err: tx?.meta?.err,
    log: tx?.meta?.logMessages?.find((l) => l.includes("Error")),
    fee: tx?.meta?.fee,
  };
}

/**
 * A transfer to an account the issuer has not approved fails with Token-2022
 * `AccountFrozen` (custom error 17). Sent with `skipPreflight`, it still lands
 * as a failed transaction and the sender still pays the fee.
 */
export async function sendToUnapproved(
  holder: TransactionSigner,
  mint: Address,
  unapproved: Address,
) {
  try {
    await transfer(holder, mint, unapproved, 1_000_000n, {
      skipPreflight: true,
    });
    throw new Error("expected the transfer to fail");
  } catch (error) {
    const signature = (error as { signature?: Signature }).signature;
    if (!signature) throw error;
    return { signature, ...(await failure(signature)) };
  }
}

/** With preflight (the default) the RPC rejects it before it lands: no fee. */
export async function sendToUnapprovedWithPreflight(
  holder: TransactionSigner,
  mint: Address,
  unapproved: Address,
) {
  try {
    await transfer(holder, mint, unapproved, 1_000_000n);
    throw new Error("expected the transfer to fail");
  } catch (error) {
    const { transactionMessage } = error as {
      transactionMessage: Parameters<typeof isToken2022Error>[1];
    };
    const cause = isSolanaError(error) ? error.cause : undefined;
    return {
      code: isSolanaError(error) ? error.context.__code : undefined,
      accountFrozen: isToken2022Error(
        cause,
        transactionMessage,
        TOKEN_2022_ERROR__ACCOUNT_FROZEN,
      ),
      message:
        (cause as Error | undefined)?.message ?? (error as Error).message,
    };
  }
}

/**
 * The permanent delegate (the issuer) moves tokens out of any account
 * without the holder's signature, e.g. to recover them after a court order.
 */
export async function clawBack(
  issuer: TransactionSigner,
  mint: Address,
  holder: Address,
  amount: bigint,
) {
  return send(issuer, [
    getTransferCheckedInstruction({
      source: await tokenAccountOf(holder, mint),
      mint,
      destination: await tokenAccountOf(issuer.address, mint),
      authority: issuer,
      amount,
      decimals: 6,
    }),
  ]);
}

/** Pause every transfer of the asset, then resume. */
export async function pause(issuer: TransactionSigner, mint: Address) {
  return send(issuer, [getPauseInstruction({ mint, authority: issuer })]);
}
export async function resume(issuer: TransactionSigner, mint: Address) {
  return send(issuer, [getResumeInstruction({ mint, authority: issuer })]);
}
// #endregion blocked
