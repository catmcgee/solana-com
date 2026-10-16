// #region token
import { generateKeyPairSigner } from "@solana/kit";
import { getCreateAccountInstruction } from "@solana-program/system";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getInitializeMintInstruction,
  getMintSize,
  getMintToInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { loadWallet, rpc, send } from "./config";

const wallet = await loadWallet();
const mint = await generateKeyPairSigner(); // the new token's address
const decimals = 2;

// 1. Create the mint account, which defines the token, and pay its deposit.
const space = BigInt(getMintSize());
const rent = await rpc.getMinimumBalanceForRentExemption(space).send();
const createAccount = getCreateAccountInstruction({
  payer: wallet,
  newAccount: mint,
  lamports: rent,
  space,
  programAddress: TOKEN_PROGRAM_ADDRESS,
});
const initializeMint = getInitializeMintInstruction({
  mint: mint.address,
  decimals,
  mintAuthority: wallet.address,
});

// 2. Create your token account for it, which holds your balance.
const [tokenAccount] = await findAssociatedTokenPda({
  mint: mint.address,
  owner: wallet.address,
  tokenProgram: TOKEN_PROGRAM_ADDRESS,
});
const createTokenAccount = getCreateAssociatedTokenIdempotentInstruction({
  payer: wallet,
  ata: tokenAccount,
  owner: wallet.address,
  mint: mint.address,
});

// 3. Mint 1,000 tokens into it. Amounts are in base units: 1000 * 10^2.
const mintTo = getMintToInstruction({
  mint: mint.address,
  token: tokenAccount,
  mintAuthority: wallet,
  amount: 1000n * 10n ** BigInt(decimals),
});

// All four instructions run in one transaction: all succeed, or none do.
const signature = await send(wallet, [
  createAccount,
  initializeMint,
  createTokenAccount,
  mintTo,
]);
console.log("Token (mint):", mint.address);
console.log("Your token account:", tokenAccount);
console.log("Signature:", signature);
console.log(
  `Explorer: https://explorer.solana.com/address/${mint.address}?cluster=devnet`,
);

const { value } = await rpc.getTokenAccountBalance(tokenAccount).send();
console.log("Balance:", value.uiAmountString, "tokens");
// #endregion token
