import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { templatesAppUrl } from "@@/apps-urls";
import rewritesAndRedirects from "@@/rewrites-redirects";
import { findRepoRoot } from "@/lib/docs-edge/repo-root";
import { MINTLIFY_LOCALES as DOCS_LOCALES } from "@/lib/docs-edge/paths";
import {
  resolve,
  resolveRedirect,
  resolveRewrite,
} from "./helpers/next-routing";

const repoRoot = findRepoRoot()!;
const docsRoot = path.join(repoRoot, "apps/docs");

/**
 * True when `pathname` is a docs page this app renders (the Fumadocs routes
 * under src/app/[locale]/{developers/{docs,cookbook},learn}): its content
 * file exists in apps/docs, in the locale or (untranslated pages and the
 * English-only cookbook) in English. `.md` twins and `/index` paths too.
 */
function docsPageExists(pathname: string): boolean {
  let p = pathname
    .split(/[?#]/)[0]
    .replace(/\.md$/, "")
    .replace(/\/index$/, "");
  const segments = p.split("/").filter(Boolean);
  const locale = DOCS_LOCALES.includes(segments[0] ?? "") ? segments[0] : null;
  const rest = locale ? segments.slice(1) : segments;
  const isDocs =
    (rest[0] === "developers" &&
      ["docs", "cookbook"].includes(rest[1] ?? "")) ||
    (rest[0] === "learn" && rest.length > 1);
  if (!isDocs) return false;
  p = rest.join("/");
  const exists = (base: string) =>
    [`${base}.mdx`, path.join(base, "index.mdx")].some((f) => fs.existsSync(f));
  return (
    (locale !== null && exists(path.join(docsRoot, locale, p))) ||
    exists(path.join(docsRoot, p))
  );
}

function isDocsPath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  const rest = DOCS_LOCALES.includes(segments[0] ?? "")
    ? segments.slice(1)
    : segments;
  return (
    (rest[0] === "developers" &&
      ["docs", "cookbook"].includes(rest[1] ?? "")) ||
    rest[0] === "learn"
  );
}

/** Served by this app's docs routes: no rewrite or redirect, a real page. */
function expectDocsPage(pathname: string) {
  expect(resolve(pathname)).toEqual({ kind: "none" });
  expect(docsPageExists(pathname)).toBe(true);
}

function expectRedirect(
  pathname: string,
  destination: string,
  permanent = true,
) {
  expect(resolve(pathname)).toMatchObject({
    kind: "redirect",
    destination,
    permanent,
  });
}

function expectAppWebRoute(pathname: string) {
  expect(resolve(pathname)).toEqual({ kind: "none" });
}

describe("No docs proxy", () => {
  it("rewrites nothing to Mintlify any more", () => {
    const rewrites = [
      ...rewritesAndRedirects.rewrites.beforeFiles,
      ...rewritesAndRedirects.rewrites.afterFiles,
      ...rewritesAndRedirects.rewrites.fallback,
    ];
    for (const r of rewrites) expect(r.destination).not.toMatch(/mintlify/);
    for (const source of ["/_mintlify/:path*", "/mintlify-assets/:path+"])
      expect(rewrites.map((r) => r.source)).not.toContain(source);
  });
});

describe("Docs routes", () => {
  it("serves docs assets and llms files from this app", () => {
    for (const p of [
      "/docs-assets/assets/docs/core/accounts.svg",
      "/llms.txt",
      "/llms-full.txt",
    ])
      expect(resolve(p)).toEqual({ kind: "none" });
  });

  it("serves English docs pages and their markdown twins", () => {
    expectDocsPage("/developers/docs");
    expectDocsPage("/developers/docs.md");
    expectDocsPage("/developers/docs/core/accounts");
    expectDocsPage("/developers/docs/core/accounts.md");
    expectDocsPage("/developers/docs/programs/build-first-program");
  });

  it("redirects every old /docs URL to /developers/docs in one hop", () => {
    expectRedirect("/docs", "/developers/docs");
    expectRedirect("/docs.md", "/developers/docs.md");
    expectRedirect("/docs/core/accounts", "/developers/docs/core/accounts");
    expectRedirect(
      "/docs/core/accounts.md",
      "/developers/docs/core/accounts.md",
    );
    expectRedirect("/docs/a/b/c", "/developers/docs/a/b/c");
    // The default locale goes straight to the unprefixed URL.
    expectRedirect("/en/docs", "/developers/docs");
    expectRedirect("/en/docs/core/pda", "/developers/docs/core/pda");
    for (const locale of DOCS_LOCALES) {
      expectRedirect(`/${locale}/docs`, `/${locale}/developers/docs`);
      expectRedirect(`/${locale}/docs.md`, `/${locale}/developers/docs.md`);
      expectRedirect(
        `/${locale}/docs/core/accounts`,
        `/${locale}/developers/docs/core/accounts`,
      );
    }
    // The new URLs are not redirected again.
    for (const url of [
      "/developers/docs",
      "/developers/docs/core/accounts",
      "/ja/developers/docs/core/accounts.md",
    ]) {
      expect(resolveRedirect(url)).toEqual({ kind: "none" });
    }
  });

  it("keeps the /docs?q= search hand-off query on the redirect", () => {
    const docsMove = rewritesAndRedirects.redirects.find(
      (r) => r.source === "/docs",
    );
    expect(docsMove).toMatchObject({
      destination: "/developers/docs",
      permanent: true,
    });
    // Next.js keeps the query string on redirects that do not set one.
    expect(docsMove?.destination).not.toContain("?");
  });

  it("serves section index pages at their own path and /index", () => {
    expectDocsPage("/developers/docs/tools");
    expectDocsPage("/fr/developers/docs/tools");
    expectDocsPage("/developers/docs/tools/kora");
    expectDocsPage("/developers/docs/tools.md");
  });

  it("redirects the tokenization hub, merged into the assets hub", () => {
    expectRedirect(
      "/docs/tokenization",
      "/developers/docs/assets#tokenization",
    );
    expectRedirect(
      "/fr/docs/tokenization",
      "/fr/developers/docs/assets#tokenization",
    );
    expectRedirect("/docs/tokenization.md", "/developers/docs/assets.md");
    // Exact path only: the tokenization guides keep their (moved) URLs.
    expectRedirect(
      "/docs/tokenization/token-acl",
      "/developers/docs/tokenization/token-acl",
    );
    expectDocsPage("/developers/docs/tokenization/token-acl");
  });

  it("sends merged duplicate pages straight to their final page", () => {
    expectRedirect(
      "/docs/payments/agentic-payments/x402-quickstart",
      "/developers/docs/payments/pay-sh#let-an-agent-pay-x402",
    );
    expectRedirect(
      "/docs/payments/agentic-payments/x402/making-a-payment.md",
      "/developers/docs/payments/pay-sh.md",
    );
    expectRedirect(
      "/ja/docs/payments/quickstart",
      "/ja/developers/docs/payments/checkout/browser",
    );
    expectRedirect(
      "/docs/tokenization/quickstart.md",
      "/developers/cookbook/tokens/create-mint-with-extensions.md",
    );
  });

  it("serves per-section llms.txt from its own route", () => {
    expectAppWebRoute("/developers/docs/payments/llms.txt");
    expectAppWebRoute("/developers/docs/finance/llms.txt");
    // The old URL redirects to the new one.
    expectRedirect(
      "/docs/payments/llms.txt",
      "/developers/docs/payments/llms.txt",
    );
    // Deeper paths have no llms.txt route (they are not docs pages either).
    expect(resolve("/developers/docs/core/accounts/llms.txt")).toEqual({
      kind: "none",
    });
    expect(docsPageExists("/developers/docs/core/accounts/llms.txt")).toBe(
      false,
    );
  });

  it("serves localized docs for the 17 docs locales", () => {
    expect(DOCS_LOCALES).toHaveLength(17);
    expect(DOCS_LOCALES).not.toContain("el");
    expect(DOCS_LOCALES).not.toContain("en");
    for (const locale of DOCS_LOCALES) {
      expectDocsPage(`/${locale}/developers/docs`);
      expectDocsPage(`/${locale}/developers/docs/core/accounts`);
    }
    expectDocsPage("/ja/developers/docs.md");
    expectDocsPage("/zh/developers/docs/core/pda.md");
  });

  it("does not treat unknown first segments as locales", () => {
    expectAppWebRoute("/xx/docs/core/accounts");
    expectAppWebRoute("/xx/developers/docs/core/accounts");
  });

  it("serves learn articles and leaves the /learn landing to its page", () => {
    expectDocsPage("/learn/what-is-solana");
    expectDocsPage("/learn/what-is-solana.md");
    expectDocsPage("/fr/learn/what-is-solana");
    expectAppWebRoute("/learn");
    expectAppWebRoute("/fr/learn");
  });

  it("leaves the /developers landing to apps/web (WP10)", () => {
    expectAppWebRoute("/developers");
    expectAppWebRoute("/fr/developers");
    expectAppWebRoute("/developers.md");
    // Only /developers/docs is the docs, not its look-alikes.
    expectAppWebRoute("/developers/docsy");
    expectAppWebRoute("/developers/payments");
  });

  it("keeps /developers/templates on the templates app", () => {
    expect(resolve("/developers/templates/foo")).toMatchObject({
      kind: "rewrite",
      destination: `${templatesAppUrl}/developers/templates/foo`,
    });
  });

  it("serves the English cookbook at localized URLs", () => {
    expectDocsPage("/developers/cookbook");
    expectDocsPage("/developers/cookbook.md");
    expectDocsPage("/developers/cookbook/wallets/create-keypair");
    expectDocsPage("/fr/developers/cookbook");
    expectDocsPage("/ko/developers/cookbook/wallets/create-keypair.md");
  });

  it("drops the retired docs-app rewrites", () => {
    const sources = rewritesAndRedirects.rewrites.beforeFiles.map(
      (rewrite) => rewrite.source,
    );
    for (const removed of [
      "/opengraph/:path+",
      "/developers",
      "/:locale/developers",
      "/developers/guides",
      "/developers/guides/:path*",
      "/developers/:path*.md",
      "/learn",
      "/:locale/learn",
    ]) {
      expect(sources).not.toContain(removed);
    }
  });
});

describe("English fallbacks for untranslated locale pages", () => {
  const file = path.join(
    repoRoot,
    "packages/docs-tooling/generated/locale-fallbacks.json",
  );
  const fallbacks: { loc: string; path: string; collection: string }[] =
    fs.existsSync(file)
      ? JSON.parse(fs.readFileSync(file, "utf8")).fallbacks
      : [];

  it("answers every missing translation with the English page", () => {
    for (const fallback of fallbacks) {
      const prefix =
        fallback.collection === "docs" ? "/developers/docs" : "/learn";
      const urlPath = fallback.path.replace(/(^|\/)index$/, "");
      const english = urlPath ? `${prefix}/${urlPath}` : prefix;
      // A legacy redirect, if any, wins over the fallback, as before.
      if (resolveRedirect(`/${fallback.loc}${english}`).kind === "redirect")
        continue;
      expect(docsPageExists(`/${fallback.loc}${english}`)).toBe(true);
    }
  });

  it("does not shadow translated pages", () => {
    // A translated page keeps its own locale URL.
    expectDocsPage("/fr/developers/docs/core/accounts");
  });
});

describe("Docs redirects", () => {
  it("ports the 16 redirects from the deleted apps/docs/next.config.ts", () => {
    const ported = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, "migration/docs-app-redirects.json"),
        "utf8",
      ),
    ) as { redirects: { source: string; destination: string }[] };
    expect(ported.redirects).toHaveLength(16);
    // The file keeps the pre-move destinations; the live rules point
    // straight at the same page under /developers/docs.
    const moved = (p: string) =>
      p.replace(/^(\/fr)?\/docs(?=\/|$|#)/, "$1/developers/docs");
    for (const { source, destination } of ported.redirects) {
      const concrete = (p: string) => p.replace(":locale", "fr");
      expectRedirect(concrete(source), moved(concrete(destination)));
    }
  });

  it("sends the bootcamp and its old lessons to the Video tutorials pages", () => {
    const V = "/developers/docs/video-guides";
    expectRedirect(
      "/developers/bootcamp",
      `${V}/2026-developer-bootcamp`,
      false,
    );
    expectRedirect(
      "/developers/bootcamp.md",
      `${V}/2026-developer-bootcamp.md`,
      false,
    );
    expectRedirect(
      "/developers/bootcamp/fullstack-apps/x402",
      `${V}/2026-developer-bootcamp`,
      false,
    );
    expectRedirect(
      "/developers/bootcamp/solana-crashcourse/developer-roadmap",
      `${V}/solana-crash-course`,
      false,
    );
    expectRedirect(
      "/developers/bootcamp/depin",
      `${V}/building-depin-projects`,
      false,
    );
    expectRedirect("/developers/learn", `${V}/2026-developer-bootcamp`, false);
    expectRedirect(
      "/developers/learn/fullstack-apps",
      `${V}/2026-developer-bootcamp`,
      false,
    );
    expectRedirect(
      "/pt/developers/bootcamp/fullstack-apps",
      `/pt${V}/2026-developer-bootcamp`,
      false,
    );
  });

  it("sends tag pages to the tags index temporarily", () => {
    expectRedirect("/docs/tags/payments", "/developers/docs/tags", false);
    expectRedirect("/docs/tags/a/b", "/developers/docs/tags", false);
    expectRedirect(
      "/developers/docs/tags/payments",
      "/developers/docs/tags",
      false,
    );
    expectRedirect("/docs/tags", "/developers/docs/tags");
    expectDocsPage("/developers/docs/tags");
  });

  it("sends old advanced/transaction URLs straight to existing pages", () => {
    for (const [from, to] of [
      ["/docs/advanced", "/developers/docs/core/transactions/confirmation"],
      [
        "/docs/core/transactions/retry",
        "/developers/cookbook/transactions/retry",
      ],
      [
        "/docs/core/transactions/versions",
        "/developers/docs/core/transactions/versioned-transactions",
      ],
    ]) {
      expectRedirect(from, to);
      expect(resolveRedirect(to)).toEqual({ kind: "none" });
      expectDocsPage(to);
    }
  });

  it("redirects every Greek docs collection URL to English", () => {
    expectRedirect("/el/docs", "/docs");
    expectRedirect("/el/docs.md", "/docs.md");
    expectRedirect("/el/docs/core/accounts", "/docs/core/accounts");
    expectRedirect("/el/docs/core/accounts.md", "/docs/core/accounts.md");
    expectRedirect("/el/developers/docs", "/developers/docs");
    expectRedirect(
      "/el/developers/docs/core/accounts",
      "/developers/docs/core/accounts",
    );
    expectRedirect(
      "/el/developers/docs/core/accounts.md",
      "/developers/docs/core/accounts.md",
    );
    expectRedirect("/el/learn", "/learn");
    expectRedirect("/el/learn/what-is-solana", "/learn/what-is-solana");
    expectRedirect("/el/developers", "/developers");
    expectRedirect("/el/developers/cookbook", "/developers/cookbook");
    expectRedirect(
      "/el/developers/cookbook/wallets/create-keypair.md",
      "/developers/cookbook/wallets/create-keypair.md",
    );
    expectRedirect("/el/developers/bootcamp", "/developers/bootcamp");
    expectRedirect(
      "/el/developers/bootcamp/fullstack-apps",
      "/developers/bootcamp/fullstack-apps",
    );
  });

  it("sends Greek URLs of moved pages to English first, then on", () => {
    // One Greek rule runs first; the English redirect then takes over.
    expectRedirect("/el/docs/clients/go", "/docs/clients/go");
    expectRedirect("/docs/clients/go", "/developers/docs/clients/community/go");
    // Greek URLs of pages that only moved prefix: /el/docs/x -> /docs/x ->
    // /developers/docs/x (two hops).
    expectRedirect("/docs/core/accounts", "/developers/docs/core/accounts");
    expectRedirect("/el/docs/clients/go.md", "/docs/clients/go.md");
    expectRedirect(
      "/el/docs/payments/accept-payments/payment-button",
      "/docs/payments/accept-payments/payment-button",
    );
    expectRedirect(
      "/el/developers/learn/fullstack-apps",
      "/developers/learn/fullstack-apps",
    );
    expectRedirect("/el/developers/guides", "/developers/guides");
    expectRedirect("/el/developers/guides/games", "/developers/guides/games");
    expectRedirect("/el/developers.md", "/developers.md");
    expectRedirect("/el/learn.md", "/learn.md");
  });

  it("leaves Greek apps/web pages alone", () => {
    expectRedirect("/el/brand", "/el/branding");
    expect(resolveRedirect("/el/wallets")).toEqual({ kind: "none" });
    for (const url of [
      "/el/developers/payments",
      "/el/developers/nfts",
      "/el/developers/migrate-to-solana",
      "/el/docsy",
      "/el/learning",
    ]) {
      // Not caught by the Greek docs rule: stays on a Greek URL.
      const result = resolveRedirect(url);
      if (result.kind === "redirect") {
        expect(result.destination.startsWith("/el/")).toBe(true);
      }
    }
  });
});

