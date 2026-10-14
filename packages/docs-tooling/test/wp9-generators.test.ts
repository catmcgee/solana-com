import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  fileToUrl,
  loadNavPlacements,
  readFrontmatter,
  stableManifest,
  type ManifestPage,
} from "../src/manifest/pages.ts";
import {
  buildMintlifyRedirects,
  toMintlifyRedirect,
} from "../src/manifest/redirects.ts";
import {
  docsSections,
  renderLlmsTxt,
  renderSectionLlmsTxt,
} from "../src/llms/generate.ts";

describe("gen:manifest", () => {
  it("maps Mintlify files to public URLs", () => {
    expect(fileToUrl("apps/docs/docs/index.mdx")).toEqual({
      url: "/docs",
      lang: "en",
    });
    expect(fileToUrl("apps/docs/docs/core/accounts/index.mdx")).toEqual({
      url: "/docs/core/accounts",
      lang: "en",
    });
    expect(fileToUrl("apps/docs/fr/docs/core/pda.mdx")).toEqual({
      url: "/fr/docs/core/pda",
      lang: "fr",
    });
    expect(fileToUrl("apps/docs/developers/cookbook/index.mdx")).toEqual({
      url: "/developers/cookbook",
      lang: "en",
    });
    expect(fileToUrl("apps/docs/ja/learn/what-is-solana.mdx")).toEqual({
      url: "/ja/learn/what-is-solana",
      lang: "ja",
    });
  });

  it("reads frontmatter and tolerates files without it", () => {
    expect(
      readFrontmatter('---\ntitle: "Accounts"\nnoindex: true\n---\n\n# x'),
    ).toEqual({ title: "Accounts", noindex: true });
    expect(readFrontmatter("# no frontmatter")).toEqual({});
    expect(readFrontmatter("---\n: : bad\n---\n")).toEqual({});
  });

  it("resolves tab and group placement through docs.json $refs", () => {
    const root = mkdtempSync(path.join(tmpdir(), "wp9-nav-"));
    mkdirSync(path.join(root, "navigation"));
    writeFileSync(
      path.join(root, "docs.json"),
      JSON.stringify({
        navigation: {
          languages: [
            { language: "en", $ref: "./navigation/en.json" },
            { language: "jp", $ref: "./navigation/ja.json" },
          ],
        },
      }),
    );
    writeFileSync(
      path.join(root, "navigation/en.json"),
      JSON.stringify({
        tabs: [
          {
            tab: "How Solana works",
            groups: [
              {
                group: "Accounts",
                root: "docs/core/accounts/index",
                icon: "box",
                pages: ["docs/core/accounts/account-structure"],
              },
            ],
          },
        ],
      }),
    );
    writeFileSync(
      path.join(root, "navigation/ja.json"),
      JSON.stringify({
        tabs: [
          { tab: "仕組み", groups: [{ group: "G", pages: ["ja/docs/core"] }] },
        ],
      }),
    );
    const nav = loadNavPlacements(root);
    expect(nav.get("en")?.get("docs/core/accounts/index")).toEqual({
      tab: "How Solana works",
      group: "Accounts",
    });
    expect(nav.get("en")?.get("docs/core/accounts/account-structure")).toEqual({
      tab: "How Solana works",
      group: "Accounts",
    });
    expect(nav.get("en")?.has("box")).toBe(false);
    // Mintlify code jp maps back to the ja folder.
    expect(nav.get("ja")?.get("ja/docs/core")).toEqual({
      tab: "仕組み",
      group: "G",
    });
  });

  it("ignores lastmod in the staleness check", () => {
    const m = {
      generatedBy: "x",
      pages: [
        { url: "/docs", file: "f", lang: "en", title: "t", lastmod: "d" },
      ],
    };
    expect(stableManifest(m).pages[0]).not.toHaveProperty("lastmod");
  });
});

const pages: ManifestPage[] = [
  {
    url: "/docs",
    file: "",
    lang: "en",
    title: "Start Here",
    description: "Begin.",
  },
  { url: "/docs/payments", file: "", lang: "en", title: "Payments" },
  {
    url: "/docs/payments/x402",
    file: "",
    lang: "en",
    title: "x402",
    description: "Pay.",
  },
  { url: "/docs/core", file: "", lang: "en", title: "Core" },
  { url: "/docs/secret", file: "", lang: "en", title: "Hidden", noindex: true },
  { url: "/fr/docs/payments", file: "", lang: "fr", title: "Paiements" },
  { url: "/developers/cookbook/a", file: "", lang: "en", title: "Recipe" },
  {
    url: "/learn/what-is-solana",
    file: "",
    lang: "en",
    title: "What is Solana",
  },
];

