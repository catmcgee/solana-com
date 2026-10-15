/**
 * Prices an LSF trade from the live USDC/USD Pyth feed, records it with the
 * DvP program, shows that Settle fails and moves nothing while the cash leg
 * is unfunded, then funds it and settles both legs in one transaction. Each
 * step's prints are the docs' output for that step.
 */
import type { Address, TransactionSigner } from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  findAssociatedTokenPda,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import { rpc } from "./config";
import { decimal, priceTrade } from "./price";
import {
  approveEscrow,
  createTrade,
  fundAssetLeg,
  fundCashLeg,
  settle,
  settleUnfunded,
  USDC_MINT,
  type Trade,
} from "./trade";

const json = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : x));
const units = (n: bigint) => decimal(n, -6).replace(/\.?0+$/, "");
const usd = (n: bigint) => `$${decimal(n / 10_000n, -2)}`;

/** Balance of a token account, or 0 when it does not exist (yet, or any more). */
export async function balance(account: Address) {
  const info = await rpc.getAccountInfo(account, { encoding: "base64" }).send();
  if (!info.value) return 0n;
  const { value } = await rpc.getTokenAccountBalance(account).send();
  return BigInt(value.amount);
}
export async function holding(owner: Address, mint: Address) {
  const tokenProgram =
    mint === USDC_MINT ? TOKEN_PROGRAM_ADDRESS : TOKEN_2022_PROGRAM_ADDRESS;
  const [ata] = await findAssociatedTokenPda({ owner, mint, tokenProgram });
  return balance(ata);
}

export async function demoPrice(
  agent: TransactionSigner,
  seller: Address,
  buyer: Address,
  asset: Address,
) {
  const quote = await priceTrade(4_000_000n, 1_250_000n);
  const { usdc } = quote;
  console.log(
    "USDC/USD from Pyth:",
    decimal(usdc.price, usdc.exponent),
    "±",
    decimal(usdc.conf, usdc.exponent),
    `(published ${usdc.ageSeconds} s ago)`,
  );
  console.log(
    `Price: 4 LSF × $1.25 = ${usd(quote.notionalUsd)} = ${units(quote.cashAmount)} USDC`,
  );
  const { trade, signature } = await createTrade(agent, {
    seller,
    buyer,
    agent: agent.address,
    asset,
    assetAmount: quote.assetAmount,
    cashAmount: quote.cashAmount,
  });
  console.log("Trade record:", trade.record);
  console.log(
    "  asset leg:",
    units(trade.assetAmount),
    "LSF, escrow",
    trade.escrowA,
  );
  console.log(
    "  cash leg:",
    units(trade.cashAmount),
    "USDC, escrow",
    trade.escrowB,
  );
  console.log("Record checked: owner, size, address and terms match");
  console.log("Signature:", signature);
  return trade;
}

export async function demoUnfunded(
  issuer: TransactionSigner,
  seller: TransactionSigner,
  agent: TransactionSigner,
  trade: Trade,
) {
  const approved = await approveEscrow(issuer, trade);
  console.log("Issuer approved the trade's LSF escrow. Signature:", approved);
  const funded = await fundAssetLeg(seller, trade);
  console.log("Seller funded the asset leg. Signature:", funded);

  const failed = await settleUnfunded(agent, trade);
  console.log(
    "Settle with the cash leg unfunded (skipPreflight): failed onchain",
  );
  console.log("Failed signature:", failed.signature);
  console.log("  err:", json(failed.err));
  console.log(`  DvP error ${failed.code}:`, failed.message);
  console.log("  fee paid anyway:", String(failed.fee), "lamports");
  const after = {
    escrowA: await balance(trade.escrowA),
    escrowB: await balance(trade.escrowB),
    buyerLsf: await holding(trade.buyer, trade.asset),
    sellerUsdc: await holding(trade.seller, USDC_MINT),
  };
  console.log(
    "Nothing moved: asset escrow",
    units(after.escrowA),
    "LSF | cash escrow",
    units(after.escrowB),
    "USDC | buyer",
    units(after.buyerLsf),
    "LSF | seller",
    units(after.sellerUsdc),
    "USDC",
  );
  return { failed, after };
}

export async function demoSettle(
  buyer: TransactionSigner,
  agent: TransactionSigner,
  trade: Trade,
) {
  const funded = await fundCashLeg(buyer, trade);
  console.log("Buyer funded the cash leg. Signature:", funded);
  const settled = await settle(agent, trade);
  console.log("Settled both legs in one transaction. Signature:", settled);
  const after = {
    buyerLsf: await holding(trade.buyer, trade.asset),
    buyerUsdc: await holding(trade.buyer, USDC_MINT),
    sellerLsf: await holding(trade.seller, trade.asset),
    sellerUsdc: await holding(trade.seller, USDC_MINT),
    recordClosed: !(await rpc.getAccountInfo(trade.record).send()).value,
  };
  console.log(
    "Balances: buyer",
    units(after.buyerLsf),
    "LSF,",
    units(after.buyerUsdc),
    "USDC | seller",
    units(after.sellerLsf),
    "LSF,",
    units(after.sellerUsdc),
    "USDC",
  );
  console.log("Trade record and escrows closed:", after.recordClosed);
  return { settled, after };
}
