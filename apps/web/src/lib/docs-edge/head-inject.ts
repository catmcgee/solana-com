/**
 * Docs head injection (see migration/PRE_PRODUCTION.md, "Docs head
 * injection").
 *
 * Mintlify inlines our theme CSS (apps/docs/styles/*.css) as <style>
 * elements deep in <body>, after the header markup. On its own the browser
 * first paints Mintlify's default two-row header, then reflows it into our
 * one-row header when theme.css arrives. A rewrite cannot change the body, so
 * src/proxy.ts serves docs HTML documents through `proxyDocsDocument`
 * instead of the beforeFiles rewrite:
 *
 * 1. fetch the same upstream URL the rewrite would (`resolveMintlifyUpstream`,
 *    over the rewrite table that next.config.ts inlines as
 *    DOCS_MINTLIFY_REWRITES);
 * 2. stream the body through `createHeadInjector`, which adds font preloads
 *    (and a `rel="expect"` render hint, see DOCS_HEADER_END_SELECTOR) right
 *    after `<head>` and a render-blocking /docs-head.css (generated
 *    from apps/docs/styles by packages/docs-tooling gen:docs-head) right
 *    before `</head>`, after Mintlify's own stylesheets, so the cascade
 *    order matches the final page;
 * 3. pass status, redirects (Location rewritten to our origin), cookies and
 *    cache headers through, and set our security headers.
 *
 * Everything else (assets, `.md`, `_mintlify` API calls, RSC and prefetch
 * fetches from Mintlify's client router, HEAD) keeps the static rewrite. Only
 * the solana.com proxy does this; the raw *.mintlify.site host serves the
 * page unchanged (the header then flashes there, as before).
 */
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { safeCompile } from "next/dist/shared/lib/router/utils/route-match-utils";
import { getSecurityHeaders } from "../security-headers";
import { DOCS_HEAD_CSS_VERSION } from "./docs-head-version";

/**
 * Brand fonts preloaded on every docs page. The same URLs as the /developers
 * landing (developers.css) and docs.json `fonts`, so one download serves
 * both.
 */
export const DOCS_FONT_PRELOADS = [
  "/fonts/ABCDiatype-Regular.woff2",
  "/fonts/ABCDiatype-Medium.woff2",
  "/fonts/ABCDiatype-Bold.woff2",
] as const;

export const DOCS_HEAD_CSS_PATH = "/docs-head.css";

/** Response header that marks an injected document (debugging aid). */
export const DOCS_HEAD_HEADER = "x-solana-docs-head";

/**
 * The first element after the header markup on every Mintlify docs page
 * (the sidebar <nav>, which follows `</header>`). With the CSS already cached
 * the browser may paint while it is still parsing the header, showing half
 * of it for a frame; `rel="expect"` holds the first paint until this element
 * is parsed (Chromium 124+; other browsers ignore it). Error pages have no
 * sidebar, so the hint is only sent with 200 responses: a missing target
 * would hold the paint until the whole document is parsed.
 */
export const DOCS_HEADER_END_SELECTOR = "#sidebar";

export function docsHeadSnippets(
  version: string = DOCS_HEAD_CSS_VERSION,
  opts: { expectHeader?: boolean } = {},
) {
  return {
    /** Goes right after `<head>`. */
    preloads:
      (opts.expectHeader
        ? `<link rel="expect" href="${DOCS_HEADER_END_SELECTOR}" blocking="render"/>`
        : "") +
      DOCS_FONT_PRELOADS.map(
        (href) =>
          `<link rel="preload" as="font" type="font/woff2" crossorigin="anonymous" href="${href}"/>`,
      ).join(""),
    /** Goes right before `</head>`. */
    stylesheet: `<link rel="stylesheet" href="${DOCS_HEAD_CSS_PATH}?v=${version}" data-solana-docs-head=""/>`,
  };
}

type HeaderSource = { get(name: string): string | null };

/**
 * True for a browser document navigation (including Speculation Rules
 * prefetch/prerender), false for RSC and router prefetch fetches, markdown,
 * subresources and non-GET requests.
 */
