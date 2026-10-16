// #region balance
import { airdropFactory, lamports } from "@solana/kit";
import { loadWallet, rpc, rpcSubscriptions } from "./config";

const wallet = await loadWallet();
console.log("Wallet:", wallet.address);

// Every balance is in lamports: 1 SOL = 1,000,000,000 lamports.
const { value: balance } = await rpc.getBalance(wallet.address).send();
console.log("Balance:", Number(balance) / 1e9, "SOL");

if (balance < 100_000_000n) {
  // Ask devnet for 1 free test SOL.
  const airdrop = airdropFactory({ rpc, rpcSubscriptions });
  const signature = await airdrop({
    recipientAddress: wallet.address,
    lamports: lamports(1_000_000_000n),
    commitment: "confirmed",
  });
  console.log("Airdrop:", signature);

  const { value: after } = await rpc.getBalance(wallet.address).send();
  console.log("Balance:", Number(after) / 1e9, "SOL");
}
// #endregion balance
