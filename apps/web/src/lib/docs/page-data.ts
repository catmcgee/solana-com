import { defaultLocale } from "@workspace/i18n/config";
import { flattenTree, type Item } from "fumadocs-core/page-tree";
import { getBreadcrumbItems } from "fumadocs-core/breadcrumb";
import { docsSource, type DocsPage } from "./source";
import {
  getDocsNavigation,
  type DocsNavigation,
  type NavTab,
  type PageLocation,
} from "./navigation";
import { DOCS_LOCALES } from "./locales.mjs";

/** Frontmatter fields the docs use (source.config.ts schema). */
export interface DocsFrontmatter {
  title: string;
  description?: string;
  sidebarTitle?: string;
  mode?: string;
  hideFooterPagination?: boolean;
  noindex?: boolean;
  keywords?: string[];
  url?: string;
  [key: string]: unknown;
}

export function frontmatter(page: DocsPage): DocsFrontmatter {
  return page.data as unknown as DocsFrontmatter;
}

export interface ResolvedDocsPage {
  page: DocsPage;
  /** Locale of the URL. */
  locale: string;
  /** Locale of the content and chrome (English for fallbacks). */
  contentLocale: string;
  /** Public path requested (no trailing /index). */
  path: string;
  nav: DocsNavigation;
  location?: PageLocation;
  tab?: NavTab;
}

/** "/ar/developers/docs/x/index" -> { locale: "ar", slugs: [...] } */
export function resolveDocsPage(
  locale: string,
  slugs: string[],
): ResolvedDocsPage | null {
  const clean = slugs.map((s) => decodeURIComponent(s));
  if (clean.at(-1) === "index") clean.pop();
  if (locale !== defaultLocale && !DOCS_LOCALES.includes(locale)) return null;
  const page = docsSource.getPage(clean, locale);
  if (!page) return null;
  const contentLocale = page.locale ?? defaultLocale;
  const nav = getDocsNavigation(contentLocale);
  const location = nav.byUrl.get(page.url);
  return {
    page,
    locale,
    contentLocale,
    path: `${locale === defaultLocale ? "" : `/${locale}`}/${clean.join("/")}`,
    nav,
    location,
    tab: location?.tab,
  };
}

/** Group titles above the page (the eyebrow / breadcrumb). */
export function breadcrumbs(resolved: ResolvedDocsPage): string[] {
  const { tab, page } = resolved;
  if (!tab) return [];
  return getBreadcrumbItems(page.url, tab.tree)
    .map((item) => (typeof item.name === "string" ? item.name : ""))
    .filter(Boolean);
}

/** Previous/next page within the page's tab, in nav order. */
export function neighbours(resolved: ResolvedDocsPage): {
  previous?: Item;
  next?: Item;
} {
  const { tab, page } = resolved;
  if (!tab) return {};
  const list = flattenTree(tab.tree.children).filter((item) => !item.external);
  const index = list.findIndex((item) => item.url === page.url);
  if (index === -1) return {};
  return { previous: list[index - 1], next: list[index + 1] };
}

/** Every English page (static params), with and without nothing else. */
export function englishPages(prefix: string[]): string[][] {
  return docsSource
    .getPages(defaultLocale)
    .filter((page) => prefix.every((p, i) => page.slugs[i] === p))
    .map((page) => page.slugs.slice(prefix.length));
}

export function markdownPath(path: string): string {
  return `${path.replace(/\/$/, "")}.md`;
}
