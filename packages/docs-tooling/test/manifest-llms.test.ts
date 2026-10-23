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
  docsSections,
  renderLlmsTxt,
  renderSectionLlmsTxt,
} from "../src/llms/generate.ts";

describe("gen:manifest", () => {
  it("maps docs files to public URLs", () => {
    expect(fileToUrl("apps/docs/developers/docs/index.mdx")).toEqual({
      url: "/developers/docs",
      lang: "en",
    });
    expect(
      fileToUrl("apps/docs/developers/docs/core/accounts/index.mdx"),
    ).toEqual({
      url: "/developers/docs/core/accounts",
      lang: "en",
    });
    expect(fileToUrl("apps/docs/fr/developers/docs/core/pda.mdx")).toEqual({
      url: "/fr/developers/docs/core/pda",
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
                root: "developers/docs/core/accounts/index",
                icon: "box",
                pages: ["developers/docs/core/accounts/account-structure"],
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
          {
            tab: "仕組み",
            groups: [{ group: "G", pages: ["ja/developers/docs/core"] }],
          },
        ],
      }),
    );
    const nav = loadNavPlacements(root);
    expect(nav.get("en")?.get("developers/docs/core/accounts/index")).toEqual({
      tab: "How Solana works",
      group: "Accounts",
    });
    expect(
      nav.get("en")?.get("developers/docs/core/accounts/account-structure"),
    ).toEqual({
      tab: "How Solana works",
      group: "Accounts",
    });
    expect(nav.get("en")?.has("box")).toBe(false);
    // Navigation code jp maps back to the ja folder.
    expect(nav.get("ja")?.get("ja/developers/docs/core")).toEqual({
      tab: "仕組み",
      group: "G",
    });
  });

  it("ignores lastmod in the staleness check", () => {
    const m = {
      generatedBy: "x",
      pages: [
        {
          url: "/developers/docs",
          file: "f",
          lang: "en",
          title: "t",
          lastmod: "d",
        },
      ],
    };
    expect(stableManifest(m).pages[0]).not.toHaveProperty("lastmod");
  });
});

const pages: ManifestPage[] = [
  {
    url: "/developers/docs",
    file: "",
    lang: "en",
    title: "Start Here",
    description: "Begin.",
  },
  { url: "/developers/docs/payments", file: "", lang: "en", title: "Payments" },
  {
    url: "/developers/docs/payments/x402",
    file: "",
    lang: "en",
    title: "x402",
    description: "Pay.",
  },
  { url: "/developers/docs/core", file: "", lang: "en", title: "Core" },
  {
    url: "/developers/docs/secret",
    file: "",
    lang: "en",
    title: "Hidden",
    noindex: true,
  },
  {
    url: "/fr/developers/docs/payments",
    file: "",
    lang: "fr",
    title: "Paiements",
  },
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
        "- [Start Here](https://solana.com/developers/docs.md): Begin.",
        "- [Core](https://solana.com/developers/docs/core.md)",
        "- [Payments](https://solana.com/developers/docs/payments.md)",
        "- [x402](https://solana.com/developers/docs/payments/x402.md): Pay.",
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
      "- [x402](https://solana.com/developers/docs/payments/x402.md): Pay.",
    );
    expect(body).not.toContain("Paiements");
    expect(renderSectionLlmsTxt(pages, "nope")).toBeNull();
  });
});
