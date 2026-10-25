import "server-only";

import { ASK_MAX_MESSAGE_CHARS } from "../config";
import { isRecord } from "../protocol";
import {
  NO_STORE_HEADERS,
  askError,
  isSameOriginBrowserRequest,
  readJsonBody,
} from "./request";

/**
 * Forwards /api/ask/* to the docs agent, adding the shared secret the agent
 * requires. Ported from Bri's apps/docs/src/lib/ask-agent-proxy.ts,
 * hardened with the Inkeep proxy's checks: same-origin browser requests
 * only, a 64 KB body cap, a 30 s limit for the agent's response headers
 * (the stream itself runs until it ends or the reader leaves), and a fixed
 * set of paths.
 *
 * Env, read per request (the agent runbook's names first, ours as
 * fallback): `ASK_API_URL` or `ASK_AGENT_URL`, and `ASK_PROXY_SECRET` or
 * `ASK_SOLANA_PROXY_SECRET`. Without a URL and a secret every request gets
 * 503 `ask_not_configured`; there is no default agent URL.
 *
 * What the agent gets:
 * - `X-Ask-Client-IP`, the visitor's IP, which the agent's rate limits key
 *   on (`ASK_CLIENT_IP_HEADER=x-ask-client-ip`). Not X-Forwarded-For, geo
 *   headers or the user agent: behind this proxy they describe Vercel, and
 *   the agent keeps no visitor data it doesn't need.
 * - `Accept` that leads with JSON, so Laravel answers a failed validation
 *   with 422 JSON rather than a redirect to its home page.
 * - Chat bodies without the client's `history`, with the attached page's
 *   title after the question (see agentChatBody).
 *
 * An agent 403 means a wrong secret, not a visitor's problem: it is logged
 * and answered as 502 `ask_misconfigured`.
 */

const PROXY_SECRET_HEADER = "X-Ask-Proxy-Secret";
const CLIENT_IP_HEADER = "X-Ask-Client-IP";
const UPSTREAM_HEADERS_TIMEOUT_MS = 30_000;
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

const REQUEST_HEADER_ALLOWLIST = [
  "accept-language",
  "content-type",
  "x-ask-client-capabilities",
  // GET runs/:id authenticates with the session token in a header.
  "x-ask-session",
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

/**
 * The agent's bring-up check for per-visitor rate limits: GET
 * diagnostics/client-ip reports what it sees for X-Ask-Client-IP
 * (`per_visitor_bucketing: true`). Only through this proxy, and never on
 * production; the agent answers 404 unless its diagnostics are enabled.
 */
function isDiagnosticsPath(path: string[]): boolean {
  return (
    path.length === 2 &&
    path[0] === "diagnostics" &&
    path[1] === "client-ip" &&
    process.env.VERCEL_ENV !== "production"
  );
}

const IP_ADDRESS = /^[0-9a-f.:]{2,45}$/i;

/**
 * The visitor's IP: on Vercel, `x-vercel-forwarded-for`, `x-real-ip` and
 * `x-forwarded-for` are set at the edge (a client can't spoof them), and
 * the first entry is the client.
 */
export function visitorIp(request: Request): string | null {
  for (const name of [
    "x-vercel-forwarded-for",
    "x-real-ip",
    "x-forwarded-for",
  ]) {
    const first = request.headers.get(name)?.split(",")[0]?.trim();
    if (first && IP_ADDRESS.test(first)) return first;
  }
  return null;
}

/**
 * The chat body as the agent takes it: without `history` (the agent keeps
 * its own conversation memory) and, until the agent reads `page_url` /
 * `page_title` itself, with the attached page's title on a line after the
 * question. The agent's workflow router runs its patterns over the whole
 * message (a match can't span lines) and answers a match with a canned
 * template: the old "Question about the docs page …" prefix, with its URL,
 * turned any question asked on Create a Token or CPI into that page's
 * template. A title can still match on its own line; a URL never goes in.
 * Skipped when the message would pass the agent's 4,000 characters.
 */
export function agentChatBody(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const { history: _history, ...body } = value;
  const title =
    typeof body.page_title === "string"
      ? body.page_title.replace(/\s+/g, " ").trim().slice(0, 200)
      : "";
  if (title && typeof body.message === "string") {
    const message = `${body.message}\n\n(Asked on the docs page “${title}”.)`;
    // The agent counts code points (mb_strlen).
    if ([...message].length <= ASK_MAX_MESSAGE_CHARS) body.message = message;
  }
  return body;
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

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400 && status !== 304;
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
  const baseUrl = (
    process.env.ASK_API_URL?.trim() || process.env.ASK_AGENT_URL?.trim()
  )?.replace(/\/+$/, "");
  const secret =
    process.env.ASK_PROXY_SECRET?.trim() ||
    process.env.ASK_SOLANA_PROXY_SECRET?.trim();
  if (!baseUrl || !secret) {
    return askError(503, "ask_not_configured", "Ask AI is not configured.");
  }

  const method =
    askRouteMethod(path) ?? (isDiagnosticsPath(path) ? "GET" : null);
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
    body =
      path[0] === "chat" && isRecord(read.value)
        ? JSON.stringify(agentChatBody(read.value))
        : read.text;
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
  // Laravel picks JSON errors only when JSON is the first type accepted;
  // the agent streams whenever the body doesn't say `stream: false`.
  headers.set(
    "accept",
    path[0] === "chat"
      ? "application/json, text/event-stream"
      : "application/json",
  );
  headers.set(PROXY_SECRET_HEADER, secret);
  const ip = visitorIp(request);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);

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

  if (upstream.status === 403 || isRedirect(upstream.status)) {
    abort.cleanup();
    await upstream.body?.cancel().catch(() => undefined);
    // Neither is the visitor's doing, and a new session won't help.
    console.error(
      upstream.status === 403
        ? "[ask/proxy] agent rejected the proxy secret"
        : "[ask/proxy] agent redirected instead of answering",
      { path: `/api/ask/${path.join("/")}`, status: upstream.status },
    );
    return askError(502, "ask_misconfigured", "Ask AI is unavailable.");
  }

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
