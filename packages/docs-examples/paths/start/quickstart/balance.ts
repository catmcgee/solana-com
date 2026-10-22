// #region balance
import { lamports } from "@solana/kit";
import { client, tokenBalance } from "./client";

const wallet = client.identity.address;
console.log("Wallet:", wallet);

// Balances are in lamports: 1 SOL = 1,000,000,000 lamports.
const { value: before } = await client.rpc.getBalance(wallet).send();
if (before < 100_000_000n) {
  // Ask devnet for 1 free test SOL, which pays transaction fees.
  try {
    console.log(
      "Airdrop:",
      await client.airdrop(wallet, lamports(1_000_000_000n)),
    );
  } catch {
    console.log(
      `Airdrop refused (devnet faucets are rate-limited). Get devnet SOL for ${wallet} at https://faucet.solana.com, then run this again.`,
    );
    process.exit(0);
  }
}
const { value: balance } = await client.rpc.getBalance(wallet).send();
console.log("Balance:", Number(balance) / 1e9, "SOL");

const usdc = await tokenBalance(wallet);
console.log("USDC:", usdc);
if (usdc === "0") {
  console.log(
    `Get free devnet USDC for ${wallet} at https://faucet.circle.com (pick Solana Devnet).`,
  );
}
// #endregion balance
