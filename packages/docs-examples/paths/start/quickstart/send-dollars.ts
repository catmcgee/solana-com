// #region send
import { generateKeyPairSigner } from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { loadWallet, rpc, send, USDC_DECIMALS, USDC_MINT } from "./config";

const wallet = await loadWallet();
// A brand-new address to pay. Any Solana address works here.
const { address: recipient } = await generateKeyPairSigner();

// Each wallet holds USDC in its own token account for the USDC mint.
const tokenAccount = async (owner: typeof recipient) =>
  (
    await findAssociatedTokenPda({
      mint: USDC_MINT,
      owner,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];
const source = await tokenAccount(wallet.address);
const destination = await tokenAccount(recipient);

const amount = 1_000_000n; // 1 USDC: amounts are in base units (6 decimals)
const balance = await rpc
  .getTokenAccountBalance(source)
  .send()
  .then(({ value }) => BigInt(value.amount))
  .catch(() => 0n);
if (balance < amount) {
  console.log(
    `No devnet USDC yet. Get some for ${wallet.address} at https://faucet.circle.com (pick Solana Devnet), then run this again.`,
  );
  process.exit(0);
}

// Two instructions in one transaction: open the recipient's token account
// (if it doesn't exist yet), then move 1 USDC into it.
const openAccount = getCreateAssociatedTokenIdempotentInstruction({
  payer: wallet,
  ata: destination,
  owner: recipient,
  mint: USDC_MINT,
});
const transfer = getTransferCheckedInstruction({
  source,
  mint: USDC_MINT,
  destination,
  authority: wallet,
  amount,
  decimals: USDC_DECIMALS,
});

const signature = await send(wallet, [openAccount, transfer]);
console.log("Sent 1 USDC to", recipient);
console.log("Signature:", signature);
console.log(
  `Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`,
);

const { value } = await rpc.getTokenAccountBalance(destination).send();
console.log("Recipient balance:", value.uiAmountString, "USDC");
// #endregion send
