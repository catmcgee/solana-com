/**
 * The docs header and footer, as shown on the /developers landing
 * (apps/web/src/app/(docs)/[locale]/developers/docs-header.tsx, docs-footer.tsx).
 *
 * Everything here is read at build time from the docs content (apps/docs),
 * so the landing cannot drift from the docs:
 * - tabs, their order, icons and first pages: apps/docs/navigation/en.json
 *   (hidden tabs are skipped, as in the docs);
 * - tab labels per locale: apps/docs/navigation/labels/<loc>.json, keyed the
 *   way docs-tooling keys them (slug of the English tab name; see
 *   packages/docs-tooling/src/nav/labels.ts), falling back to English;
 * - the search prompt and the footer columns and socials: apps/docs/docs.json.
 * Hrefs are localized with `localizedHref`, like the rest of the landing.
 */
import docsConfig from "../../../../docs/docs.json";
import enNav from "../../../../docs/navigation/en.json";
import ar from "../../../../docs/navigation/labels/ar.json";
import de from "../../../../docs/navigation/labels/de.json";
import en from "../../../../docs/navigation/labels/en.json";
import es from "../../../../docs/navigation/labels/es.json";
import fi from "../../../../docs/navigation/labels/fi.json";
import fr from "../../../../docs/navigation/labels/fr.json";
import id from "../../../../docs/navigation/labels/id.json";
import it from "../../../../docs/navigation/labels/it.json";
import ja from "../../../../docs/navigation/labels/ja.json";
import ko from "../../../../docs/navigation/labels/ko.json";
import nl from "../../../../docs/navigation/labels/nl.json";
import pl from "../../../../docs/navigation/labels/pl.json";
import pt from "../../../../docs/navigation/labels/pt.json";
import ru from "../../../../docs/navigation/labels/ru.json";
import tr from "../../../../docs/navigation/labels/tr.json";
import uk from "../../../../docs/navigation/labels/uk.json";
import vi from "../../../../docs/navigation/labels/vi.json";
import zh from "../../../../docs/navigation/labels/zh.json";
import { localizedHref } from "./hub";

const LABELS: Record<string, Record<string, string>> = {
  ar,
  de,
  en,
  es,
  fi,
  fr,
  id,
  it,
  ja,
  ko,
  nl,
  pl,
  pt,
  ru,
  tr,
  uk,
  vi,
  zh,
};

/** Lucide icon names used by the docs tabs (navigation/en.json `icon`). */
export type DocsTabIcon =
  | "house"
  | "credit-card"
  | "layers"
  | "chart-line"
  | "box"
  | "wrench"
  | "book"
  | "play";

export type DocsTab = {
  /** Label key, e.g. "payments" (slug of the English tab name). */
  key: string;
  label: string;
  href: string;
  icon: DocsTabIcon;
  /** Pushed to the far end of the bar (navigation `align: "end"`). */
  alignEnd: boolean;
};

type NavNode = {
  tab?: string;
  icon?: string;
  hidden?: boolean;
  align?: string;
  href?: string;
  pages?: unknown[];
  groups?: unknown[];
  group?: string;
};

/** Same slug as packages/docs-tooling/src/nav/labels.ts. */
export function labelSlug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "x"
  );
}

/**
 * First page of a tab, as the docs tab bar links it
 * ("developers/docs/payments/index" -> "/developers/docs/payments").
 */
function firstPage(node: unknown): string | null {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") return null;
  const n = node as NavNode;
  if (n.href) return n.href;
  for (const list of [n.groups, n.pages]) {
    for (const child of list ?? []) {
      const page = firstPage(child);
      if (page) return page;
    }
  }
  return null;
}

function pageToHref(page: string): string {
  if (/^https?:\/\//.test(page)) return page;
  const path = `/${page.replace(/^\/+/, "")}`.replace(/\/index$/, "");
  return path || "/";
}

const EN_TABS = (enNav.tabs as NavNode[])
  .filter((tab) => !tab.hidden && tab.tab)
  .map((tab) => {
    const page = firstPage(tab);
    if (!page) throw new Error(`docs tab "${tab.tab}" has no pages`);
    return {
      key: labelSlug(tab.tab!),
      english: tab.tab!,
      href: pageToHref(page),
      icon: (tab.icon ?? "book") as DocsTabIcon,
      alignEnd: tab.align === "end",
    };
  });

/**
 * Tabs after which the docs header draws a hairline divider (apps/docs
 * styles/theme.css section 5: after the 4th tab, Markets).
 */
export const DOCS_TAB_DIVIDER_AFTER = 3;

export function getDocsTabs(locale: string): DocsTab[] {
  const labels = LABELS[locale] ?? LABELS.en;
  return EN_TABS.map(({ english, ...tab }) => ({
    ...tab,
    label: labels[tab.key] ?? english,
    href: localizedHref(locale, tab.href),
  }));
}

/** Placeholder of the docs search field (docs.json `search.prompt`). */
export const DOCS_SEARCH_PROMPT: string = docsConfig.search.prompt;

/**
 * Where the /developers search field sends readers. The docs search
 * (components/docs) opens on arrival and types `query`.
 */
export function docsSearchHref(locale: string, query = ""): string {
  const docs = localizedHref(locale, "/developers/docs");
  const q = query.trim();
  return q ? `${docs}?q=${encodeURIComponent(q)}` : `${docs}?search=1`;
}

const SITE_ORIGIN = /^https:\/\/solana\.com(?=\/|$)/;

export type FooterColumn = {
  header: string;
  items: { label: string; href: string }[];
};

/** Footer link columns from docs.json, with solana.com links made relative. */
export function getDocsFooterColumns(locale: string): FooterColumn[] {
  return docsConfig.footer.links.map((column) => ({
    header: column.header,
    items: column.items.map((item) => {
      const relative = item.href.replace(SITE_ORIGIN, "") || "/";
      return {
        label: item.label,
        href: relative.startsWith("/")
          ? localizedHref(locale, relative)
          : item.href,
      };
    }),
  }));
}

export type FooterSocial = { id: string; href: string };

/** Footer social links from docs.json, in docs order. */
export const DOCS_FOOTER_SOCIALS: FooterSocial[] = Object.entries(
  docsConfig.footer.socials,
).map(([id, href]) => ({ id, href }));
