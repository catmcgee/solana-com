import { proxyAskRequest } from "@/lib/docs/ask/server/agent-proxy";
import {
  isAskMockEnabled,
  mockAskRequest,
} from "@/lib/docs/ask/server/mock-agent";

/**
 * The docs assistant's API (/api/ask/session, chat, feedback, search,
 * runs/:id). Served by the review mock when ASK_SOLANA_MOCK=1 outside
 * production, else proxied to the docs agent (lib/docs/ask/server).
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
  return isAskMockEnabled()
    ? mockAskRequest(request, path)
    : proxyAskRequest(request, path);
}

export const GET = handle;
export const POST = handle;
