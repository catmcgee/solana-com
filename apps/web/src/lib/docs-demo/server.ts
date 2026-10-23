/**
 * Server-only: the devnet transfers behind the two demos on "Solana in
 * action" (/api/demo/checkout and /api/demo/paywall-call).
 *
 * Two server-held devnet wallets: a payer (the customer, and the API
 * client) and a payee (the shop, and the API). Each demo action sends a
 * real devnet USDC transfer from the payer to the payee, with the payer as
 * fee payer, and reports how long it took to confirm. When the payer runs
 * low, the same transaction first moves the payee's USDC back, so the test
 * USDC only goes round in a circle; only the SOL fees are spent. Nothing
 * here takes a recipient or an amount from the request: both are fixed below.
 *
 * Every demo transfer carries a memo, and the payer's own history caps them
 * at DEMO_DAILY_CAP a day across every instance (default 500, see
 * onchainLimits.ts). Past that the routes answer "capped".
 *
 * DEMO_PAYER_SECRET_KEY and DEMO_PAYEE_SECRET_KEY hold each wallet's 64-byte
 * secret key as a JSON array (solana-keygen's format). They are set in
 * Vercel Preview only; without them the routes answer "unconfigured" and the
 * scenes play without an Explorer link. The keyed RPC URL never leaves the
 * server, and neither do the keys.
 */
import {
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  address,
  type Address,
  type Instruction,
  type KeyPairSigner,
  type Rpc,
  type Signature,
  type SolanaRpcApi,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  dailyCapReached,
  envNumber,
  memoInstruction,
  MEMOS,
} from "./onchainLimits";

/** Circle's devnet USDC, as in the Quickstart. */
export const DEVNET_USDC = address(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);
const DECIMALS = 6;
/** 1 USDC and 0.001 USDC, in base units. */
export const AMOUNTS = { checkout: 1_000_000n, paywall: 1_000n } as const;
export type DemoKind = keyof typeof AMOUNTS;

const POLL_MS = 150;
const CONFIRM_TIMEOUT_MS = 20_000;

/** The wallets aren't configured on this deployment. */
export class DemoUnconfigured extends Error {}
/** The wallets don't hold enough USDC between them. */
export class DemoUnfunded extends Error {}
/** The day's demo transfers, counted onchain, are used up. */
export class DemoCapped extends Error {}

export function demoConfigured(): boolean {
  return !!(
    process.env.DEMO_PAYER_SECRET_KEY && process.env.DEMO_PAYEE_SECRET_KEY
  );
}

function devnetRpcUrl(): string {
  const key = process.env.HELIUS_API_KEY;
  return key
    ? `https://devnet.helius-rpc.com/?api-key=${key}`
    : "https://api.devnet.solana.com";
}

function signer(name: string): Promise<KeyPairSigner> {
  const raw = process.env[name];
  if (!raw) throw new DemoUnconfigured(`${name} is not set`);
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(JSON.parse(raw) as number[]);
  } catch {
    throw new DemoUnconfigured(`${name} is not a JSON byte array`);
  }
  return createKeyPairSignerFromBytes(bytes);
}

async function tokenBalance(
  rpc: Rpc<SolanaRpcApi>,
  account: Address,
): Promise<bigint> {
  try {
    const { value } = await rpc
      .getTokenAccountBalance(account, { commitment: "confirmed" })
      .send();
    return BigInt(value.amount);
  } catch {
    // No token account yet: nothing in it.
    return 0n;
  }
}

async function confirm(
  rpc: Rpc<SolanaRpcApi>,
  signature: Signature,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < CONFIRM_TIMEOUT_MS) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0];
    if (status?.err) throw new Error("transaction failed");
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new Error("transaction not confirmed");
}

async function transfer(
  kind: DemoKind,
): Promise<{ signature: string; ms: number }> {
  const amount = AMOUNTS[kind];
  const [payer, payee] = await Promise.all([
    signer("DEMO_PAYER_SECRET_KEY"),
    signer("DEMO_PAYEE_SECRET_KEY"),
  ]);
  const rpc = createSolanaRpc(devnetRpcUrl());
  const ata = (owner: Address) =>
    findAssociatedTokenPda({
      owner,
      mint: DEVNET_USDC,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    }).then(([pda]) => pda);
  const [payerAta, payeeAta] = await Promise.all([
    ata(payer.address),
    ata(payee.address),
  ]);

  const createAta = (owner: KeyPairSigner, account: Address) =>
    getCreateAssociatedTokenIdempotentInstruction({
      payer,
      ata: account,
      owner: owner.address,
      mint: DEVNET_USDC,
    });
  const ixs: Instruction[] = [createAta(payee, payeeAta)];

  const [capped, balance] = await Promise.all([
    dailyCapReached(
      rpc,
      payer.address,
      MEMOS.demo,
      envNumber("DEMO_DAILY_CAP", 500),
    ),
    tokenBalance(rpc, payerAta),
  ]);
  if (capped) throw new DemoCapped("daily cap reached");
  if (balance < amount) {
    // Running low: bring the payee's USDC back first, in the same
    // transaction.
    const back = await tokenBalance(rpc, payeeAta);
    if (balance + back < amount) throw new DemoUnfunded("out of USDC");
    ixs.push(
      createAta(payer, payerAta),
      getTransferCheckedInstruction({
        source: payeeAta,
        mint: DEVNET_USDC,
        destination: payerAta,
        authority: payee,
        amount: back,
        decimals: DECIMALS,
      }),
    );
  }
  ixs.push(
    getTransferCheckedInstruction({
      source: payerAta,
      mint: DEVNET_USDC,
      destination: payeeAta,
      authority: payer,
      amount,
      decimals: DECIMALS,
    }),
    memoInstruction(MEMOS.demo),
  );

  const { value: blockhash } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );
  const signed = await signTransactionMessageWithSigners(message);
  const signature = getSignatureFromTransaction(signed);

  const start = Date.now();
  await rpc
    .sendTransaction(getBase64EncodedWireTransaction(signed), {
      encoding: "base64",
      preflightCommitment: "confirmed",
    })
    .send();
  await confirm(rpc, signature);
  return { signature, ms: Date.now() - start };
}

// One transfer at a time per instance, so two refills never race for the
// same balance.
let queue: Promise<unknown> = Promise.resolve();

/** Send one demo transfer; resolves once it's confirmed. */
export function sendDemoTransfer(
  kind: DemoKind,
): Promise<{ signature: string; ms: number }> {
  if (!demoConfigured())
    return Promise.reject(new DemoUnconfigured("not configured"));
  const run = queue.then(() => transfer(kind));
  queue = run.catch(() => undefined);
  return run;
}
