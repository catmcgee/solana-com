/**
 * Drives the paywall: an unpaid request, a paid request, a replayed payment
 * header and a client whose spending cap is below the price. Prints what each
 * returns; the docs embed it as recorded output.
 */
import type { AddressInfo } from "node:net";
import type { Address, Signature, TransactionSigner } from "@solana/kit";
import { fee } from "../checkout/demo";
import { fetchWithPayment } from "./client";
import { createPaywallServer } from "./server";
import {
  decodeHeader,
  type PaymentRequired,
  type SettlementResponse,
} from "./x402";

export async function startServer(payTo: Address, price: bigint) {
  const server = createPaywallServer({ payTo, price });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/api/forecast`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export async function demoUnpaid(url: string) {
  const res = await fetch(url);
  const body = (await res.json()) as PaymentRequired;
  const [option] = body.accepts;
  console.log("GET /api/forecast ->", res.status, body.error);
  console.log(
    `  price: ${option!.maxAmountRequired} base units of ${option!.asset} (${Number(option!.maxAmountRequired) / 1e6} USDC)`,
  );
  console.log("  payTo:", option!.payTo, "network:", option!.network);
  return res.status;
}

export async function demoPaid(
  url: string,
  signer: TransactionSigner,
  maxAmount: bigint,
) {
  const res = await fetchWithPayment(url, { signer, maxAmount });
  const settlement = decodeHeader<SettlementResponse>(
    res.headers.get("x-payment-response") ?? "",
  );
  console.log(
    "GET /api/forecast (paid) ->",
    res.status,
    JSON.stringify(await res.json()),
  );
  console.log("  settled signature:", settlement.transaction);
  console.log(
    "  fee:",
    String(await fee(settlement.transaction as Signature)),
    "lamports",
  );
  return { status: res.status, signature: settlement.transaction as Signature };
}

/** Send the same X-PAYMENT header twice: the second is refused. */
export async function demoReplay(url: string, header: string) {
  const res = await fetch(url, { headers: { "X-PAYMENT": header } });
  const body = (await res.json()) as PaymentRequired;
  console.log(
    "GET /api/forecast (replayed X-PAYMENT) ->",
    res.status,
    body.error,
  );
  return res.status;
}

export async function demoOverCap(
  url: string,
  signer: TransactionSigner,
  maxAmount: bigint,
) {
  try {
    await fetchWithPayment(url, { signer, maxAmount });
    console.log("unexpected: paid above the cap");
    return false;
  } catch (err) {
    console.log("client refused:", (err as Error).message);
    return true;
  }
}