describe("Redirects never hide a published English page", () => {
  const manifestFile = path.join(
    repoRoot,
    "packages/docs-tooling/generated/pages.json",
  );
  const pages = fs.existsSync(manifestFile)
    ? (
        JSON.parse(fs.readFileSync(manifestFile, "utf8")) as {
          pages: { url: string; lang: string }[];
        }
      ).pages
    : [];
  // No page is shadowed by a redirect. (/docs/tools/ai was until 2026-10-16,
  // when its unmerged content was restored; /docs/programs/anchor is a real
  // page: the catch-all is `:path+`.)
  const known = new Set<string>();

  it.skipIf(pages.length === 0)("checks every English manifest page", () => {
    const shadowed = pages
      .filter((page) => page.lang === "en" && !known.has(page.url))
      .filter((page) => resolveRedirect(page.url).kind === "redirect")
      .map((page) => page.url);
    expect(shadowed).toEqual([]);
  });
});

describe("Legacy URL parity", () => {
  const legacyFile = path.join(repoRoot, "migration/legacy-urls.txt");
  const legacy = fs.existsSync(legacyFile)
    ? fs.readFileSync(legacyFile, "utf8").split("\n").filter(Boolean)
    : [];

  // Served by apps/web pages that WP10 builds.
  const landing = /^(\/[a-z]{2})?\/(developers|learn)$/;

  it.skipIf(legacy.length === 0)(
    "routes every legacy docs URL to a docs page, a redirect or an apps/web landing",
    () => {
      const unrouted: string[] = [];
      for (const url of legacy) {
        if (landing.test(url)) continue;
        for (const candidate of [url, `${url}.md`]) {
          if (resolve(candidate).kind === "none" && !docsPageExists(candidate))
            unrouted.push(candidate);
        }
      }
      expect(unrouted).toEqual([]);
    },
    60_000,
  );

  it.skipIf(legacy.length === 0)(
    "never chains a docs redirect into another redirect",
    () => {
      const chains: string[] = [];
      for (const url of legacy) {
        const first = resolveRedirect(url);
        if (first.kind !== "redirect") continue;
        let second = resolveRedirect(first.destination);
        // Greek URLs go to English first (one rule), then may take one more
        // hop if the English page moved too.
        if (url.startsWith("/el/") && second.kind === "redirect") {
          second = resolveRedirect(second.destination);
        }
        if (second.kind === "redirect") {
          chains.push(
            `${url} -> ${first.destination} -> ${second.destination}`,
          );
        }
      }
      expect(chains).toEqual([]);
    },
    60_000,
  );

  // A docs path is not enough: the page must exist too (the locale-only
  // programs/faq.md twins once 404'd).
  it.skipIf(legacy.length === 0)(
    "finds an apps/docs file for every legacy URL and .md twin served as a docs page",
    () => {
      const missing: string[] = [];
      for (const url of legacy) {
        if (landing.test(url)) continue;
        for (const candidate of [url, `${url}.md`]) {
          let target = candidate;
          let r = resolve(candidate);
          for (
            let hop = 0;
            hop < 3 && r.kind === "redirect" && r.destination.startsWith("/");
            hop++
          ) {
            target = r.destination.split("#")[0].split("?")[0];
            r = resolve(target);
          }
          if (r.kind !== "none") continue;
          if (!isDocsPath(target)) continue;
          if (!docsPageExists(target))
            missing.push(`${candidate} -> ${target}`);
        }
      }
      expect(missing).toEqual([]);
    },
    120_000,
  );

  it.skipIf(legacy.length === 0)(
    "lands every legacy redirect on a served page",
    () => {
      const dangling: string[] = [];
      for (const url of legacy) {
        const first = resolveRedirect(url);
        if (first.kind !== "redirect") continue;
        let destination = first.destination;
        // Greek URLs reach English first; follow the English hop if any.
        const next = resolveRedirect(destination);
        if (url.startsWith("/el/") && next.kind === "redirect") {
          destination = next.destination;
        }
        if (!destination.startsWith("/")) continue;
        const target = destination.split("#")[0].split("?")[0];
        if (landing.test(target)) continue;
        if (
          resolveRewrite(target).kind === "none" &&
          isDocsPath(target) &&
          !docsPageExists(target)
        ) {
          dangling.push(`${url} -> ${destination}`);
        }
      }
      expect(dangling).toEqual([]);
    },
    60_000,
  );
});
