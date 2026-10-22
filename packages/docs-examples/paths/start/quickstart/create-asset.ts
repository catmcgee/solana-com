// #region asset
import { generateKeyPairSigner } from "@solana/kit";
import { getCreateAccountInstruction } from "@solana-program/system";
import {
  extension,
  fetchMint,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getInitializeMintInstruction,
  getMintSize,
  getMintToInstruction,
  getPostInitializeInstructionsForMintExtensions,
  getPreInitializeInstructionsForMintExtensions,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import { loadWallet, rpc, send } from "./config";

const wallet = await loadWallet();
const mint = await generateKeyPairSigner(); // the new asset's address
const decimals = 2;

// 1. The asset's name, symbol, and details live onchain, in the mint itself.
const extensions = [
  extension("MetadataPointer", {
    authority: wallet.address,
    metadataAddress: mint.address,
  }),
  extension("TokenMetadata", {
    updateAuthority: wallet.address,
    mint: mint.address,
    name: "Example Fund",
    symbol: "EXF",
    uri: "https://example.com/exf.json",
    additionalMetadata: new Map([["asset class", "fund share"]]),
  }),
];

// 2. Create the mint account, which defines the asset, and pay its deposit.
// Metadata is written after the mint exists: allocate without it, but fund
// the deposit for the final size.
const space = getMintSize(
  extensions.filter((e) => e.__kind !== "TokenMetadata"),
);
const rent = await rpc
  .getMinimumBalanceForRentExemption(BigInt(getMintSize(extensions)))
  .send();
const createAccount = getCreateAccountInstruction({
  payer: wallet,
  newAccount: mint,
  lamports: rent,
  space,
  programAddress: TOKEN_2022_PROGRAM_ADDRESS,
});

// 3. Open your token account for the asset, which holds your balance.
const [tokenAccount] = await findAssociatedTokenPda({
  mint: mint.address,
  owner: wallet.address,
  tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
});

// 4. Mint 1,000 units to yourself. Amounts are in base units: 1000 * 10^2.
// Everything runs in one transaction: all of it succeeds, or none of it does.
const signature = await send(wallet, [
  createAccount,
  ...getPreInitializeInstructionsForMintExtensions(mint.address, extensions),
  getInitializeMintInstruction({
    mint: mint.address,
    decimals,
    mintAuthority: wallet.address,
  }),
  ...getPostInitializeInstructionsForMintExtensions(
    mint.address,
    wallet,
    extensions,
  ),
  getCreateAssociatedTokenIdempotentInstruction({
    payer: wallet,
    ata: tokenAccount,
    owner: wallet.address,
    mint: mint.address,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  }),
  getMintToInstruction({
    mint: mint.address,
    token: tokenAccount,
    mintAuthority: wallet,
    amount: 1000n * 10n ** BigInt(decimals),
  }),
]);

// Read the asset back from the network.
const asset = await fetchMint(rpc, mint.address);
const metadata =
  asset.data.extensions.__option === "Some"
    ? asset.data.extensions.value.find((e) => e.__kind === "TokenMetadata")
    : undefined;
console.log("Asset (mint):", mint.address);
if (metadata?.__kind === "TokenMetadata")
  console.log("Name:", metadata.name, `(${metadata.symbol})`);
console.log("Signature:", signature);
console.log(
  `Explorer: https://explorer.solana.com/address/${mint.address}?cluster=devnet`,
);

const { value } = await rpc.getTokenAccountBalance(tokenAccount).send();
console.log("Balance:", value.uiAmountString, "EXF");
// #endregion asset
