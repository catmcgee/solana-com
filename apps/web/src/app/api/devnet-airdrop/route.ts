import {
  createSolanaRpc,
  isAddress,
  lamports,
  type Signature,
} from "@solana/kit";
import { allow, clientKey } from "@/lib/delivery-vs-payment/server/rateLimit";

/**
 * POST /api/devnet-airdrop: 1 devnet SOL for the Quickstart, from Helius's
 * devnet RPC, which is far less rate-limited than the public devnet faucet.
 * Takes `{ "address": "..." }` as JSON or a form body (so the CLI tab can use
 * `curl -d address=...`), waits for the airdrop to confirm, and returns
 * `{ signature }` or `{ error }`.
 *
 * HELIUS_API_KEY is read per request and never leaves the server. It is set
 * per Vercel environment: without it (production until it gets its own key,
 * and local dev) the route answers 503 and points to faucet.solana.com.
 *
 * Limits are in-memory per instance (see rateLimit.ts): one airdrop per
 * address a day, a few per IP an hour, and an hourly cap for the instance.
 */
export const runtime = "nodejs";

const AMOUNT = lamports(1_000_000_000n); // 1 SOL, Helius's devnet maximum
const HOUR = 60 * 60 * 1000;
const PER_ADDRESS = { limit: 1, windowMs: 24 * HOUR };
const PER_IP = { limit: 3, windowMs: HOUR };
const GLOBAL = { limit: 100, windowMs: HOUR };
const FAUCET = "Get devnet SOL at https://faucet.solana.com instead.";

/** JSON with a trailing newline, so curl output ends cleanly. */
function json(body: Record<string, string>, status = 200) {
  return new Response(`${JSON.stringify(body)}\n`, {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function readAddress(request: Request): Promise<unknown> {
  try {
    if (request.headers.get("content-type")?.includes("json")) {
      return ((await request.json()) as { address?: unknown })?.address;
    }
    return (await request.formData()).get("address");
  } catch {
    return undefined;
  }
}

async function confirm(
  rpc: ReturnType<typeof createSolanaRpc>,
  signature: Signature,
) {
  for (let i = 0; i < 60; i++) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0];
    if (status?.err) throw new Error("airdrop failed");
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("airdrop not confirmed");
}

export async function POST(request: Request) {
  const key = process.env.HELIUS_API_KEY;
  if (!key) {
    return json({ error: `This faucet is not available here. ${FAUCET}` }, 503);
  }

  const address = await readAddress(request);
  if (typeof address !== "string" || !isAddress(address)) {
    return json({ error: "Send a base58 Solana address as `address`." }, 400);
  }

  if (
    !allow(`airdrop:ip:${clientKey(request)}`, PER_IP.limit, PER_IP.windowMs) ||
    !allow(
      `airdrop:address:${address}`,
      PER_ADDRESS.limit,
      PER_ADDRESS.windowMs,
    ) ||
    !allow("airdrop:global", GLOBAL.limit, GLOBAL.windowMs)
  ) {
    return json({ error: `Airdrop limit reached. ${FAUCET}` }, 429);
  }

  try {
    const rpc = createSolanaRpc(
      `https://devnet.helius-rpc.com/?api-key=${key}`,
    );
    const signature = await rpc.requestAirdrop(address, AMOUNT).send();
    await confirm(rpc, signature);
    return json({ signature });
  } catch {
    // Never echo the upstream error: it can carry the keyed RPC URL.
    return json({ error: `Airdrop failed. ${FAUCET}` }, 502);
  }
}
