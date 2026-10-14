/**
 * Fumadocs frontmatter -> Mintlify frontmatter (spec §3.3, decisions.md).
 *
 * | legacy                    | Mintlify                                       |
 * | ------------------------- | ---------------------------------------------- |
 * | `title` + `h1`            | `title: <h1>` (visible H1, browser title),     |
 * |                           | `sidebarTitle: <title>` (nav label)            |
 * | `seoTitle`                | `"og:title"` and `"twitter:title"` (spec §3.3)  |
 * |                           | = <seoTitle>                                   |
 * | `hideTableOfContents: true` | `mode: "wide"` (`false` is dropped)          |
 * | `hidePageNavigation: true`  | `hideFooterPagination: true`                 |
 * | `draft`                   | dropped: drafts were published and indexed     |
 * |                           | before, and decisions.md keeps that behaviour  |
 * |                           | (payments/accept-payments/solana-pay)          |
 * | `url`                     | dropped when it equals the file's URL; kept    |
 * |                           | (Mintlify external link) and reported if not   |
 * | `index`                   | dropped (WP6 maps it to nav `directory`)       |
 * | `type`                    | normalized to conceptual/reference/tutorial/   |
 * |                           | guide (translated values mapped)               |
 * | everything else           | kept (`description`, `keywords`, `related`,    |
 * |                           | `prerequisites`, `date`, `tags`, …)            |
 *
 * Known loss: the legacy `<title>` was `seoTitle || h1 || title`. Mintlify
 * builds `<title>` from `title` only ("Title - Site"), so pages with a
 * `seoTitle` keep it for `og:title`/`twitter:title` but their browser/search
 * title becomes the H1. See the report for the list.
 *
 * Only `file.frontmatter` is edited; the codec writes back changed keys and
 * keeps the rest of the YAML as authored.
 */
import type { Transform } from "../../types.ts";

export const TYPE_MAP: Readonly<Record<string, string>> = {
  conceptual: "conceptual",
  concept: "conceptual",
  conceptuel: "conceptual",
  conceptuelle: "conceptual",
  konzeptionell: "conceptual",
  reference: "reference",
  référence: "reference",
  referencja: "reference",
  referencia: "reference",
  referenz: "reference",
  tutorial: "tutorial",
  tutoriel: "tutorial",
  "درس تعليمي": "tutorial",
  guide: "guide",
  guía: "guide",
  leitfaden: "guide",
};

/** Public URL a content file is served at (index.mdx -> folder URL). */
export function urlForPath(repoPath: string): string {
  const rel = repoPath
    .replace(/^apps\/docs\//, "")
    .replace(/\.mdx?$/, "")
    .replace(/(^|\/)index$/, "");
  return `/${rel}`.replace(/\/$/, "") || "/";
}

function stripLocale(url: string, locale: string): string {
  return locale !== "en" && url.startsWith(`/${locale}/`)
    ? url.slice(locale.length + 1)
    : url;
}

const FM_KEYS =
  /^(h1|seoTitle|hideTableOfContents|hidePageNavigation|full|draft|index|url|type)\s*:/m;

const norm = (u: string) => u.replace(/[#?].*$/, "").replace(/\/+$/, "") || "/";

export const transform: Transform = {
  name: "frontmatter",
  order: 10,
  owner: "WP2",
  appliesTo: (source) => {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1];
    return !!fm && FM_KEYS.test(fm);
  },
  run(_tree, file, ctx) {
    const fm = file.frontmatter;
    const has = (k: string) => Object.prototype.hasOwnProperty.call(fm, k);
    const str = (v: unknown) =>
      typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();

    // title / h1 / sidebarTitle
    if (has("h1")) {
      const h1 = str(fm.h1);
      const title = str(fm.title);
      if (h1 && h1 !== title) {
        if (!has("sidebarTitle") && title) fm.sidebarTitle = fm.title;
        fm.title = h1;
      }
      delete fm.h1;
    }

    // seoTitle -> og:title
    if (has("seoTitle")) {
      const seo = str(fm.seoTitle);
      if (seo && seo !== str(fm.title)) {
        if (!has("og:title")) fm["og:title"] = seo;
        if (!has("twitter:title")) fm["twitter:title"] = seo;
      }
      delete fm.seoTitle;
    }

    // layout
    if (has("hideTableOfContents")) {
      if (fm.hideTableOfContents === true && !has("mode")) fm.mode = "wide";
      delete fm.hideTableOfContents;
    }
    if (has("hidePageNavigation")) {
      if (fm.hidePageNavigation === true) fm.hideFooterPagination = true;
      delete fm.hidePageNavigation;
    }
    if (has("full")) delete fm.full;

    // publishing
    if (has("draft")) delete fm.draft;
    if (has("index")) delete fm.index;

    // url: assert, then drop
    if (has("url")) {
      const declared = str(fm.url);
      const actual = urlForPath(file.path);
      const ok =
        !declared ||
        norm(declared) === norm(actual) ||
        norm(declared) === norm(stripLocale(actual, file.locale));
      if (ok) {
        delete fm.url;
      } else {
        // Kept: in Mintlify `url` makes the nav entry an external link,
        // which is what a deliberate mismatch (e.g. the tools/microscope
        // stub -> /microscope) means. Legacy pages have no mismatches.
        ctx.warn(
          `frontmatter url "${declared}" differs from the file URL "${stripLocale(actual, file.locale)}"; kept as a Mintlify external link`,
        );
      }
    }

    // type normalization
    if (has("type")) {
      const raw = str(fm.type);
      const mapped = TYPE_MAP[raw.toLowerCase()];
      if (mapped && mapped !== fm.type) {
        fm.type = mapped;
      } else if (!mapped) {
        ctx.warn(`frontmatter type "${raw}" is not a known page type`);
      }
    }
  },
};
