/**
 * Pure path rules mapping the legacy Fumadocs content tree (read from git at
 * LEGACY_REF) to its URLs and to the current apps/docs layout. Used by the
 * legacy URL parity check (verify-urls.ts).
 */
import type { Collection } from "../types.ts";
import { DEFAULT_LOCALE } from "../lib/locales.ts";

export const CONTENT_PREFIX = "apps/docs/content/";
export const DOCS_PREFIX = "apps/docs/";

/** Public URL prefix of each collection. */
export const COLLECTION_BASE: Record<Collection, string> = {
  docs: "/docs",
  cookbook: "/developers/cookbook",
  bootcamp: "/developers/bootcamp",
  learn: "/learn",
};

/**
 * Public URL prefix (= folder under apps/docs) of each collection in the
 * CURRENT layout. The docs moved from /docs to /developers/docs on
 * 2026-10-16; apps/web redirects every /docs URL (and its locale twins).
 * COLLECTION_BASE above stays the legacy (Fumadocs) URL prefix.
 */
export const LAYOUT_BASE: Record<Collection, string> = {
  ...COLLECTION_BASE,
  docs: "/developers/docs",
};

/** Legacy content folder of each collection. */
export const COLLECTION_DIR: Record<Collection, string> = {
  docs: "docs",
  cookbook: "cookbook",
  bootcamp: "developers-learn",
  learn: "learn",
};

export interface LegacyEntry {
  collection: Collection;
  /** "en" for the English source; cookbook is always "en". */
  locale: string;
  /** Path below the locale folder, e.g. "core/accounts/index.mdx". */
  rel: string;
}

/** Parse `apps/docs/content/...` into collection/locale/rel. */
export function parseLegacyPath(repoPath: string): LegacyEntry | null {
  if (!repoPath.startsWith(CONTENT_PREFIX)) return null;
  const rest = repoPath.slice(CONTENT_PREFIX.length);
  const [top, ...parts] = rest.split("/");
  if (top === "cookbook") {
    return {
      collection: "cookbook",
      locale: DEFAULT_LOCALE,
      rel: parts.join("/"),
    };
  }
  const collection = (
    { docs: "docs", "developers-learn": "bootcamp", learn: "learn" } as const
  )[top as "docs" | "developers-learn" | "learn"];
  if (!collection || parts.length < 2) return null;
  const [locale, ...relParts] = parts;
  return { collection, locale: locale!, rel: relParts.join("/") };
}

export const isMdx = (rel: string) => rel.endsWith(".mdx");

/** "core/accounts/index.mdx" -> "/core/accounts"; "index.mdx" -> "". */
export function routeSuffix(rel: string): string {
  const noExt = rel.replace(/\.mdx$/, "");
  if (noExt === "index") return "";
  return "/" + noExt.replace(/\/index$/, "");
}

export function localePrefix(locale: string) {
  return locale === DEFAULT_LOCALE ? "" : `/${locale}`;
}

/** Public URL a legacy MDX file is served at. */
export function legacyUrl(entry: LegacyEntry): string {
  return (
    localePrefix(entry.locale) +
    COLLECTION_BASE[entry.collection] +
    routeSuffix(entry.rel)
  );
}

/**
 * New repo-relative path under apps/docs (R1-R7, R9). Folder layout mirrors
 * the public URL (no base path), so each file serves its own URL.
 * Docs files are under developers/docs (LAYOUT_BASE), so their URL changed:
 * apps/web redirects the legacy /docs URL.
 */
export function newPath(entry: LegacyEntry): string {
  const lp = entry.locale === DEFAULT_LOCALE ? "" : `${entry.locale}/`;
  const base = LAYOUT_BASE[entry.collection].slice(1); // drop leading "/"
  return `${DOCS_PREFIX}${lp}${base}/${entry.rel}`;
}

/** Repo-relative legacy path for an entry. */
export function legacyPath(entry: LegacyEntry): string {
  if (entry.collection === "cookbook") {
    return `${CONTENT_PREFIX}cookbook/${entry.rel}`;
  }
  return `${CONTENT_PREFIX}${COLLECTION_DIR[entry.collection]}/${entry.locale}/${entry.rel}`;
}

/**
 * The files in the NEW layout that would serve a URL, if the URL is in a
 * docs namespace (folder layout = URL). Returns both candidates
 * (`x.mdx`, `x/index.mdx`); callers check which exist.
 */
export function candidateFilesForUrl(url: string): string[] {
  const clean = url.replace(/\/+$/, "");
  const rel = clean.replace(/^\//, "");
  if (!rel) return [];
  return [`${DOCS_PREFIX}${rel}.mdx`, `${DOCS_PREFIX}${rel}/index.mdx`];
}
