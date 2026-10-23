import { checkBotId } from "botid/server";
import { allow, clientKey } from "@/lib/delivery-vs-payment/server/rateLimit";
import {
  DemoUnconfigured,
  DemoUnfunded,
  sendDemoTransfer,
  type DemoKind,
} from "./server";

/**
 * POST handler for one demo on "Solana in action": a real devnet USDC
 * transfer, answered with `{ signature, ms }` once it's confirmed, or
 * `{ error }` with one of "rate-limited", "bot", "unconfigured", "unfunded",
 * or "failed". The scenes still play on an error; they just leave out the
 * Explorer link.
 *
 * Browser calls only: BotId (instrumentation-client.ts protects these paths)
 * plus in-memory limits per IP a minute and per instance an hour.
 */
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const GLOBAL = { limit: 600, windowMs: HOUR };
const NO_STORE = { "Cache-Control": "no-store" };

function json(body: Record<string, string | number>, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

export function demoRoute(kind: DemoKind, perMinute: number) {
  return async function POST(request: Request): Promise<Response> {
    if (
      !allow(`demo:${kind}:${clientKey(request)}`, perMinute, MINUTE) ||
      !allow("demo:global", GLOBAL.limit, GLOBAL.windowMs)
    ) {
      return json({ error: "rate-limited" }, 429);
    }
    if ((await checkBotId()).isBot) return json({ error: "bot" }, 403);

    try {
      const { signature, ms } = await sendDemoTransfer(kind);
      return json({ signature, ms });
    } catch (error) {
      if (error instanceof DemoUnconfigured)
        return json({ error: "unconfigured" }, 503);
      if (error instanceof DemoUnfunded)
        return json({ error: "unfunded" }, 503);
      // Never the error text: an RPC error can carry the keyed RPC URL.
      return json({ error: "failed" }, 502);
    }
  };
}
