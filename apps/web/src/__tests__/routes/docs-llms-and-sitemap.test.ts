import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GET,
  dynamic,
  dynamicParams,
  generateStaticParams,
} from "@/app/docs/[section]/llms.txt/route";
import { listLlmsSections } from "@/lib/docs-edge/llms-sections";
import { findRepoRoot } from "@/lib/docs-edge/repo-root";
import {
  docsEntriesFromManifest,
  docsRoutes,
  marketingRoutes,
} from "@solana-foundation/solana-com-sitemap";
import { resolveRedirect } from "./helpers/next-routing";

const repoRoot = findRepoRoot()!;
const sections = listLlmsSections();

function call(section: string) {
  return GET(new Request(`https://solana.com/docs/${section}/llms.txt`), {
    params: Promise.resolve({ section }),
  });
}

describe("/docs/[section]/llms.txt", () => {
  it("is fully static", () => {
    expect(dynamic).toBe("force-static");
    expect(dynamicParams).toBe(false);
  });

  it.skipIf(sections.length === 0)(
    "pre-renders one index per generated section",
    async () => {
      expect(generateStaticParams()).toEqual(
        sections.map((section) => ({ section })),
      );
      expect(sections).toEqual(
        expect.arrayContaining(["core", "payments", "rpc", "tokens"]),
      );
    },
  );

  it.skipIf(!sections.includes("payments"))(
    "serves the payments index as plain text with .md links",
    async () => {
      const res = await call("payments");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
      const body = await res.text();
      expect(body).toMatch(/^# Solana Documentation: /);
      expect(body).toContain("> Sending, accepting, and processing payments");
      expect(body).toContain("(https://solana.com/docs/payments.md)");
      expect(body).not.toMatch(/\]\(https:\/\/solana\.com\/(?!docs\/payments)/);
    },
  );

  it("404s unknown or unsafe sections", async () => {
    expect((await call("does-not-exist")).status).toBe(404);
    expect((await call("..%2F..%2Fetc")).status).toBe(404);
  });
});

describe("docs sitemap", () => {
  it("adds hreflang alternates and skips Greek and noindex pages", () => {
    const entries = docsEntriesFromManifest([
      { url: "/docs/core", lang: "en", lastmod: "2026-01-01T00:00:00Z" },
      { url: "/fr/docs/core", lang: "fr" },
      { url: "/el/docs/core", lang: "el" },
      { url: "/docs/secret", lang: "en", noindex: true },
      { url: "/docs/solo", lang: "en" },
    ]);
    expect(entries.map((e) => e.url)).toEqual([
      "https://solana.com/docs/core",
      "https://solana.com/fr/docs/core",
      "https://solana.com/docs/solo",
    ]);
    expect(entries[0]).toMatchObject({
      lastModified: "2026-01-01T00:00:00Z",
      alternates: {
        languages: {
          en: "https://solana.com/docs/core",
          fr: "https://solana.com/fr/docs/core",
          "x-default": "https://solana.com/docs/core",
        },
      },
    });
    expect(entries[2].alternates).toBeUndefined();
  });

  it("lists the Mintlify docs from the manifest, without Greek", async () => {
    const urls = (await docsRoutes()).map((entry) => entry.url);
    expect(urls).toContain("https://solana.com/docs");
    expect(urls).toContain("https://solana.com/docs/core/accounts");
    expect(urls).toContain("https://solana.com/fr/docs/core/accounts");
    expect(urls).toContain("https://solana.com/developers/cookbook");
    expect(urls).toContain("https://solana.com/ja/developers/bootcamp");
    // /el/data is an apps/web page; only Greek docs URLs are gone.
    expect(
      urls.filter(
        (url) =>
          url.startsWith("https://solana.com/el/") &&
          url !== "https://solana.com/el/data",
      ),
    ).toEqual([]);
    // The landings moved to marketing.ts.
    expect(urls).not.toContain("https://solana.com/developers");
    expect(urls).not.toContain("https://solana.com/learn");
  });

  it("keeps the developer landings in the marketing sitemap, minus Greek", async () => {
    const urls = (await marketingRoutes()).map((entry) => entry.url);
    expect(urls).toContain("https://solana.com/developers");
    expect(urls).toContain("https://solana.com/fr/developers");
    expect(urls).toContain("https://solana.com/learn");
    expect(urls).not.toContain("https://solana.com/el/developers");
    expect(urls).not.toContain("https://solana.com/el/learn");
  });

  it("covers every legacy docs URL that still serves its own page", async () => {
    const legacyFile = path.join(repoRoot, "migration/legacy-urls.tsv");
    if (!fs.existsSync(legacyFile)) return;
    const urls = new Set((await docsRoutes()).map((entry) => entry.url));
    const [header, ...rows] = fs
      .readFileSync(legacyFile, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split("\t"));
    const col = (name: string) => header.indexOf(name);
    const missing = rows
      .filter((row) => row[col("kind")] === "page")
      .filter((row) => row[col("locale")] !== "el")
      .filter((row) => row[col("collection")] !== "developers")
      // Pages merged into another page since (migration/dup-audit.md) are
      // redirects now, so they no longer serve their own page.
      .filter((row) => resolveRedirect(row[col("url")]!).kind !== "redirect")
      .map((row) => `https://solana.com${row[col("url")]}`)
      .filter((url) => !urls.has(url));
    // Every non-Greek legacy page URL that is not redirected is still listed.
    expect(missing).toEqual([]);
  });
});
