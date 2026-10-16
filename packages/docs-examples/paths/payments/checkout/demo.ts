/**
 * Test helpers for the checkout recordings. They call the code shown on the
 * pages; `demoVerify` and `confirm` print each call's result the way the
 * terminal panels on the backend page show it.
 */
import {
  generateKeyPairSigner,
  type Address,
  type Signature,
} from "@solana/kit";
import { USDC_MINT } from "./config";
import { createOrder, type Order } from "./orders";
import { POST } from "./route";
import { verifyPayment } from "./verify-payment";

export async function newOrder(
  id: string,
  storeOwner: Address,
  amount: bigint,
): Promise<Order> {
  const reference = (await generateKeyPairSigner()).address;
  return createOrder({ id, storeOwner, amount, reference });
}

/** The backend verifies by signature. */
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

/** The Next.js confirm route, called with a Request. */
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
