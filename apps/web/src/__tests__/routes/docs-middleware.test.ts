import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { tryToParsePath } from "next/dist/lib/try-to-parse-path";
import middleware, {
  config,
  handleDocsRequest,
  isDeveloperDocsPath,
  isProxiedPath,
} from "@@/src/proxy";
import {
  canonicalDocsPath,
  getDocsPathInfo,
  isMarkdownRequest,
} from "@/lib/docs-edge/paths";

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, "https://solana.com"), { headers });
}

function matchesMiddleware(pathname: string) {
  return config.matcher.some((matcher) =>
    Boolean(getPathMatch(matcher, { strict: true })(pathname)),
  );
}

describe("docs path detection", () => {
  it("recognises docs paths with and without a locale", () => {
    for (const path of [
      "/developers/docs",
      "/developers/docs.md",
      "/developers/docs/core/accounts",
      "/fr/developers/docs/core/accounts.md",
      "/Developers/Docs/Core",
      // The old prefix (redirected before middleware; kept for mixed case).
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
      "/developers/docsy",
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
    expect(canonicalDocsPath("/Developers/Docs/Core")).toBe(
      "/developers/docs/core",
    );
    expect(canonicalDocsPath("/en/developers/docs/core")).toBe(
      "/developers/docs/core",
    );
    expect(canonicalDocsPath("/fr/developers/docs/fr/core")).toBe(
      "/fr/developers/docs/core",
    );
  });

  it("leaves canonical paths alone", () => {
    expect(canonicalDocsPath("/docs/core/accounts")).toBeNull();
    expect(canonicalDocsPath("/fr/docs/core/accounts.md")).toBeNull();
    expect(canonicalDocsPath("/developers/docs/core/accounts")).toBeNull();
    expect(
      canonicalDocsPath("/ja/developers/docs/core/accounts.md"),
    ).toBeNull();
  });

  it("redirects with 308 and keeps the query string", () => {
    const res = handleDocsRequest(request("/EN/Docs/Core?tab=rust"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "https://solana.com/docs/core?tab=rust",
    );
  });

  it("redirects mixed-case .md twins to the lowercase path", () => {
    const res = handleDocsRequest(request("/FR/Docs/Core/Accounts.MD"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe(
      "https://solana.com/fr/docs/core/accounts.md",
    );
  });

  it("leaves canonical docs pages to the locale routing", () => {
    for (const path of [
      "/developers/docs/core/accounts",
      "/docs/core/accounts",
    ]) {
      expect(handleDocsRequest(request(path)), path).toBeNull();
    }
  });

  it("lets per-section llms.txt reach its route", () => {
    const res = handleDocsRequest(
      request("/developers/docs/payments/llms.txt"),
    );
    expect(res?.headers.get("x-middleware-next")).toBe("1");
  });

  it("returns null for non-docs paths", () => {
    expect(handleDocsRequest(request("/wallets"))).toBeNull();
  });
});

describe("markdown requests", () => {
  it("recognises .md and Accept: text/markdown requests", () => {
    expect(isMarkdownRequest("/docs/core.md", null)).toBe(true);
    expect(isMarkdownRequest("/docs/core", "text/markdown")).toBe(true);
    expect(
      isMarkdownRequest("/docs/core", "text/html,application/xhtml+xml"),
    ).toBe(false);
    expect(isMarkdownRequest("/docs/payments/llms.txt", "text/markdown")).toBe(
      false,
    );
  });

  it("rewrites a .md request to the Markdown route", () => {
    const res = handleDocsRequest(request("/fr/docs/core/accounts.md"));
    expect(res?.headers.get("x-middleware-rewrite")).toBe(
      "https://solana.com/api/markdown/fr/docs/core/accounts",
    );
  });

  it("rewrites Accept: text/markdown to the Markdown route", () => {
    const res = handleDocsRequest(
      request("/developers/cookbook/wallets/create-keypair", {
        accept: "text/markdown",
      }),
    );
    expect(res?.headers.get("x-middleware-rewrite")).toBe(
      "https://solana.com/api/markdown/developers/cookbook/wallets/create-keypair",
    );
  });

  it("is wired into the default middleware export", async () => {
    const res = await middleware(request("/docs/core.md"));
    expect(res.headers.get("x-middleware-rewrite")).toBe(
      "https://solana.com/api/markdown/docs/core",
    );
  });
});

describe("middleware matcher", () => {
  it("runs for docs paths, including .md twins", () => {
    for (const path of [
      "/developers/docs",
      "/developers/docs.md",
      "/developers/docs/core/accounts",
      "/developers/docs/core/accounts.md",
      "/fr/developers/docs/core/accounts.md",
      "/developers/docs/payments/llms.txt",
      "/Developers/Docs/core/accounts.md",
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
    // The docs are this app's pages now, with locale routing.
    expect(isProxiedPath("/learn/what-is-solana")).toBe(false);
    expect(isProxiedPath("/developers/docs/core")).toBe(false);
  });

  it("skips docs assets, MCP and other files", () => {
    for (const path of [
      "/docs-assets/assets/docs/core/accounts.svg",
      "/docs-scripts/run-examples.js",
      "/mcp",
      "/llms.txt",
    ]) {
      expect(matchesMiddleware(path), path).toBe(false);
    }
  });
});

describe("docs locale cookie", () => {
  const spanish = { cookie: "SOLANA_LOCALE=es", "accept-language": "es" };
  const run = (path: string, headers: Record<string, string> = {}) =>
    middleware(request(path, headers));

  it("serves English docs URLs in English despite a Spanish cookie", async () => {
    for (const path of ["/developers/docs", "/developers/docs/core/accounts"]) {
      const res = await run(path, spanish);
      expect(res.headers.get("location"), path).toBeNull();
      expect(res.headers.get("x-middleware-rewrite"), path).toBe(
        `https://solana.com/en${path}`,
      );
    }
  });

  it("keeps translated docs URLs translated", async () => {
    const res = await run("/es/developers/docs/core", spanish);
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    // Visiting a translated page still records the choice for the site.
    const fresh = await run("/es/developers/docs/core");
    expect(fresh.headers.get("set-cookie")).toContain("SOLANA_LOCALE=es");
  });

  it("still follows the cookie on the rest of solana.com", async () => {
    const res = await run("/developers", spanish);
    expect(res.headers.get("location")).toBe(
      "https://solana.com/es/developers",
    );
  });

  it("recognises only /developers/docs paths", () => {
    expect(isDeveloperDocsPath("/developers/docs")).toBe(true);
    expect(isDeveloperDocsPath("/es/developers/docs/core")).toBe(true);
    expect(isDeveloperDocsPath("/developers/docsx")).toBe(false);
    expect(isDeveloperDocsPath("/developers/cookbook")).toBe(false);
    expect(isDeveloperDocsPath("/developers")).toBe(false);
  });
});

describe("docs locale alternates", () => {
  const run = (path: string) => middleware(request(path));

  it("does not advertise Greek on docs pages, which have no Greek", async () => {
    for (const path of [
      "/developers/docs",
      "/es/developers/docs/core",
      "/developers/cookbook",
      "/learn/what-is-a-wallet",
    ]) {
      const link = (await run(path)).headers.get("link") ?? "";
      expect(link, path).toContain('hreflang="es"');
      expect(link, path).toContain('rel="llms-txt"');
      expect(link, path).not.toContain('hreflang="el"');
    }
  });

  it("keeps Greek on the rest of solana.com", async () => {
    const link = (await run("/developers")).headers.get("link") ?? "";
    expect(link).toContain('hreflang="el"');
  });
});
