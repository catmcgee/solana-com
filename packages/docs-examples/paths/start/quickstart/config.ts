// #region config
import { existsSync, readFileSync } from "node:fs";
import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  devnet,
  generateKeyPairSigner,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  writeKeyPairSigner,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";

// Devnet: a public test network where SOL is free and has no value.
export const rpc = createSolanaRpc(
  devnet(process.env.RPC_URL ?? "https://api.devnet.solana.com"),
);
export const rpcSubscriptions = createSolanaRpcSubscriptions(
  devnet(process.env.RPC_SUBSCRIPTIONS_URL ?? "wss://api.devnet.solana.com"),
);

const WALLET_FILE = process.env.WALLET_FILE ?? "wallet.json";

/** Load the wallet from wallet.json, or create and save one on the first run. */
export async function loadWallet(): Promise<KeyPairSigner> {
  if (existsSync(WALLET_FILE)) {
    const bytes = new Uint8Array(JSON.parse(readFileSync(WALLET_FILE, "utf8")));
    return createKeyPairSignerFromBytes(bytes);
  }
  const wallet = await generateKeyPairSigner(true); // true: so it can be saved
  await writeKeyPairSigner(wallet, WALLET_FILE);
  return wallet;
}

const sendAndConfirm = sendAndConfirmTransactionFactory({
  rpc,
  rpcSubscriptions,
});

/** Put instructions in a transaction, sign it, send it and wait for it. */
export async function send(payer: KeyPairSigner, instructions: Instruction[]) {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const transaction = await signTransactionMessageWithSigners(message);
  assertIsTransactionWithBlockhashLifetime(transaction);
  await sendAndConfirm(transaction, { commitment: "confirmed" });
  return getSignatureFromTransaction(transaction);
}
// #endregion config