export function isDocumentNavigation(req: {
  method: string;
  headers: HeaderSource;
  nextUrl: { pathname: string; searchParams: URLSearchParams };
}) {
  if (req.method !== "GET") return false;
  const h = req.headers;
  if (
    h.get("rsc") !== null ||
    h.get("next-router-prefetch") !== null ||
    h.get("next-router-state-tree") !== null ||
    req.nextUrl.searchParams.has("_rsc")
  )
    return false;
  if (req.nextUrl.pathname.toLowerCase().endsWith(".md")) return false;
  const accept = h.get("accept") ?? "";
  if (accept.includes("text/markdown")) return false;
  const dest = h.get("sec-fetch-dest");
  if (dest) return dest === "document";
  return accept.includes("text/html");
}

export interface MintlifyRewrite {
  source: string;
  destination: string;
}

/** The table next.config.ts inlines; empty outside a Next build. */
export function loadMintlifyRewrites(
  raw: string | undefined = process.env.DOCS_MINTLIFY_REWRITES,
): MintlifyRewrite[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as MintlifyRewrite[];
  } catch {
    return [];
  }
}

const compiled = new WeakMap<
  MintlifyRewrite[],
  Array<{
    match: ReturnType<typeof getPathMatch>;
    origin: string;
    toPath: (params: object) => string;
  }>
>();

/**
 * The upstream URL the first matching beforeFiles rewrite would proxy to,
 * using Next's own matcher and compiler (path-to-regexp, strict,
 * case-insensitive), or null when no rule matches.
 */
export function resolveMintlifyUpstream(
  pathname: string,
  search: string,
  rewrites: MintlifyRewrite[],
): string | null {
  let rules = compiled.get(rewrites);
  if (!rules) {
    rules = rewrites.map(({ source, destination }) => {
      const url = new URL(destination);
      return {
        match: getPathMatch(source, {
          strict: true,
          removeUnnamedParams: true,
        }),
        origin: url.origin,
        toPath: safeCompile(url.pathname, { validate: false }),
      };
    });
    compiled.set(rewrites, rules);
  }
  for (const rule of rules) {
    const params = rule.match(pathname);
    if (params) return `${rule.origin}${rule.toPath(params)}${search}`;
  }
  return null;
}

/** An absolute Location on the Mintlify origin becomes one on ours. */
export function rewriteLocation(
  location: string,
  upstreamOrigin: string,
  publicOrigin: string,
) {
  let url: URL;
  try {
    url = new URL(location, `${upstreamOrigin}/`);
  } catch {
    return location;
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(location)) return location; // relative
  if (url.origin !== upstreamOrigin) return location;
  return `${publicOrigin}${url.pathname}${url.search}${url.hash}`;
}

/**
 * Where the injections go in a buffered document prefix, or null when the
 * prefix does not reach `</head>` yet. `</head>` inside a head <script> is
 * skipped. A document without `</head>` closes the head at `<body`.
 */
export function locateHead(
  html: string,
): { openEnd: number; closeStart: number } | null {
  const open = /<head(?:\s[^>]*)?>/i.exec(html);
  if (!open) return null;
  const openEnd = open.index + open[0].length;
  const token = /<script\b|<\/head\s*>|<body\b/gi;
  token.lastIndex = openEnd;
  for (;;) {
    const m = token.exec(html);
    if (!m) return null;
    if (m[0].toLowerCase() === "<script") {
      const close = html.toLowerCase().indexOf("</script", token.lastIndex);
      if (close < 0) return null;
      token.lastIndex = close + "</script".length;
      continue;
    }
    return { openEnd, closeStart: m.index };
  }
}

/** Give up (and pass the document through unchanged) past this much head. */
export const HEAD_SCAN_LIMIT = 512 * 1024;

/**
 * A streaming string transform that buffers only the document head, inserts
 * `preloads` after `<head>` and `stylesheet` before `</head>`, then passes
 * the rest through chunk by chunk.
 */
export function createHeadInjector(
  snippets: { preloads: string; stylesheet: string },
  limit = HEAD_SCAN_LIMIT,
) {
  let buffer = "";
  let done = false;
  return new TransformStream<string, string>({
    transform(chunk, controller) {
      if (done) {
        controller.enqueue(chunk);
        return;
      }
      buffer += chunk;
      const at = locateHead(buffer);
      if (at) {
        controller.enqueue(
          buffer.slice(0, at.openEnd) +
            snippets.preloads +
            buffer.slice(at.openEnd, at.closeStart) +
            snippets.stylesheet +
            buffer.slice(at.closeStart),
        );
        buffer = "";
        done = true;
      } else if (buffer.length > limit) {
        controller.enqueue(buffer);
        buffer = "";
        done = true;
      }
    },
    flush(controller) {
      if (buffer) controller.enqueue(buffer);
    },
  });
}

