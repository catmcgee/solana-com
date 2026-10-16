import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MINTLIFY_ORIGIN } from "@@/apps-urls";
import { mintlifyRewrites } from "@@/rewrites-redirects";
import middleware from "@@/src/middleware";
import {
  DOCS_FONT_PRELOADS,
  DOCS_HEAD_HEADER,
  createHeadInjector,
  docsHeadSnippets,
  isDocumentNavigation,
  locateHead,
  proxyDocsDocument,
  resolveMintlifyUpstream,
  rewriteLocation,
  upstreamRequestHeaders,
} from "@/lib/docs-edge/head-inject";
import { DOCS_HEAD_CSS_VERSION } from "@/lib/docs-edge/docs-head-version";
import { resolveRewrite } from "./helpers/next-routing";

const M = MINTLIFY_ORIGIN;
const webRoot = path.resolve(__dirname, "../../..");
const TABLE = mintlifyRewrites.map(({ source, destination }) => ({
  source,
  destination,
}));

const PAGE =
  '<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/>' +
  '<link rel="stylesheet" href="/mintlify-assets/a.css"/>' +
  "<script>var s = '</head>';</script>" +
  '<style>:root{--x:1}</style></head><body><nav id="navbar">x</nav>' +
  "<style>/* theme.css */</style></body></html>";

const SNIPPETS = docsHeadSnippets("v1");

function navRequest(
  pathname: string,
  headers: Record<string, string> = {
    accept: "text/html,application/xhtml+xml",
    "sec-fetch-dest": "document",
  },
) {
  return new NextRequest(new URL(pathname, "https://solana.com"), { headers });
}

async function pipeChunks(chunks: string[]) {
  const stream = new ReadableStream<string>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  }).pipeThrough(createHeadInjector(SNIPPETS));
  let out = "";
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return out;
    out += value;
  }
}

describe("docs head snippets", () => {
  it("preloads the same font URLs as /developers and docs.json", () => {
    const developersCss = fs.readFileSync(
      path.join(webRoot, "src/app/[locale]/developers/developers.css"),
      "utf8",
    );
    const docsJson = fs.readFileSync(
      path.join(webRoot, "../docs/docs.json"),
      "utf8",
    );
    for (const href of DOCS_FONT_PRELOADS) {
      expect(developersCss).toContain(`url("${href}")`);
      expect(fs.existsSync(path.join(webRoot, "../docs", href))).toBe(true);
    }
    // Mintlify turns `fonts/x` into the root URL `/fonts/x`.
    expect(docsJson).toContain(`"source": "${DOCS_FONT_PRELOADS[0].slice(1)}"`);
    expect(docsJson).toContain(`"source": "${DOCS_FONT_PRELOADS[1].slice(1)}"`);
  });

  it("links the generated stylesheet with its content hash", () => {
    const css = fs.readFileSync(path.join(webRoot, "public/docs-head.css"));
    expect(createHash("sha256").update(css).digest("hex").slice(0, 12)).toBe(
      DOCS_HEAD_CSS_VERSION,
    );
    expect(docsHeadSnippets().stylesheet).toContain(
      `href="/docs-head.css?v=${DOCS_HEAD_CSS_VERSION}"`,
    );
  });
});