describe("gen:llms", () => {
  it("renders the site index with the agent header and .md links", () => {
    const txt = renderLlmsTxt(pages, "# Header");
    expect(txt).toBe(
      [
        "# Header",
        "",
        "## Core documentation",
        "",
        "- [Start Here](https://solana.com/docs.md): Begin.",
        "- [Core](https://solana.com/docs/core.md)",
        "- [Payments](https://solana.com/docs/payments.md)",
        "- [x402](https://solana.com/docs/payments/x402.md): Pay.",
        "",
        "## Cookbook",
        "",
        "- [Recipe](https://solana.com/developers/cookbook/a.md)",
        "",
        "## Learn",
        "",
        "- [What is Solana](https://solana.com/learn/what-is-solana.md)",
        "",
      ].join("\n"),
    );
  });

  it("renders per-section indexes with routing notes", () => {
    expect(docsSections(pages)).toEqual(["core", "payments"]);
    const body = renderSectionLlmsTxt(pages, "payments")!;
    expect(body.split("\n").slice(0, 3)).toEqual([
      "# Solana Documentation: Payments",
      "",
      "> Sending, accepting, and processing payments on Solana - subscriptions, batching, and agentic flows.",
    ]);
    expect(body).toContain(
      "- [x402](https://solana.com/docs/payments/x402.md): Pay.",
    );
    expect(body).not.toContain("Paiements");
    expect(renderSectionLlmsTxt(pages, "nope")).toBeNull();
  });
});

describe("gen:redirects", () => {
  it("converts Next.js docs redirects to Mintlify syntax", () => {
    expect(
      toMintlifyRedirect({
        source: "/:locale(en|ar|fr)/docs/clients/go",
        destination: "/:locale/docs/clients/community/go",
      }),
    ).toEqual({
      source: "/:locale/docs/clients/go",
      destination: "/:locale/docs/clients/community/go",
      permanent: true,
    });
    expect(
      toMintlifyRedirect({
        source: "/docs/tags/:tag+",
        destination: "/docs/tags",
        permanent: false,
      }),
    ).toEqual({
      source: "/docs/tags/:tag*",
      destination: "/docs/tags",
      permanent: false,
    });
  });

  it("makes non-docs destinations absolute and skips what Mintlify cannot express", () => {
    expect(
      toMintlifyRedirect({
        source: "/docs/intro/economics",
        destination: "/staking",
      }),
    ).toMatchObject({ destination: "https://solana.com/staking" });
    // not a docs path
    expect(
      toMintlifyRedirect({ source: "/brand", destination: "/branding" }),
    ).toBeNull();
    // .md twin
    expect(
      toMintlifyRedirect({ source: "/docs/a.md", destination: "/docs/b.md" }),
    ).toBeNull();
    // external
    expect(
      toMintlifyRedirect({ source: "/docs/x", destination: "https://x.dev" }),
    ).toBeNull();
    // conditional
    expect(
      toMintlifyRedirect({
        source: "/docs/x",
        destination: "/docs/y",
        has: [{ type: "query", key: "a" }],
      }),
    ).toBeNull();
  });

  it("keeps Greek catch-alls but drops per-page Greek shortcuts", () => {
    const out = buildMintlifyRedirects([
      {
        source: "/el/docs/clients/go",
        destination: "/docs/clients/community/go",
      },
      { source: "/el/docs", destination: "/docs" },
      { source: "/el/docs/:path*", destination: "/docs/:path*" },
      { source: "/docs/a", destination: "/docs/b" },
      { source: "/docs/a", destination: "/docs/c" },
    ]);
    expect(out.map((r) => r.source)).toEqual([
      "/el/docs",
      "/el/docs/:path*",
      "/docs/a",
    ]);
  });

  it("expands apps/web's Greek regex rule into plain catch-alls", () => {
    const out = buildMintlifyRedirects([
      {
        source:
          "/el/:path((?:docs|learn|developers/(?:cookbook|bootcamp|guides|learn))(?:\\.md|/.+)?|developers(?:\\.md)?)",
        destination: "/:path",
        permanent: true,
      },
    ]);
    expect(out).toContainEqual({
      source: "/el/docs/:path*",
      destination: "/docs/:path*",
      permanent: true,
    });
    expect(out).toContainEqual({
      source: "/el/learn/:path*",
      destination: "/learn/:path*",
      permanent: true,
    });
    expect(out.map((r) => r.source)).toContain("/el/developers/bootcamp");
    expect(out.every((r) => !/[()]/.test(r.source))).toBe(true);
  });
});
