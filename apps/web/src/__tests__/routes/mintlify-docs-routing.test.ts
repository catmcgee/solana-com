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
      expect(M).toBe("https://solana.mintlify.site");
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
    expectRewrite("/docs", `${M}/docs`);
    expectRewrite("/docs.md", `${M}/docs.md`);
    expectRewrite("/docs/core/accounts", `${M}/docs/core/accounts`);
    expectRewrite("/docs/core/accounts.md", `${M}/docs/core/accounts.md`);
    expectRewrite(
      "/docs/intro/quick-start/build-first-program",
      `${M}/docs/intro/quick-start/build-first-program`,
    );
  });

  it("serves index pages Mintlify would 307 away via their /index path", () => {
    expectRewrite("/docs/tools", `${M}/docs/tools/index`);
    expectRewrite("/fr/docs/tokenization", `${M}/fr/docs/tokenization/index`);
    expectRewrite("/docs/tools/kora", `${M}/docs/tools/kora`);
    expectRewrite("/docs/tools.md", `${M}/docs/tools.md`);
  });

  it("serves per-section llms.txt from apps/web, not Mintlify", () => {
    expectAppWebRoute("/docs/payments/llms.txt");
    expectAppWebRoute("/docs/finance/llms.txt");
    // Deeper paths are not apps/web routes and stay with Mintlify.
    expectRewrite(
      "/docs/core/accounts/llms.txt",
      `${M}/docs/core/accounts/llms.txt`,
    );
  });

  it("proxies localized docs for the 17 Mintlify locales", () => {
    expect(MINTLIFY_LOCALES).toHaveLength(17);
    expect(MINTLIFY_LOCALES).not.toContain("el");
    expect(MINTLIFY_LOCALES).not.toContain("en");
    for (const locale of MINTLIFY_LOCALES) {
      expectRewrite(`/${locale}/docs`, `${M}/${locale}/docs`);
      expectRewrite(
        `/${locale}/docs/core/accounts`,
        `${M}/${locale}/docs/core/accounts`,
      );
    }
    expectRewrite("/ja/docs.md", `${M}/ja/docs.md`);
    expectRewrite("/zh/docs/core/pda.md", `${M}/zh/docs/core/pda.md`);
  });

  it("does not proxy unknown first segments as locales", () => {
    expectAppWebRoute("/xx/docs/core/accounts");
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

  it("proxies the bootcamp, localized", () => {
    expectRewrite("/developers/bootcamp", `${M}/developers/bootcamp`);
    expectRewrite(
      "/developers/bootcamp/fullstack-apps",
      `${M}/developers/bootcamp/fullstack-apps`,
    );
    expectRewrite(
      "/es/developers/bootcamp/fullstack-apps.md",
      `${M}/es/developers/bootcamp/fullstack-apps.md`,
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
          ? "/docs"
          : fallback.collection === "bootcamp"
            ? "/developers/bootcamp"
            : "/learn";
      const urlPath = pageToUrlPath(fallback.path);
      const english = urlPath ? `${prefix}/${urlPath}` : prefix;
      // resolveRewrite: a few legacy redirects (e.g. /:locale/docs/tools/ai)
      // win over the fallback, exactly as they did before.
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
        source: "/:locale(de|fr)/docs/:path(video-guides)",
        destination: "https://m/docs/:path",
        locale: false,
      },
      {
        source: "/:locale(de|fr)/docs/:path(video-guides).md",
        destination: "https://m/docs/:path.md",
        locale: false,
      },
      {
        source: "/:locale(fr)/docs/:path(research)",
        destination: "https://m/docs/:path",
        locale: false,
      },
      {
        source: "/:locale(fr)/docs/:path(research).md",
        destination: "https://m/docs/:path.md",
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
    expectRewrite("/fr/docs/core/accounts", `${M}/fr/docs/core/accounts`);
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
    for (const { source, destination } of ported.redirects) {
      const concrete = (p: string) => p.replace(":locale", "fr");
      expectRedirect(concrete(source), concrete(destination));
    }
  });

  it("redirects the old /developers/learn section to the bootcamp", () => {
    expectRedirect("/developers/learn", "/developers/bootcamp");
    expectRedirect("/developers/learn.md", "/developers/bootcamp.md");
    expectRedirect(
      "/developers/learn/fullstack-apps",
      "/developers/bootcamp/fullstack-apps",
    );
    expectRedirect(
      "/developers/learn/fullstack-apps.md",
      "/developers/bootcamp/fullstack-apps.md",
    );
    expectRedirect(
      "/pt/developers/learn/fullstack-apps",
      "/pt/developers/bootcamp/fullstack-apps",
    );
  });

  it("sends tag pages to the tags index temporarily", () => {
    expectRedirect("/docs/tags/payments", "/docs/tags", false);
    expectRedirect("/docs/tags/a/b", "/docs/tags", false);
    expectRewrite("/docs/tags", `${M}/docs/tags`);
  });

  it("sends old advanced/transaction URLs straight to existing pages", () => {
    for (const [from, to] of [
      ["/docs/advanced", "/docs/core/transactions/confirmation"],
      [
        "/docs/core/transactions/retry",
        "/developers/cookbook/transactions/retry",
      ],
      [
        "/docs/core/transactions/versions",
        "/docs/core/transactions/versioned-transactions",
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
    expectRedirect("/docs/clients/go", "/docs/clients/community/go");
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
  // Shadowed before the migration too; the redirect is the intended answer.
  // (/docs/programs/anchor is now a real page: the catch-all is `:path+`.)
  const known = new Set(["/docs/tools/ai"]);

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
