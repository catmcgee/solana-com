// #region balance
import { airdropFactory, lamports } from "@solana/kit";
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { loadWallet, rpc, rpcSubscriptions, USDC_MINT } from "./config";

const wallet = await loadWallet();
console.log("Wallet:", wallet.address);

// Every balance is in lamports: 1 SOL = 1,000,000,000 lamports.
const { value: balance } = await rpc.getBalance(wallet.address).send();
console.log("Balance:", Number(balance) / 1e9, "SOL");

if (balance < 100_000_000n) {
  // Ask devnet for 1 free test SOL, which pays transaction fees.
  const airdrop = airdropFactory({ rpc, rpcSubscriptions });
  try {
    const signature = await airdrop({
      recipientAddress: wallet.address,
      lamports: lamports(1_000_000_000n),
      commitment: "confirmed",
    });
    console.log("Airdrop:", signature);
  } catch {
    console.log(
      `Airdrop refused (devnet faucets are rate-limited). Get devnet SOL for ${wallet.address} at https://faucet.solana.com, then run this again.`,
    );
    process.exit(0);
  }

  const { value: after } = await rpc.getBalance(wallet.address).send();
  console.log("Balance:", Number(after) / 1e9, "SOL");
}

// Dollars (USDC) sit in a token account: one per wallet per token.
const [usdcAccount] = await findAssociatedTokenPda({
  mint: USDC_MINT,
  owner: wallet.address,
  tokenProgram: TOKEN_PROGRAM_ADDRESS,
});
const usdc = await rpc
  .getTokenAccountBalance(usdcAccount)
  .send()
  .then(({ value }) => value.uiAmountString)
  .catch(() => "0"); // no token account yet
console.log("USDC:", usdc);
if (usdc === "0") {
  console.log(
    `Get free devnet USDC for ${wallet.address} at https://faucet.circle.com (pick Solana Devnet).`,
  );
}
// #endregion balance
