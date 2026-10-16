/**
 * Page inventory of the Mintlify project (apps/docs), by language.
 *
 * A "page" is an .mdx/.md file outside snippets/, written as its path relative
 * to apps/docs without the extension (Mintlify's navigation format).
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { DEFAULT_LOCALE, TARGET_LOCALES } from "../lib/locales.ts";
import { docsRoot } from "../lib/paths.ts";
import type { NavPage } from "./types.ts";

/** Top-level folders of the English collections. */
export const EN_COLLECTION_DIRS = ["developers", "learn"] as const;

/** Folders under apps/docs that never hold pages. */
const NON_PAGE_DIRS = new Set([
  "snippets",
  "navigation",
  "docs-assets",
  "node_modules",
  "styles",
  "concepts",
  "paths",
]);

function walk(dir: string, rel: string, out: NavPage[]) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".") || name.startsWith("_")) continue;
    const abs = path.join(dir, name);
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(abs).isDirectory()) {
      walk(abs, r, out);
    } else if (/\.mdx?$/.test(name) && !/^README\.md$/i.test(name)) {
      out.push(r.replace(/\.mdx?$/, ""));
    }
  }
}

export interface PageInventory {
  /** lang -> pages. "en" holds docs/, developers/, learn/. */
  byLang: Map<string, Set<NavPage>>;
  /** Every page in the project (all languages). */
  all: Set<NavPage>;
}

export function loadInventory(root: string = docsRoot): PageInventory {
  const byLang = new Map<string, Set<NavPage>>();
  const en: NavPage[] = [];
  for (const d of EN_COLLECTION_DIRS) walk(path.join(root, d), d, en);
  byLang.set(DEFAULT_LOCALE, new Set(en));
  for (const loc of TARGET_LOCALES) {
    const pages: NavPage[] = [];
    if (existsSync(path.join(root, loc)))
      walk(path.join(root, loc), loc, pages);
    byLang.set(loc, new Set(pages));
  }
  const all = new Set<NavPage>();
  for (const s of byLang.values()) for (const p of s) all.add(p);
  // Top-level pages outside every collection (should not exist; verify flags
  // them).
  for (const name of existsSync(root) ? readdirSync(root) : []) {
    if (/\.mdx?$/.test(name) && !/^(README|CONTRIBUTING)\.md$/i.test(name))
      all.add(name.replace(/\.mdx?$/, ""));
    else if (
      !name.startsWith(".") &&
      !NON_PAGE_DIRS.has(name) &&
      !EN_COLLECTION_DIRS.includes(name as never) &&
      !TARGET_LOCALES.includes(name) &&
      statSync(path.join(root, name)).isDirectory()
    ) {
      const stray: NavPage[] = [];
      walk(path.join(root, name), name, stray);
      for (const p of stray) all.add(p);
    }
  }
  return { byLang, all };
}

/**
 * Language of a page path ("ja/developers/docs/x" -> "ja",
 * "developers/docs/x" -> "en").
 */
export function langOf(page: NavPage): string {
  const first = page.split("/")[0]!;
  return TARGET_LOCALES.includes(first) ? first : DEFAULT_LOCALE;
}

/** Strip the locale prefix ("ja/developers/docs/x" -> "developers/docs/x"). */
export function stripLocale(page: NavPage): NavPage {
  const lang = langOf(page);
  return lang === DEFAULT_LOCALE ? page : page.slice(lang.length + 1);
}

/** Locale copy of an English page path. */
export function localize(page: NavPage, loc: string): NavPage {
  return loc === DEFAULT_LOCALE ? page : `${loc}/${page}`;
}

/** Collection of an English page path. */
export function collectionOf(
  page: NavPage,
): "docs" | "cookbook" | "bootcamp" | "learn" | "other" {
  if (page.startsWith("developers/docs/")) return "docs";
  if (page.startsWith("developers/cookbook/") || page === "developers/cookbook")
    return "cookbook";
  if (page.startsWith("developers/bootcamp/")) return "bootcamp";
  if (page.startsWith("learn/")) return "learn";
  return "other";
}

/**
 * Public URL path of a page ("developers/docs/core/index" ->
 * "/developers/docs/core").
 */
export function urlOf(page: NavPage): string {
  return "/" + page.replace(/(^|\/)index$/, "").replace(/\/$/, "");
}

/**
 * Page that serves an internal URL ("/developers/docs/video-guides" ->
 * "developers/docs/video-guides/index"), or undefined.
 */
export function pageForUrl(
  url: string,
  pages: ReadonlySet<NavPage>,
): NavPage | undefined {
  const p = url.replace(/^\//, "").replace(/\/$/, "");
  if (pages.has(p)) return p;
  if (pages.has(`${p}/index`)) return `${p}/index`;
  return undefined;
}