describe("head injection", () => {
  it("puts preloads right after <head> and the stylesheet right before </head>", async () => {
    const out = await pipeChunks([PAGE]);
    expect(
      out.startsWith(
        `<!DOCTYPE html><html lang="en"><head>${SNIPPETS.preloads}<meta`,
      ),
    ).toBe(true);
    // After Mintlify's own stylesheet and head styles, so the cascade order
    // matches the final page; not inside the script's "</head>" string.
    expect(out).toContain(
      `<style>:root{--x:1}</style>${SNIPPETS.stylesheet}</head><body>`,
    );
    expect(out).toContain("var s = '</head>';");
    expect(out.split(SNIPPETS.stylesheet)).toHaveLength(2);
    expect(
      out.replace(SNIPPETS.preloads, "").replace(SNIPPETS.stylesheet, ""),
    ).toBe(PAGE);
  });

  it("handles every chunk boundary", async () => {
    const expected = await pipeChunks([PAGE]);
    for (const size of [1, 2, 3, 5, 7, 13]) {
      const chunks: string[] = [];
      for (let i = 0; i < PAGE.length; i += size)
        chunks.push(PAGE.slice(i, i + size));
      expect(await pipeChunks(chunks), `chunk size ${size}`).toBe(expected);
    }
  });

  it("streams the body after the head without buffering it", async () => {
    const enqueued: string[] = [];
    const injector = createHeadInjector(SNIPPETS);
    const writer = injector.writable.getWriter();
    const reader = injector.readable.getReader();
    void writer.write("<html><head></head><body>");
    enqueued.push((await reader.read()).value!);
    void writer.write("<p>more</p>");
    enqueued.push((await reader.read()).value!);
    expect(enqueued[1]).toBe("<p>more</p>");
  });

  it("leaves documents without a head alone", async () => {
    expect(await pipeChunks(["<p>no head</p>"])).toBe("<p>no head</p>");
    expect(locateHead("<html><head><title>x")).toBeNull();
    expect(locateHead("<html><header></header>")).toBeNull();
    const big = `<html><head>${"x".repeat(600 * 1024)}`;
    expect(await pipeChunks([big])).toBe(big);
  });

  it("closes the head at <body> when </head> is missing", () => {
    expect(locateHead("<html><head><title>t</title><body>")).toEqual({
      openEnd: 12,
      closeStart: 28,
    });
  });
});

describe("document navigation detection", () => {
  it("accepts document navigations and speculative prerenders", () => {
    expect(isDocumentNavigation(navRequest("/developers/docs"))).toBe(true);
    expect(
      isDocumentNavigation(
        navRequest("/developers/docs", {
          accept: "text/html",
          "sec-fetch-dest": "document",
          "sec-purpose": "prefetch;prerender",
        }),
      ),
    ).toBe(true);
    // No Fetch Metadata (curl, old clients): fall back to Accept.
    expect(
      isDocumentNavigation(
        navRequest("/developers/docs", { accept: "text/html" }),
      ),
    ).toBe(true);
  });

  it("rejects RSC, router prefetches, markdown and subresources", () => {
    const html = { accept: "text/html", "sec-fetch-dest": "document" };
    for (const [p, h] of [
      ["/developers/docs", { ...html, rsc: "1" }],
      ["/developers/docs", { ...html, "next-router-prefetch": "1" }],
      ["/developers/docs?_rsc=abc", html],
      ["/developers/docs.md", html],
      [
        "/developers/docs",
        { accept: "text/markdown", "sec-fetch-dest": "document" },
      ],
      ["/developers/docs", { accept: "*/*", "sec-fetch-dest": "empty" }],
      ["/developers/docs", { accept: "*/*" }],
    ] as const) {
      expect(
        isDocumentNavigation(navRequest(p, h)),
        `${p} ${JSON.stringify(h)}`,
      ).toBe(false);
    }
    const head = new NextRequest(
      new URL("https://solana.com/developers/docs"),
      {
        method: "HEAD",
        headers: html,
      },
    );
    expect(isDocumentNavigation(head)).toBe(false);
  });
});

describe("upstream URL", () => {
  it("matches the beforeFiles rewrite for every kind of docs page", () => {
    for (const p of [
      "/developers/docs",
      "/developers/docs/payments",
      "/developers/docs/core/accounts",
      "/developers/docs/tools",
      "/ja/developers/docs",
      "/ja/developers/docs/tools",
      "/fr/developers/docs/core/accounts",
      "/learn/what-is-solana",
      "/zh/learn/what-is-solana",
      "/developers/cookbook",
      "/developers/cookbook/wallets/create-keypair",
      "/ko/developers/cookbook/wallets/create-keypair",
      "/developers/bootcamp",
      "/ko/developers/bootcamp/fullstack-apps",
    ]) {
      const rewrite = resolveRewrite(p);
      expect(rewrite.kind, p).toBe("rewrite");
      expect(resolveMintlifyUpstream(p, "", TABLE), p).toBe(
        rewrite.kind === "rewrite" ? rewrite.destination : null,
      );
    }
    expect(resolveMintlifyUpstream("/developers/docs/tools", "", TABLE)).toBe(
      `${M}/developers/docs/tools/index`,
    );
    expect(
      resolveMintlifyUpstream("/ko/developers/cookbook/x", "?a=1", TABLE),
    ).toBe(`${M}/developers/cookbook/x?a=1`);
  });

  it("returns null for paths the Mintlify rewrites do not cover", () => {
    expect(
      resolveMintlifyUpstream("/developers/docs/payments/llms.txt", "", TABLE),
    ).toBeNull();
    expect(resolveMintlifyUpstream("/wallets", "", TABLE)).toBeNull();
    expect(resolveMintlifyUpstream("/developers/docs", "", [])).toBeNull();
  });
});

