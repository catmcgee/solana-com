// #region balance
import { client, tokenBalance } from "./client";

const wallet = client.identity.address;
console.log("Wallet:", wallet);

// Balances are in lamports: 1 SOL = 1,000,000,000 lamports.
const { value: before } = await client.rpc.getBalance(wallet).send();
if (before < 100_000_000n) {
  // Ask solana.com's devnet faucet for 1 free test SOL, which pays fees.
  const { signature } = await fetch("https://solana.com/api/devnet-airdrop", {
    method: "POST",
    body: new URLSearchParams({ address: wallet }),
  })
    .then((response) => response.json() as Promise<{ signature?: string }>)
    .catch(() => ({ signature: undefined }));
  if (!signature) {
    console.log(
      `Airdrop refused (devnet faucets are rate-limited). Get devnet SOL for ${wallet} at https://faucet.solana.com, then run this again.`,
    );
    process.exit(0);
  }
  console.log("Airdrop:", signature);
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
