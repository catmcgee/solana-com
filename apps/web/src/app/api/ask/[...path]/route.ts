import { proxyAskRequest } from "@/lib/docs/ask/server/agent-proxy";
import { askBackend } from "@/lib/docs/ask/server/backend";
import { mockAskRequest } from "@/lib/docs/ask/server/mock-agent";
import { nousAskRequest } from "@/lib/docs/ask/server/nous-agent";

/**
 * The docs assistant's API (/api/ask/session, chat, feedback, search,
 * runs/:id, conversations/:id, and outside production the agent's
 * diagnostics/client-ip). Proxied to the docs agent, or, outside
 * production, answered by the Nous-backed review backend or the canned mock
 * (ASK_SOLANA_BACKEND; see lib/docs/ask/server/backend.ts).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Answers stream for as long as the agent writes.
export const maxDuration = 300;

async function handle(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  switch (askBackend()) {
    case "mock":
      return mockAskRequest(request, path);
    case "nous":
      return nousAskRequest(request, path);
    default:
      return proxyAskRequest(request, path);
  }
}

export const GET = handle;
export const POST = handle;