describe("redirect Location", () => {
  it("moves Mintlify-origin redirects onto our origin", () => {
    expect(
      rewriteLocation(
        `${M}/developers/docs/payments/x?y=1#z`,
        M,
        "https://solana.com",
      ),
    ).toBe("https://solana.com/developers/docs/payments/x?y=1#z");
  });

  it("keeps relative and third-party Locations", () => {
    expect(rewriteLocation("/developers/docs/x", M, "https://solana.com")).toBe(
      "/developers/docs/x",
    );
    expect(
      rewriteLocation("https://github.com/solana", M, "https://solana.com"),
    ).toBe("https://github.com/solana");
  });
});

describe("proxyDocsDocument", () => {
  const html = { accept: "text/html", "sec-fetch-dest": "document" };

  function upstream(body: string | null, init: ResponseInit) {
    return vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(body, init),
    );
  }

  it("injects into HTML and fixes up the headers", async () => {
    const headers = new Headers({
      "content-type": "text/html; charset=utf-8",
      "content-encoding": "br",
      "content-length": "123",
      etag: 'W/"abc"',
      "cache-control": "no-store",
      vary: "rsc, accept-encoding",
      "x-frame-options": "DENY",
      "x-vercel-cache": "HIT",
    });
    headers.append("set-cookie", "a=1; Path=/");
    headers.append("set-cookie", "b=2; Path=/");
    const fetchImpl = upstream(PAGE, { status: 200, headers });
    const res = await proxyDocsDocument(
      navRequest("/ja/developers/docs/core?x=1", {
        ...html,
        cookie: "c=3",
        host: "solana.com",
        "accept-encoding": "zstd",
        "x-vercel-id": "abc",
      }),
      { rewrites: TABLE, fetchImpl, env: { VERCEL_ENV: "preview" } },
    );
    expect(res).not.toBeNull();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${M}/ja/developers/docs/core?x=1`);
    expect(init?.redirect).toBe("manual");
    const sent = new Headers(init?.headers);
    expect(sent.get("host")).toBeNull();
    expect(sent.get("x-vercel-id")).toBeNull();
    expect(sent.get("cookie")).toBe("c=3");
    expect(sent.get("accept-encoding")).toBe("gzip, br");
    expect(sent.get("x-forwarded-host")).toBe("solana.com");

    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-encoding")).toBeNull();
    expect(res!.headers.get("content-length")).toBeNull();
    expect(res!.headers.get("etag")).toBeNull();
    expect(res!.headers.get("x-vercel-cache")).toBeNull();
    expect(res!.headers.get("cache-control")).toBe("no-store");
    expect(res!.headers.get("vary")).toBe("rsc, accept-encoding");
    expect(res!.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"]);
    expect(res!.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(res!.headers.get("content-security-policy")).toBe(
      "frame-ancestors 'self'",
    );
    expect(res!.headers.get("x-robots-tag")).toBe("noindex");
    expect(res!.headers.get(DOCS_HEAD_HEADER)).toBe(DOCS_HEAD_CSS_VERSION);
    const text = await res!.text();
    const snippets = docsHeadSnippets(DOCS_HEAD_CSS_VERSION, {
      expectHeader: true,
    });
    expect(text).toContain(`<head>${snippets.preloads}`);
    expect(text).toContain(`${snippets.stylesheet}</head>`);
    expect(text).toContain(
      '<head><link rel="expect" href="#sidebar" blocking="render"/>',
    );
  });

  it("passes non-HTML bodies through untouched", async () => {
    const body = '{"ok":true}';
    const res = await proxyDocsDocument(navRequest("/developers/docs", html), {
      rewrites: TABLE,
      fetchImpl: upstream(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      env: {},
    });
    expect(await res!.text()).toBe(body);
    expect(res!.headers.get(DOCS_HEAD_HEADER)).toBeNull();
    expect(res!.headers.get("x-robots-tag")).toBeNull();
  });

  it("passes redirects through with the Location on our origin", async () => {
    for (const [location, expected] of [
      [
        `${M}/developers/docs/payments`,
        "https://solana.com/developers/docs/payments",
      ],
      ["/developers/docs/payments", "/developers/docs/payments"],
    ]) {
      const res = await proxyDocsDocument(
        navRequest("/developers/docs/pay", html),
        {
          rewrites: TABLE,
          fetchImpl: upstream(null, { status: 307, headers: { location } }),
          env: {},
        },
      );
      expect(res!.status).toBe(307);
      expect(res!.headers.get("location")).toBe(expected);
    }
  });

  it("keeps the status of HTML error pages and still injects", async () => {
    const res = await proxyDocsDocument(
      navRequest("/developers/docs/nope", html),
      {
        rewrites: TABLE,
        fetchImpl: upstream(PAGE, {
          status: 404,
          headers: { "content-type": "text/html" },
        }),
        env: {},
      },
    );
    expect(res!.status).toBe(404);
    const text = await res!.text();
    expect(text).toContain("/docs-head.css?v=");
    // No sidebar on error pages: the render hint would hold the paint.
    expect(text).not.toContain('rel="expect"');
  });

  it("returns null (static rewrite) when the fetch fails or nothing matches", async () => {
    const failing = vi.fn(async () => {
      throw new Error("down");
    });
    expect(
      await proxyDocsDocument(navRequest("/developers/docs", html), {
        rewrites: TABLE,
        fetchImpl: failing,
      }),
    ).toBeNull();
    expect(
      await proxyDocsDocument(navRequest("/wallets", html), {
        rewrites: TABLE,
        fetchImpl: failing,
      }),
    ).toBeNull();
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it("drops conditional request headers", () => {
    const sent = upstreamRequestHeaders(
      new Headers({ "if-none-match": 'W/"x"', "if-modified-since": "x" }),
      new URL("https://solana.com/developers/docs"),
    );
    expect(sent.get("if-none-match")).toBeNull();
    expect(sent.get("if-modified-since")).toBeNull();
  });
});

describe("middleware", () => {
  const fetchMock = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(PAGE, { headers: { "content-type": "text/html" } }),
  );
  const event = { waitUntil: () => {} } as never;

  beforeEach(() => {
    vi.stubEnv("DOCS_MINTLIFY_REWRITES", JSON.stringify(TABLE));
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("serves docs document navigations with the injection", async () => {
    const res = await middleware(
      navRequest("/developers/docs/payments"),
      event,
    );
    expect(res.headers.get(DOCS_HEAD_HEADER)).toBe(DOCS_HEAD_CSS_VERSION);
    expect(fetchMock.mock.calls[0]![0]).toBe(`${M}/developers/docs/payments`);
    expect(await res.text()).toContain("/docs-head.css?v=");
  });

  it("keeps the static rewrite for everything else", async () => {
    for (const req of [
      navRequest("/developers/docs/payments", {
        accept: "*/*",
        rsc: "1",
        "sec-fetch-dest": "empty",
      }),
      navRequest("/developers/docs/payments.md"),
      navRequest("/developers/docs/payments", {
        accept: "*/*",
        "sec-fetch-dest": "script",
      }),
    ]) {
      const res = await middleware(req, event);
      expect(res.headers.get("x-middleware-next")).toBe("1");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still 308s non-canonical docs paths first", async () => {
    const res = await middleware(navRequest("/EN/Developers/Docs"), event);
    expect(res.status).toBe(308);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
