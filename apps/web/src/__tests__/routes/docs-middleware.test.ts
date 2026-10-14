import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { tryToParsePath } from "next/dist/lib/try-to-parse-path";
import middleware, {
  config,
  handleDocsRequest,
  isProxiedPath,
} from "@@/src/middleware";
import {
  canonicalDocsPath,
  getDocsPathInfo,
  getMarkdownRequestSource,
} from "@/lib/docs-edge/paths";
import {
  DOCS_MARKDOWN_DISTINCT_ID,
  DOCS_MARKDOWN_EVENT,
  trackMarkdownRequest,
} from "@/lib/docs-edge/markdown-analytics";

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, "https://solana.com"), { headers });
}

function fakeEvent() {
  const waited: Promise<unknown>[] = [];
  return {
    waited,
    waitUntil: (promise: Promise<unknown>) => {
      waited.push(promise);
    },
  };
}

function matchesMiddleware(pathname: string) {
  return config.matcher.some((matcher) =>
    Boolean(getPathMatch(matcher, { strict: true })(pathname)),
  );
}

describe("docs path detection", () => {
  it("recognises Mintlify-served paths with and without a locale", () => {
    for (const path of [
      "/docs",
      "/docs.md",
      "/docs/core/accounts",
      "/fr/docs/core/accounts.md",
      "/learn/what-is-solana",
      "/ja/learn/what-is-solana",
      "/developers/cookbook",
      "/developers/cookbook/wallets/create-keypair.md",
      "/ko/developers/bootcamp/fullstack-apps",
      "/Docs/Core",
    ]) {
      expect(getDocsPathInfo(path), path).not.toBeNull();
    }
  });

  it("ignores apps/web pages and other proxied apps", () => {
    for (const path of [
      "/",
      "/learn",
      "/fr/learn",
      "/developers",
      "/developers/templates",
      "/developers/payments",
      "/docs-assets/x.svg",
      "/news",
      "/fr/news/x",
    ]) {
      expect(getDocsPathInfo(path), path).toBeNull();
    }
  });

  it("splits off the locale", () => {
    expect(getDocsPathInfo("/fr/docs/core")).toEqual({
      locale: "fr",
      rest: "/docs/core",
    });
    expect(getDocsPathInfo("/docs/core")).toEqual({
      locale: null,
      rest: "/docs/core",
    });
  });
});

describe("docs path normalisation", () => {
  it("lowercases, drops duplicate locales and the /en prefix in one hop", () => {
    expect(canonicalDocsPath("/Docs/Core/Accounts")).toBe(
      "/docs/core/accounts",
    );
    expect(canonicalDocsPath("/fr/docs/fr/core")).toBe("/fr/docs/core");
    expect(canonicalDocsPath("/fr/de/docs/core")).toBe("/fr/docs/core");
    expect(canonicalDocsPath("/en/docs/core")).toBe("/docs/core");
    expect(canonicalDocsPath("/EN/Docs/core.md")).toBe("/docs/core.md");
    expect(canonicalDocsPath("/en/fr/docs/core")).toBe("/docs/core");
  });

  it("leaves canonical paths alone", () => {
    expect(canonicalDocsPath("/docs/core/accounts")).toBeNull();
    expect(canonicalDocsPath("/fr/docs/core/accounts.md")).toBeNull();
  });

  it("redirects with 308 and keeps the query string", () => {
    const res = handleDocsRequest(
      request("/EN/Docs/Core?tab=rust"),
      fakeEvent(),
    );
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "https://solana.com/docs/core?tab=rust",
    );
  });

  it("redirects mixed-case .md twins to the lowercase path", () => {
    const res = handleDocsRequest(
      request("/FR/Docs/Core/Accounts.MD"),
      fakeEvent(),
    );
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "https://solana.com/fr/docs/core/accounts.md",
    );
  });

  it("passes canonical docs requests through to the Mintlify rewrite", () => {
    const res = handleDocsRequest(request("/docs/core/accounts"), fakeEvent());
    expect(res?.status).toBe(200);
    expect(res?.headers.get("x-middleware-next")).toBe("1");
  });

  it("returns null for non-docs paths", () => {
    expect(handleDocsRequest(request("/wallets"), fakeEvent())).toBeNull();
  });
});

