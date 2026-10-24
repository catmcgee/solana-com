import "server-only";

/**
 * Request helpers shared by the Ask AI proxy and its review mock. The
 * origin check and body cap are copies of the private helpers in
 * packages/ui-chrome/src/inkeep-proxy.ts.
 */

/** Largest request body accepted; a 4,000-character question is far below it. */
export const ASK_MAX_BODY_BYTES = 64 * 1024;

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
} as const;

/** Headers for a server-sent events response (as api/slot-time/stream). */
export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

const encoder = new TextEncoder();

/** One server-sent event in the format the client parses (lib/docs/ask/sse.ts). */
export function sseEvent(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** JSON error in the shape the client maps: `{ error: "<code>", message? }`. */
export function askError(
  status: number,
  error: string,
  message?: string,
  headers?: HeadersInit,
): Response {
  return Response.json(
    { error, ...(message ? { message } : {}) },
    { status, headers: { ...NO_STORE_HEADERS, ...headers } },
  );
}

/**
 * True for a browser request from this site. Same-origin `fetch` POSTs
 * carry `Origin`; GETs may not, so `allowRefererFallback` accepts a
 * same-origin `Referer` instead.
 */
export function isSameOriginBrowserRequest(
  request: Request,
  options: { allowRefererFallback: boolean },
): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;

  const origin = request.headers.get("origin");
  try {
    const requestUrl = new URL(request.url);
    if (origin) return new URL(origin).origin === requestUrl.origin;
    if (!options.allowRefererFallback) return false;
    const referer = request.headers.get("referer");
    return Boolean(referer && new URL(referer).origin === requestUrl.origin);
  } catch {
    return false;
  }
}

/**
 * Reads a JSON body of at most ASK_MAX_BODY_BYTES. Returns the parsed value
 * and the raw text (forwarded as-is), or a 400/413 response.
 */
export async function readJsonBody(
  request: Request,
): Promise<
  { ok: true; value: unknown; text: string } | { ok: false; response: Response }
> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > ASK_MAX_BODY_BYTES) {
    return {
      ok: false,
      response: askError(413, "body_too_large", "The request is too large."),
    };
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return {
      ok: false,
      response: askError(
        400,
        "invalid_request",
        "The request body is required.",
      ),
    };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > ASK_MAX_BODY_BYTES) {
        await reader.cancel();
        return {
          ok: false,
          response: askError(
            413,
            "body_too_large",
            "The request is too large.",
          ),
        };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder().decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown, text };
  } catch {
    return {
      ok: false,
      response: askError(
        400,
        "invalid_request",
        "The request body must be valid JSON.",
      ),
    };
  }
}
