import { checkBotId } from "botid/server";
import { allow, clientKey } from "@/lib/delivery-vs-payment/server/rateLimit";
import {
  DemoCapped,
  demoConfigured,
  DemoUnconfigured,
  DemoUnfunded,
  sendDemoTransfer,
  type DemoKind,
} from "./server";

/**
 * POST handler for one demo on "Solana in action": a real devnet USDC
 * transfer, answered with `{ signature, ms }` once it's confirmed, or
 * `{ error }` with one of "rate-limited", "capped", "bot", "unconfigured",
 * "unfunded", or "failed". The scenes still play on an error; they just leave out the
 * Explorer link.
 *
 * Browser calls only: BotId (instrumentation-client.ts protects these paths)
 * plus in-memory limits per IP a minute and per instance an hour, then the
 * onchain daily cap across all instances (server.ts). BotId runs
 * on Vercel only; elsewhere (next start locally) the route answers "bot"
 * unless the wallets are missing, in which case it answers "unconfigured"
 * first.
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
    if (!demoConfigured()) return json({ error: "unconfigured" }, 503);
    // Fail closed: off Vercel, or without its OIDC token, checkBotId throws.
    const human = await checkBotId().then(
      (r) => !r.isBot,
      () => false,
    );
    if (!human) return json({ error: "bot" }, 403);

    try {
      const { signature, ms } = await sendDemoTransfer(kind);
      return json({ signature, ms });
    } catch (error) {
      if (error instanceof DemoUnconfigured)
        return json({ error: "unconfigured" }, 503);
      if (error instanceof DemoCapped) return json({ error: "capped" }, 429);
      if (error instanceof DemoUnfunded)
        return json({ error: "unfunded" }, 503);
      // Never the error text: an RPC error can carry the keyed RPC URL.
      return json({ error: "failed" }, 502);
    }
  };
}