describe("markdown request analytics", () => {
  const fetchMock = vi.fn(async () => new Response("ok"));

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("classifies .md and Accept: text/markdown requests", () => {
    expect(getMarkdownRequestSource("/docs/core.md", null)).toBe(
      "md-extension",
    );
    expect(getMarkdownRequestSource("/docs/core", "text/markdown")).toBe(
      "accept-header",
    );
    expect(
      getMarkdownRequestSource("/docs/core", "text/html,application/xhtml+xml"),
    ).toBeNull();
    expect(
      getMarkdownRequestSource("/docs/payments/llms.txt", "text/markdown"),
    ).toBeNull();
  });

  it("fires docs_markdown_requested for a .md request without blocking it", async () => {
    const event = fakeEvent();
    const res = handleDocsRequest(request("/fr/docs/core/accounts.md"), event);

    expect(res?.headers.get("x-middleware-next")).toBe("1");
    expect(event.waited).toHaveLength(1);
    await Promise.all(event.waited);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://us.i.posthog.com/capture/");
    expect(JSON.parse(String(init.body))).toEqual({
      api_key: "phc_test",
      event: DOCS_MARKDOWN_EVENT,
      properties: {
        distinct_id: DOCS_MARKDOWN_DISTINCT_ID,
        route: "/docs/core/accounts",
        source: "md-extension",
        locale: "fr",
        $current_url: "https://solana.com/docs/core/accounts",
        $process_person_profile: false,
      },
    });
  });

  it("fires for Accept: text/markdown", async () => {
    const event = fakeEvent();
    handleDocsRequest(
      request("/developers/cookbook/wallets/create-keypair", {
        accept: "text/markdown",
      }),
      event,
    );
    await Promise.all(event.waited);
    const body = JSON.parse(
      String(
        (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body,
      ),
    );
    expect(body.properties).toMatchObject({
      route: "/developers/cookbook/wallets/create-keypair",
      source: "accept-header",
    });
    expect(body.properties.locale).toBeUndefined();
  });

  it("does not fire for HTML page views or for non-canonical URLs", () => {
    const event = fakeEvent();
    handleDocsRequest(request("/docs/core"), event);
    handleDocsRequest(request("/Docs/Core.md"), event);
    expect(event.waited).toHaveLength(0);
  });

  it("is a no-op without a PostHog key and never throws", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    await trackMarkdownRequest({ route: "/docs", source: "md-extension" });
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(
      trackMarkdownRequest({ route: "/docs", source: "md-extension" }),
    ).resolves.toBeUndefined();
  });

  it("is wired into the default middleware export", async () => {
    const event = fakeEvent();
    const res = await middleware(
      request("/docs/core.md"),
      event as unknown as Parameters<typeof middleware>[1],
    );
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(event.waited).toHaveLength(1);
  });
});

describe("middleware matcher", () => {
  it("runs for docs paths, including .md twins", () => {
    for (const path of [
      "/docs",
      "/docs.md",
      "/docs/core/accounts.md",
      "/fr/docs/core/accounts.md",
      "/learn/what-is-solana.md",
      "/developers/cookbook.md",
      "/developers/bootcamp/fullstack-apps.md",
      "/docs/payments/llms.txt",
      "/Docs/Core",
      "/DOCS/core/accounts.md",
      "/FR/Docs/Core/Accounts.MD",
      "/Learn/What-Is-Solana.md",
      "/Developers/Cookbook/wallets/create-keypair.md",
    ]) {
      expect(matchesMiddleware(path), path).toBe(true);
    }
  });

  it("matches mixed-case .md twins with case-sensitive regexps too", () => {
    // Next runs middleware matchers as plain RegExps (case-sensitive).
    const regexps = config.matcher.map(
      (matcher) => new RegExp(tryToParsePath(matcher).regexStr ?? "(?!)"),
    );
    const matches = (pathname: string) =>
      regexps.some((regexp) => regexp.test(pathname));
    expect(matches("/DOCS/core/accounts.md")).toBe(true);
    expect(matches("/Fr/Learn/what-is-solana.md")).toBe(true);
    // Root markdown files in public/ stay out of middleware.
    expect(matches("/testing.md")).toBe(false);
    expect(matches("/payments.md")).toBe(false);
  });

  it("runs i18n routing for the apps/web landings", () => {
    expect(matchesMiddleware("/learn")).toBe(true);
    expect(matchesMiddleware("/developers")).toBe(true);
    expect(isProxiedPath("/learn")).toBe(false);
    expect(isProxiedPath("/developers")).toBe(false);
    expect(isProxiedPath("/learn/what-is-solana")).toBe(true);
  });

  it("skips Mintlify runtime and asset paths", () => {
    for (const path of [
      "/_mintlify/api/v1/e",
      "/mintlify-assets/_next/static/chunks/main.js",
      "/docs-assets/assets/docs/core/accounts.svg",
    ]) {
      expect(matchesMiddleware(path), path).toBe(false);
    }
  });
});
