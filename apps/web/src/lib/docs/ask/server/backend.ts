import "server-only";

export type AskBackend = "agent" | "nous" | "mock";

/**
 * Which backend answers /api/ask, read per request:
 *
 * - `ASK_SOLANA_BACKEND=agent` → the docs agent proxy (./agent-proxy.ts);
 * - `ASK_SOLANA_BACKEND=nous` → a model on the Nous gateway grounded in the
 *   docs (./nous-agent.ts), for review deployments without the agent;
 * - `ASK_SOLANA_BACKEND=mock` → canned answers (./mock-agent.ts).
 *
 * Unset (or unknown) keeps the older switch: ASK_SOLANA_MOCK=1 → mock, else
 * agent. The review backends never answer on a production deployment: the
 * agent proxy does, and it answers 503 when it is not configured (the
 * agent's URL in `ASK_API_URL` or `ASK_AGENT_URL`, its secret in
 * `ASK_PROXY_SECRET` or `ASK_SOLANA_PROXY_SECRET`).
 */
export function askBackend(): AskBackend {
  const configured = process.env.ASK_SOLANA_BACKEND?.trim().toLowerCase();
  const backend: AskBackend =
    configured === "agent" || configured === "nous" || configured === "mock"
      ? configured
      : process.env.ASK_SOLANA_MOCK === "1"
        ? "mock"
        : "agent";
  return backend !== "agent" && process.env.VERCEL_ENV === "production"
    ? "agent"
    : backend;
}