/** Request headers that must not reach Mintlify. */
const DROP_REQUEST = new Set([
  "host",
  "connection",
  "keep-alive",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "accept-encoding",
  // Mintlify sends no-store; never let a conditional request turn into a
  // 304 for a document we changed.
  "if-none-match",
  "if-modified-since",
  "forwarded",
  "x-forwarded-host",
]);
const DROP_REQUEST_PREFIX = [
  "x-middleware-",
  "x-vercel-",
  "x-invoke-",
  "x-now-",
  "proxy-",
];

/** Response headers that no longer describe our (decoded, edited) body. */
const DROP_RESPONSE = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "etag",
  "set-cookie", // re-added one by one below
  "x-matched-path",
]);
const DROP_RESPONSE_PREFIX = ["x-vercel-", "x-middleware-", "x-nextjs-"];

const dropped = (name: string, exact: Set<string>, prefixes: string[]) =>
  exact.has(name) || prefixes.some((p) => name.startsWith(p));

export function upstreamRequestHeaders(
  incoming: Headers,
  publicUrl: URL,
): Headers {
  const out = new Headers();
  incoming.forEach((value, key) => {
    if (!dropped(key.toLowerCase(), DROP_REQUEST, DROP_REQUEST_PREFIX))
      out.set(key, value);
  });
  out.set("accept-encoding", "gzip, br");
  out.set("x-forwarded-host", publicUrl.host);
  out.set("x-forwarded-proto", publicUrl.protocol.replace(":", ""));
  return out;
}

export function proxiedResponseHeaders(
  upstream: Response,
  opts: { upstreamOrigin: string; publicOrigin: string; injected: boolean },
  env: Record<string, string | undefined> = process.env,
): Headers {
  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!dropped(key.toLowerCase(), DROP_RESPONSE, DROP_RESPONSE_PREFIX))
      out.set(key, value);
  });
  for (const cookie of upstream.headers.getSetCookie?.() ?? [])
    out.append("set-cookie", cookie);
  const location = upstream.headers.get("location");
  if (location)
    out.set(
      "location",
      rewriteLocation(location, opts.upstreamOrigin, opts.publicOrigin),
    );
  // next.config.ts headers() for "/:path*", which the rewrite path gets.
  for (const { key, value } of getSecurityHeaders(env)) out.set(key, value);
  if (opts.injected) out.set(DOCS_HEAD_HEADER, DOCS_HEAD_CSS_VERSION);
  return out;
}

const isHtml = (res: Response) =>
  (res.headers.get("content-type") ?? "").toLowerCase().includes("text/html");

/**
 * Fetches a docs document from Mintlify and returns it with the head
 * injection. Returns null (the caller falls back to the static rewrite) when
 * no rewrite rule matches or the upstream fetch fails.
 */
export async function proxyDocsDocument(
  req: { url: string; headers: Headers; signal?: AbortSignal },
  opts: {
    rewrites?: MintlifyRewrite[];
    fetchImpl?: typeof fetch;
    env?: Record<string, string | undefined>;
  } = {},
): Promise<Response | null> {
  const publicUrl = new URL(req.url);
  const target = resolveMintlifyUpstream(
    publicUrl.pathname,
    publicUrl.search,
    opts.rewrites ?? loadMintlifyRewrites(),
  );
  if (!target) return null;
  const upstreamOrigin = new URL(target).origin;

  let upstream: Response;
  try {
    upstream = await (opts.fetchImpl ?? fetch)(target, {
      method: "GET",
      headers: upstreamRequestHeaders(req.headers, publicUrl),
      redirect: "manual",
      cache: "no-store",
      signal: req.signal,
    });
  } catch {
    return null;
  }

  const bodyless = [101, 204, 205, 304].includes(upstream.status);
  const inject = !bodyless && !!upstream.body && isHtml(upstream);
  const headers = proxiedResponseHeaders(
    upstream,
    { upstreamOrigin, publicOrigin: publicUrl.origin, injected: inject },
    opts.env,
  );
  const body = bodyless
    ? null
    : inject
      ? upstream
          .body!.pipeThrough(new TextDecoderStream())
          .pipeThrough(
            createHeadInjector(
              docsHeadSnippets(DOCS_HEAD_CSS_VERSION, {
                expectHeader: upstream.status === 200,
              }),
            ),
          )
          .pipeThrough(new TextEncoderStream())
      : upstream.body;
  return new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
