// #region send
import { generateKeyPairSigner, lamports } from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { loadWallet, rpc, send } from "./config";

const wallet = await loadWallet();
// A brand-new address to pay. Any Solana address works here.
const { address: recipient } = await generateKeyPairSigner();

// One instruction for the System Program: move 0.01 SOL.
const transfer = getTransferSolInstruction({
  source: wallet,
  destination: recipient,
  amount: lamports(10_000_000n),
});

const signature = await send(wallet, [transfer]);
console.log("Sent 0.01 SOL to", recipient);
console.log("Signature:", signature);
console.log(
  `Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`,
);

const { value: balance } = await rpc.getBalance(recipient).send();
console.log("Recipient balance:", Number(balance) / 1e9, "SOL");
// #endregion send
