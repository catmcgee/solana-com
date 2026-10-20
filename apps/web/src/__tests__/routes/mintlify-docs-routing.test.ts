import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MINTLIFY_ORIGIN, templatesAppUrl } from "@@/apps-urls";
import rewritesAndRedirects from "@@/rewrites-redirects";
import {
  buildFallbackRewrites,
  loadLocaleFallbacks,
  pageToUrlPath,
  type LocaleFallback,
} from "@/lib/docs-edge/fallbacks";
import { findRepoRoot } from "@/lib/docs-edge/repo-root";
import { MINTLIFY_LOCALES } from "@/lib/docs-edge/paths";
import {
  resolve,
  resolveRedirect,
  resolveRewrite,
} from "./helpers/next-routing";

const M = MINTLIFY_ORIGIN;
const repoRoot = findRepoRoot()!;

function expectRewrite(pathname: string, destination: string) {
  expect(resolve(pathname)).toMatchObject({ kind: "rewrite", destination });
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

describe("Mintlify origin", () => {
  it("defaults to the root-hosted *.mintlify.site preview", () => {
    expect(M).toMatch(/^https?:\/\/[^/]+$/);
    if (!process.env.MINTLIFY_ORIGIN) {
      expect(M).toBe("https://solana-f31f4a8d.mintlify.site");
    }
  });

  it("no longer proxies anything to the retired solana-com-docs project", () => {
    const destinations = [
      ...rewritesAndRedirects.rewrites.beforeFiles,
      ...rewritesAndRedirects.redirects,
    ].map((route) => route.destination);
    for (const destination of destinations) {
      expect(destination).not.toContain("solana-com-docs");
      expect(destination).not.toContain("localhost:3003");
    }
  });

  it("documents the Enterprise static-export recommendation next to the rewrites", () => {
    const source = fs.readFileSync(
      path.join(repoRoot, "apps/web/rewrites-redirects.ts"),
      "utf8",
    );
    expect(source).toContain("RECOMMENDATION: upgrade to Mintlify Enterprise");
    expect(source).toContain("`mint export`");
    expect(source).toMatch(/self-hosting as an Enterprise-only feature/);
  });
});

describe("Mintlify rewrites", () => {
  it("proxies the Mintlify runtime, assets and llms files", () => {
    expectRewrite("/_mintlify/api/v1/e", `${M}/_mintlify/api/v1/e`);
    expectRewrite(
      "/mintlify-assets/_next/static/chunks/main.js",
      `${M}/mintlify-assets/_next/static/chunks/main.js`,
    );
    expectRewrite(
      "/docs-assets/assets/docs/core/accounts.svg",
      `${M}/docs-assets/assets/docs/core/accounts.svg`,
    );
    expectRewrite("/llms.txt", `${M}/llms.txt`);
    expectRewrite("/llms-full.txt", `${M}/llms-full.txt`);
  });

  it("proxies English docs pages and their markdown twins", () => {
    expectRewrite("/developers/docs", `${M}/developers/docs`);
    expectRewrite("/developers/docs.md", `${M}/developers/docs.md`);
    expectRewrite(
      "/developers/docs/core/accounts",
      `${M}/developers/docs/core/accounts`,
    );
    expectRewrite(
      "/developers/docs/core/accounts.md",
      `${M}/developers/docs/core/accounts.md`,
    );
    expectRewrite(
      "/developers/docs/programs/build-first-program",
      `${M}/developers/docs/programs/build-first-program`,
    );
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
    for (const locale of MINTLIFY_LOCALES) {
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

  it("serves index pages Mintlify would 307 away via their /index path", () => {
    expectRewrite("/developers/docs/tools", `${M}/developers/docs/tools/index`);
    expectRewrite(
      "/fr/developers/docs/tools",
      `${M}/fr/developers/docs/tools/index`,
    );
    expectRewrite(
      "/developers/docs/tools/kora",
      `${M}/developers/docs/tools/kora`,
    );
    expectRewrite("/developers/docs/tools.md", `${M}/developers/docs/tools.md`);
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
    expectRewrite(
      "/developers/docs/tokenization/token-acl",
      `${M}/developers/docs/tokenization/token-acl`,
    );
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

  it("serves per-section llms.txt from apps/web, not Mintlify", () => {
    expectAppWebRoute("/developers/docs/payments/llms.txt");
    expectAppWebRoute("/developers/docs/finance/llms.txt");
    // The old URL redirects to the new one.
    expectRedirect(
      "/docs/payments/llms.txt",
      "/developers/docs/payments/llms.txt",
    );
    // Deeper paths are not apps/web routes and stay with Mintlify.
    expectRewrite(
      "/developers/docs/core/accounts/llms.txt",
      `${M}/developers/docs/core/accounts/llms.txt`,
    );
  });

  it("proxies localized docs for the 17 Mintlify locales", () => {
    expect(MINTLIFY_LOCALES).toHaveLength(17);
    expect(MINTLIFY_LOCALES).not.toContain("el");
    expect(MINTLIFY_LOCALES).not.toContain("en");
    for (const locale of MINTLIFY_LOCALES) {
      expectRewrite(
        `/${locale}/developers/docs`,
        `${M}/${locale}/developers/docs`,
      );
      expectRewrite(
        `/${locale}/developers/docs/core/accounts`,
        `${M}/${locale}/developers/docs/core/accounts`,
      );
    }
    expectRewrite("/ja/developers/docs.md", `${M}/ja/developers/docs.md`);
    expectRewrite(
      "/zh/developers/docs/core/pda.md",
      `${M}/zh/developers/docs/core/pda.md`,
    );
  });

  it("does not proxy unknown first segments as locales", () => {
    expectAppWebRoute("/xx/docs/core/accounts");
    expectAppWebRoute("/xx/developers/docs/core/accounts");
  });

  it("proxies learn articles but leaves the /learn landing to apps/web", () => {
    expectRewrite("/learn/what-is-solana", `${M}/learn/what-is-solana`);
    expectRewrite("/learn/what-is-solana.md", `${M}/learn/what-is-solana.md`);
    expectRewrite("/fr/learn/what-is-solana", `${M}/fr/learn/what-is-solana`);
    expectAppWebRoute("/learn");
    expectAppWebRoute("/fr/learn");
  });

  it("leaves the /developers landing to apps/web (WP10)", () => {
    expectAppWebRoute("/developers");
    expectAppWebRoute("/fr/developers");
    expectAppWebRoute("/developers.md");
    // Only /developers/docs is proxied, not its look-alikes.
    expectAppWebRoute("/developers/docsy");
    expectAppWebRoute("/developers/payments");
  });

  it("keeps /developers/templates on the templates app", () => {
    expectRewrite(
      "/developers/templates/foo",
      `${templatesAppUrl}/developers/templates/foo`,
    );
  });

  it("serves the English cookbook at localized URLs", () => {
    expectRewrite("/developers/cookbook", `${M}/developers/cookbook`);
    expectRewrite("/developers/cookbook.md", `${M}/developers/cookbook.md`);
    expectRewrite(
      "/developers/cookbook/wallets/create-keypair",
      `${M}/developers/cookbook/wallets/create-keypair`,
    );
    expectRewrite("/fr/developers/cookbook", `${M}/developers/cookbook`);
    expectRewrite(
      "/ko/developers/cookbook/wallets/create-keypair.md",
      `${M}/developers/cookbook/wallets/create-keypair.md`,
    );
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
  const fallbacks = loadLocaleFallbacks(repoRoot);

  it("rewrites every missing translation to the English page", () => {
    for (const fallback of fallbacks) {
      const prefix =
        fallback.collection === "docs"
          ? "/developers/docs"
          : fallback.collection === "bootcamp"
            ? "/developers/bootcamp"
            : "/learn";
      const urlPath = pageToUrlPath(fallback.path);
      const english = urlPath ? `${prefix}/${urlPath}` : prefix;
      // resolveRewrite: a legacy redirect, if any, wins over the fallback,
      // exactly as it did before.
      expect(resolveRewrite(`/${fallback.loc}${english}`)).toMatchObject({
        destination: `${M}${english}`,
      });
      expect(resolveRewrite(`/${fallback.loc}${english}.md`)).toMatchObject({
        destination: `${M}${english}.md`,
      });
    }
  });

  it("compiles the fallbacks into a handful of grouped rules", () => {
    const rules = buildFallbackRewrites(fallbacks, M);
    expect(rules.length).toBeLessThanOrEqual(20);
  });

  it("groups pages by the locales that miss them", () => {
    const sample: LocaleFallback[] = [
      { loc: "fr", path: "video-guides/index", collection: "docs" },
      { loc: "de", path: "video-guides/index", collection: "docs" },
      { loc: "fr", path: "research", collection: "docs" },
      { loc: "fr", path: "index", collection: "learn" },
    ];
    expect(buildFallbackRewrites(sample, "https://m")).toEqual([
      {
        source: "/:locale(de|fr)/developers/docs/:path(video-guides)",
        destination: "https://m/developers/docs/:path",
        locale: false,
      },
      {
        source: "/:locale(de|fr)/developers/docs/:path(video-guides).md",
        destination: "https://m/developers/docs/:path.md",
        locale: false,
      },
      {
        source: "/:locale(fr)/developers/docs/:path(research)",
        destination: "https://m/developers/docs/:path",
        locale: false,
      },
      {
        source: "/:locale(fr)/developers/docs/:path(research).md",
        destination: "https://m/developers/docs/:path.md",
        locale: false,
      },
      {
        source: "/:locale(fr)/learn",
        destination: "https://m/learn",
        locale: false,
      },
      {
        source: "/:locale(fr)/learn.md",
        destination: "https://m/learn.md",
        locale: false,
      },
    ]);
  });

  it("does not shadow translated pages", () => {
    // A translated page keeps its own locale URL.
    expectRewrite(
      "/fr/developers/docs/core/accounts",
      `${M}/fr/developers/docs/core/accounts`,
    );
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
    expectRewrite("/developers/docs/tags", `${M}/developers/docs/tags`);
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
      expect(resolveRewrite(to).kind).toBe("rewrite");
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
    "routes every legacy docs URL to Mintlify, a redirect or an apps/web landing",
    () => {
      const unrouted: string[] = [];
      for (const url of legacy) {
        if (landing.test(url)) continue;
        for (const candidate of [url, `${url}.md`]) {
          if (resolve(candidate).kind === "none") unrouted.push(candidate);
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

  // Reaching Mintlify is not enough: the page must exist there too (the
  // locale-only programs/faq.md twins once reached Mintlify and 404'd).
  it.skipIf(legacy.length === 0)(
    "finds an apps/docs file for every legacy URL and .md twin served by Mintlify",
    () => {
      const docsRoot = path.join(repoRoot, "apps/docs");
      const fileExists = (target: string) => {
        const base = path.join(docsRoot, target || "index");
        return [
          `${base}.mdx`,
          `${base}.md`,
          path.join(base, "index.mdx"),
          path.join(base, "index.md"),
        ].some((f) => fs.existsSync(f));
      };
      const missing: string[] = [];
      for (const url of legacy) {
        if (landing.test(url)) continue;
        for (const candidate of [url, `${url}.md`]) {
          let r = resolve(candidate);
          for (
            let hop = 0;
            hop < 3 && r.kind === "redirect" && r.destination.startsWith("/");
            hop++
          ) {
            r = resolve(r.destination.split("#")[0].split("?")[0]);
          }
          if (r.kind !== "rewrite" || !r.destination.startsWith(M)) continue;
          const target = r.destination
            .slice(M.length)
            .replace(/^\/+/, "")
            .replace(/\.md$/, "");
          // Assets and Mintlify-generated files are not pages.
          if (/\.[a-z0-9]+$/i.test(target)) continue;
          if (!fileExists(target))
            missing.push(`${candidate} -> ${r.destination}`);
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
        if (resolveRewrite(target).kind === "none") {
          dangling.push(`${url} -> ${destination}`);
        }
      }
      expect(dangling).toEqual([]);
    },
    60_000,
  );
});
