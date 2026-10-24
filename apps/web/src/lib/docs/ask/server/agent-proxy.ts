import "server-only";

import { isRecord } from "../protocol";
import {
  NO_STORE_HEADERS,
  askError,
  isSameOriginBrowserRequest,
  readJsonBody,
} from "./request";

/**
 * Forwards /api/ask/* to the docs agent (`ASK_AGENT_URL`), adding the
 * shared secret the agent requires. Ported from Bri's
 * apps/docs/src/lib/ask-agent-proxy.ts, hardened with the Inkeep proxy's
 * checks: same-origin browser requests only, a 64 KB body cap, a 30 s limit
 * for the agent's response headers (the stream itself runs until it ends
 * or the reader leaves), and a fixed set of paths. Bodies are forwarded as
 * sent, without the client's `history`. There is no default
 * agent URL: without `ASK_AGENT_URL` and `ASK_SOLANA_PROXY_SECRET` every
 * request gets 503 `ask_not_configured`. Env is read per request.
 */

const PROXY_SECRET_HEADER = "X-Ask-Proxy-Secret";
const UPSTREAM_HEADERS_TIMEOUT_MS = 30_000;
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

const REQUEST_HEADER_ALLOWLIST = [
  "accept",
  "accept-language",
  "content-type",
  "user-agent",
  "x-ask-client-capabilities",
  "x-forwarded-for",
  "x-real-ip",
  "x-vercel-forwarded-for",
  "x-vercel-ip-city",
  "x-vercel-ip-country",
  "x-vercel-ip-country-region",
] as const;

const RESPONSE_HEADER_ALLOWLIST = [
  "content-type",
  "retry-after",
  "server-timing",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
] as const;

/** The method a path accepts, or null for paths the agent does not serve. */
export function askRouteMethod(path: string[]): "GET" | "POST" | null {
  const [head, id, ...rest] = path;
  if (rest.length > 0 || !head) return null;
  if (id === undefined) {
    if (head === "session" || head === "chat" || head === "feedback")
      return "POST";
    if (head === "search") return "GET";
    return null;
  }
  if (
    (head === "runs" || head === "conversations") &&
    /^[\w-]{1,128}$/.test(id)
  ) {
    return "GET";
  }
  return null;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function duration(ms: number): string {
  return Math.max(0, Math.round(ms * 10) / 10).toFixed(1);
}

function upstreamAbort(requestSignal: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromRequest = () => controller.abort(requestSignal.reason);
  if (requestSignal.aborted) abortFromRequest();
  else
    requestSignal.addEventListener("abort", abortFromRequest, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort(
      new DOMException("Upstream request timed out", "TimeoutError"),
    );
  }, UPSTREAM_HEADERS_TIMEOUT_MS);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    headersReceived: () => clearTimeout(timeout),
    cleanup: () => {
      clearTimeout(timeout);
      requestSignal.removeEventListener("abort", abortFromRequest);
    },
  };
}

/** Streams `body` through, running `cleanup` when it ends or is cancelled. */
function passThrough(
  body: ReadableStream<Uint8Array>,
  cleanup: () => void,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          cleanup();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        cleanup();
        controller.error(error);
      }
    },
    async cancel(reason) {
      cleanup();
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}

export async function proxyAskRequest(
  request: Request,
  path: string[],
): Promise<Response> {
  const startedAt = nowMs();
  const baseUrl = process.env.ASK_AGENT_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.ASK_SOLANA_PROXY_SECRET?.trim();
  if (!baseUrl || !secret) {
    return askError(503, "ask_not_configured", "Ask AI is not configured.");
  }

  const method = askRouteMethod(path);
  if (!method) return askError(404, "not_found");
  if (request.method !== method) {
    return askError(405, "method_not_allowed", undefined, { Allow: method });
  }
  if (
    !isSameOriginBrowserRequest(request, {
      allowRefererFallback: method === "GET",
    })
  ) {
    return askError(403, "invalid_origin", "This request is not allowed.");
  }

  let body: string | undefined;
  if (method === "POST") {
    const read = await readJsonBody(request);
    if (!read.ok) return read.response;
    body = read.text;
    // `history` is for the stateless review backends. The agent keeps its
    // own conversation memory and its chat contract has no such field.
    if (isRecord(read.value) && "history" in read.value) {
      const { history: _history, ...rest } = read.value;
      body = JSON.stringify(rest);
    }
  }
  const bodyReadMs = nowMs() - startedAt;

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(
      `/api/ask/${path.map(encodeURIComponent).join("/")}`,
      `${baseUrl}/`,
    );
  } catch {
    return askError(503, "ask_not_configured", "Ask AI is not configured.");
  }
  upstreamUrl.search = new URL(request.url).search;

  const headers = new Headers();
  for (const key of REQUEST_HEADER_ALLOWLIST) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  headers.set(PROXY_SECRET_HEADER, secret);

  const abort = upstreamAbort(request.signal);
  const upstreamStartedAt = nowMs();
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
      signal: abort.signal,
    });
  } catch (error) {
    abort.cleanup();
    if (abort.timedOut()) {
      // Not "too long": the client maps that wording to tooLong.
      return askError(504, "ask_timeout", "Ask AI timed out.");
    }
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error("[ask/proxy] upstream request failed:", error);
    return askError(502, "ask_unavailable", "Ask AI is unavailable.");
  }
  abort.headersReceived();

  const upstreamHeaderMs = nowMs() - upstreamStartedAt;
  const responseHeaders = new Headers(NO_STORE_HEADERS);
  for (const key of RESPONSE_HEADER_ALLOWLIST) {
    const value = upstream.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }
  if (upstream.headers.get("content-type")?.includes("text/event-stream")) {
    responseHeaders.set("Cache-Control", "no-cache, no-transform");
    responseHeaders.set("X-Accel-Buffering", "no");
  }
  responseHeaders.set(
    "server-timing",
    [
      upstream.headers.get("server-timing"),
      `ask_body;dur=${duration(bodyReadMs)}`,
      `ask_upstream;dur=${duration(upstreamHeaderMs)}`,
      `ask_proxy;dur=${duration(nowMs() - startedAt)}`,
    ]
      .filter(Boolean)
      .join(", "),
  );

  console.info("[ask/proxy] upstream response", {
    method,
    path: `/api/ask/${path.join("/")}`,
    status: upstream.status,
    upstreamHeaderMs: Math.round(upstreamHeaderMs),
    contentType: upstream.headers.get("content-type"),
  });

  if (!upstream.body || NULL_BODY_STATUSES.has(upstream.status)) {
    abort.cleanup();
    await upstream.body?.cancel().catch(() => undefined);
    return new Response(null, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }
  return new Response(passThrough(upstream.body, abort.cleanup), {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
