import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "../constants";
import type { RouteGenerator, SitemapEntry } from "../types";
import { defaultLocale, locales } from "@workspace/i18n/config";
import {
  createEntry,
  dedupeEntries,
  getFileLastModified,
  normalizePath,
  toAbsoluteUrl,
  walkFiles,
} from "../utils";

/**
 * Docs pages served by Mintlify (spec §5.11, WP9). The page list comes from
 * packages/docs-tooling/generated/pages.json (`gen:manifest`), which carries
 * titles, git lastmod and the noindex flag. Each page gets hreflang
 * alternates for every language that has its own translation.
 *
 * Not listed: Greek (`/el/...`, dropped and redirected), English fallbacks
 * served at locale URLs and localized cookbook pages (both duplicate the
 * English page), and noindex pages. /developers and /learn are apps/web
 * landings and live in marketing.ts.
 */
const pagesManifestPath = path.join(
  repoRoot,
  "packages",
  "docs-tooling",
  "generated",
  "pages.json",
);
const docsRoot = path.join(repoRoot, "apps", "docs");

/** Locales Mintlify serves (decisions.md drops Greek). */
export const DOCS_LOCALES = locales.filter((locale) => locale !== "el");

const COLLECTION_ROOTS = new Set(["/developers/docs", "/developers/cookbook"]);

export interface DocsManifestPage {
  url: string;
  lang: string;
  file?: string;
  lastmod?: string;
  noindex?: boolean;
}

function stripLocale(url: string, lang: string) {
  if (lang === defaultLocale) return url;
  const prefix = `/${lang}`;
  return url === prefix ? "/" : url.slice(prefix.length);
}

function priorityFor(baseUrl: string) {
  return COLLECTION_ROOTS.has(baseUrl) ? 0.8 : 0.7;
}

/** Sitemap entries (with alternates) for manifest pages. */
export function docsEntriesFromManifest(
  pages: DocsManifestPage[],
): SitemapEntry[] {
  const listed = pages.filter(
    (page) => !page.noindex && DOCS_LOCALES.includes(page.lang),
  );

  const byBase = new Map<string, DocsManifestPage[]>();
  for (const page of listed) {
    const base = normalizePath(stripLocale(page.url, page.lang));
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base)!.push(page);
  }

  const entries: SitemapEntry[] = [];
  for (const [base, variants] of byBase) {
    const languages: Record<string, string> = {};
    for (const variant of variants) {
      languages[variant.lang] = toAbsoluteUrl(variant.url);
    }
    if (languages[defaultLocale]) {
      languages["x-default"] = languages[defaultLocale];
    }
    const alternates = variants.length > 1 ? { alternates: { languages } } : {};

    for (const variant of variants) {
      entries.push(
        createEntry(variant.url, {
          ...(variant.lastmod ? { lastModified: variant.lastmod } : {}),
          changeFrequency: "weekly",
          priority: priorityFor(base),
          ...alternates,
        }),
      );
    }
  }

  return entries;
}

export function readDocsManifest(
  file = pagesManifestPath,
): DocsManifestPage[] | null {
  if (!fs.existsSync(file)) {
    return null;
  }
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as {
    pages?: DocsManifestPage[];
  };
  return parsed.pages ?? [];
}

/**
 * Fallback when pages.json has not been generated: walk the Mintlify tree
 * (English at apps/docs/<collection>, locales at apps/docs/<loc>/<collection>).
 */
function walkDocsTree(): DocsManifestPage[] {
  const pages: DocsManifestPage[] = [];
  const collections = ["developers/docs", "learn", "developers/cookbook"];
  for (const lang of DOCS_LOCALES) {
    for (const collection of collections) {
      if (collection === "developers/cookbook" && lang !== defaultLocale) {
        continue;
      }
      const dir =
        lang === defaultLocale
          ? path.join(docsRoot, collection)
          : path.join(docsRoot, lang, collection);
      if (!fs.existsSync(dir)) continue;
      for (const file of walkFiles(dir)) {
        if (!file.endsWith(".mdx")) continue;
        const rel = path
          .relative(dir, file)
          .split(path.sep)
          .join("/")
          .replace(/\.mdx$/, "");
        const suffix = rel === "index" ? "" : rel.replace(/\/index$/, "");
        const base = suffix ? `/${collection}/${suffix}` : `/${collection}`;
        pages.push({
          url: lang === defaultLocale ? base : `/${lang}${base}`,
          lang,
          lastmod: getFileLastModified(file),
        });
      }
    }
  }
  return pages;
}

export const docsRoutes: RouteGenerator = () => {
  try {
    let pages = readDocsManifest();
    if (!pages) {
      console.warn(
        "docs sitemap: packages/docs-tooling/generated/pages.json is missing; walking apps/docs instead (run gen:manifest)",
      );
      pages = walkDocsTree();
    }

    // Localized collection roots. Cookbook is English-only content, but
    // /<loc>/developers/cookbook is served (English) and was listed before.
    const rootEntries = DOCS_LOCALES.flatMap((locale) =>
      ["/developers/cookbook"].map((root) =>
        createEntry(locale === defaultLocale ? root : `/${locale}${root}`, {
          changeFrequency: "weekly",
          priority: 0.8,
        }),
      ),
    );

    const dataEntries = locales.map((locale) =>
      createEntry(locale === defaultLocale ? "/data" : `/${locale}/data`, {
        changeFrequency: "daily",
        priority: 0.8,
      }),
    );

    // Manifest entries first so dedupe keeps the richer entry (lastmod,
    // alternates) over the bare root entries.
    return dedupeEntries([
      ...docsEntriesFromManifest(pages),
      ...rootEntries,
      ...dataEntries,
    ]);
  } catch (error) {
    console.error("Failed to build docs sitemap routes", error);
    return [];
  }
};
