/**
 * Drives the checkout steps the way a store would and prints what happens.
 * The docs embed what each step prints as its recorded output. Run it against
 * a local Surfpool (`surfpool start`) with
 * RPC_URL=http://127.0.0.1:8899 RPC_SUBSCRIPTIONS_URL=ws://127.0.0.1:8900.
 */
import {
  generateKeyPairSigner,
  type Address,
  type Signature,
  type TransactionSigner,
} from "@solana/kit";
import { rpc, USDC_MINT } from "./config";
import { createOrder, type Order } from "./orders";
import { payStore } from "./pay";
import { POST } from "./route";
import { verifyPayment } from "./verify-payment";

export async function fee(signature: Signature): Promise<bigint> {
  const tx = await rpc
    .getTransaction(signature, {
      commitment: "confirmed",
      encoding: "json",
      maxSupportedTransactionVersion: 0,
    })
    .send();
  return tx?.meta?.fee ?? 0n;
}

export async function newOrder(
  id: string,
  storeOwner: Address,
  amount: bigint,
): Promise<Order> {
  const reference = (await generateKeyPairSigner()).address;
  return createOrder({ id, storeOwner, amount, reference });
}

/** Step 1: the customer pays. */
export async function demoPay(customer: TransactionSigner, order: Order) {
  const signature = await payStore(customer, order);
  console.log(
    `Paid ${order.id}: ${Number(order.amount) / 1e6} USDC (${order.amount} base units)`,
  );
  console.log("Reference:", order.reference);
  console.log("Signature:", signature);
  console.log("Fee:", String(await fee(signature)), "lamports");
  return signature;
}

/** Step 2: the backend verifies by signature. */
export async function demoVerify(
  order: Pick<Order, "id" | "storeOwner" | "amount" | "reference">,
  signature: Signature,
) {
  const check = await verifyPayment({
    signature,
    storeOwner: order.storeOwner,
    mint: USDC_MINT,
    amount: order.amount,
    reference: order.reference,
  });
  console.log(
    `verifyPayment(${order.id}, expects ${order.amount}):`,
    JSON.stringify(check),
  );
  return check;
}

/** Step 3: the confirm route, called three ways. */
export async function confirm(orderId: string, signature: string) {
  const res = await POST(
    new Request(`http://localhost/api/orders/${orderId}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signature }),
    }),
    { params: Promise.resolve({ orderId }) },
  );
  const body = await res.json();
  console.log(
    `POST /api/orders/${orderId}/confirm ->`,
    res.status,
    JSON.stringify(body),
  );
  return { status: res.status, body };
}
