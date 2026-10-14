/**
 * English fallbacks for untranslated locale docs pages (spec §5.10).
 *
 * Fumadocs served the English page at `/<loc>/docs/<path>` when a translation
 * was missing. Mintlify only serves files that exist, so apps/web rewrites
 * those URLs to the English Mintlify page (the public URL is unchanged).
 *
 * The list is derived from the files in apps/docs at config time, so it
 * shrinks by itself as translations land, and is unioned with
 * packages/docs-tooling/generated/locale-fallbacks.json (WP6) when present.
 * Release gate (§6.3): it must be empty for docs pages before cutover.
 *
 * Reads the filesystem: import only from config code (rewrites-redirects.ts),
 * never from middleware or route handlers.
 */
import fs from "node:fs";
import path from "node:path";
import { MINTLIFY_LOCALES } from "./paths";
import { findRepoRoot } from "./repo-root";

export { findRepoRoot };

export type FallbackCollection = "docs" | "bootcamp" | "learn";

export interface LocaleFallback {
  loc: string;
  /** Page path without the collection prefix, e.g. "video-guides/index". */
  path: string;
  collection: FallbackCollection;
}

/** Public URL prefix and apps/docs folder for each collection. */
export const FALLBACK_COLLECTIONS: Record<
  FallbackCollection,
  { urlPrefix: string; dir: string }
> = {
  docs: { urlPrefix: "/docs", dir: "docs" },
  bootcamp: { urlPrefix: "/developers/bootcamp", dir: "developers/bootcamp" },
  learn: { urlPrefix: "/learn", dir: "learn" },
};

function walkPages(dir: string, base = dir, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPages(full, base, out);
    else if (/\.mdx?$/.test(entry.name))
      out.push(
        path
          .relative(base, full)
          .split(path.sep)
          .join("/")
          .replace(/\.mdx?$/, ""),
      );
  }
  return out;
}

function pageExists(docsRoot: string, rel: string) {
  return (
    fs.existsSync(path.join(docsRoot, `${rel}.mdx`)) ||
    fs.existsSync(path.join(docsRoot, `${rel}.md`))
  );
}

/** Missing translations, from file existence in apps/docs. */
export function computeLocaleFallbacks(docsRoot: string): LocaleFallback[] {
  const out: LocaleFallback[] = [];
  for (const collection of Object.keys(
    FALLBACK_COLLECTIONS,
  ) as FallbackCollection[]) {
    const { dir } = FALLBACK_COLLECTIONS[collection];
    for (const page of walkPages(path.join(docsRoot, dir)).sort()) {
      for (const loc of MINTLIFY_LOCALES) {
        if (!pageExists(docsRoot, `${loc}/${dir}/${page}`)) {
          out.push({ loc, path: page, collection });
        }
      }
    }
  }
  return out;
}

function readGeneratedFallbacks(repoRoot: string): LocaleFallback[] {
  const file = path.join(
    repoRoot,
    "packages/docs-tooling/generated/locale-fallbacks.json",
  );
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as {
    fallbacks?: LocaleFallback[];
  };
  return (parsed.fallbacks ?? []).filter(
    (f) =>
      MINTLIFY_LOCALES.includes(f.loc) && f.collection in FALLBACK_COLLECTIONS,
  );
}

/** All fallbacks (filesystem ∪ generated file), deduplicated and sorted. */
export function loadLocaleFallbacks(
  repoRoot: string | null = findRepoRoot(),
): LocaleFallback[] {
  if (!repoRoot) return [];
  const docsRoot = path.join(repoRoot, "apps", "docs");
  const seen = new Map<string, LocaleFallback>();
  for (const f of [
    ...computeLocaleFallbacks(docsRoot),
    ...readGeneratedFallbacks(repoRoot),
  ]) {
    seen.set(`${f.collection}\0${f.loc}\0${f.path}`, f);
  }
  return [...seen.values()].sort(
    (a, b) =>
      a.collection.localeCompare(b.collection) ||
      a.path.localeCompare(b.path) ||
      a.loc.localeCompare(b.loc),
  );
}

/** "video-guides/index" -> "video-guides"; "index" -> "". */
export function pageToUrlPath(page: string) {
  if (page === "index") return "";
  return page.endsWith("/index") ? page.slice(0, -"/index".length) : page;
}

function escapeForPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface FallbackRewrite {
  source: string;
  destination: string;
  locale: false;
}

/**
 * Compiles fallbacks into a few rewrites instead of one per URL: pages are
 * grouped by the exact set of locales missing them, and each group becomes
 * `/:locale(a|b)/docs/:path(p1|p2)` plus its `.md` twin. Collection roots
 * (`index`) get their own exact rules.
 */
export function buildFallbackRewrites(
  fallbacks: LocaleFallback[],
  origin: string,
): FallbackRewrite[] {
  const byPage = new Map<string, Set<string>>();
  for (const f of fallbacks) {
    const key = `${f.collection}\0${pageToUrlPath(f.path)}`;
    if (!byPage.has(key)) byPage.set(key, new Set());
    byPage.get(key)!.add(f.loc);
  }

  const groups = new Map<
    string,
    { collection: FallbackCollection; locs: string[]; paths: string[] }
  >();
  for (const [key, locSet] of byPage) {
    const [collection, urlPath] = key.split("\0") as [
      FallbackCollection,
      string,
    ];
    const locs = [...locSet].sort();
    const groupKey = `${collection}\0${urlPath === "" ? "root" : "pages"}\0${locs.join("|")}`;
    if (!groups.has(groupKey))
      groups.set(groupKey, { collection, locs, paths: [] });
    groups.get(groupKey)!.paths.push(urlPath);
  }

  const rewrites: FallbackRewrite[] = [];
  for (const { collection, locs, paths } of groups.values()) {
    const { urlPrefix } = FALLBACK_COLLECTIONS[collection];
    const locale = `:locale(${locs.join("|")})`;
    if (paths.length === 1 && paths[0] === "") {
      rewrites.push(
        {
          source: `/${locale}${urlPrefix}`,
          destination: `${origin}${urlPrefix}`,
          locale: false,
        },
        {
          source: `/${locale}${urlPrefix}.md`,
          destination: `${origin}${urlPrefix}.md`,
          locale: false,
        },
      );
      continue;
    }
    // Longest first so a page never shadows a deeper page in the alternation.
    const alternation = [...paths]
      .sort((a, b) => b.length - a.length || a.localeCompare(b))
      .map(escapeForPattern)
      .join("|");
    rewrites.push(
      {
        source: `/${locale}${urlPrefix}/:path(${alternation})`,
        destination: `${origin}${urlPrefix}/:path`,
        locale: false,
      },
      {
        source: `/${locale}${urlPrefix}/:path(${alternation}).md`,
        destination: `${origin}${urlPrefix}/:path.md`,
        locale: false,
      },
    );
  }
  return rewrites;
}
