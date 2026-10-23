import { demoRoute } from "@/lib/docs-demo/route";

/** POST /api/demo/paywall-call: 0.001 devnet USDC from the client to the API. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = demoRoute("paywall", 12);
