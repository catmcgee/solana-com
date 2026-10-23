/**
 * cross-tab-cards (2026-10-16): a `<Card>` on a job tab (Payments, Assets,
 * Markets) that links to a page filed under another tab gets the docs
 * `arrow` prop, a small diagonal ↗ in the card's top-right corner, so readers
 * know the card leaves the tab they are in. Example: the Payments overview
 * links to Kora and Commerce Kit, which live under Resources › Tools.
 *
 * The tab of a page comes from `navigation/en.json` (a page, or a group
 * `root`); locale pages use the tab of their English page. The docs render
 * the arrow on the server as an inline SVG in the card's text colour, so it
 * shows in light and dark mode and without JavaScript.
 *
 * Only adds the prop (never removes one an author set). Re-run `convert`
 * after moving pages between tabs; `convert --check` (in `verify`) fails
 * while a card is missing its arrow.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AstNode, Transform } from "../../types.ts";
import { LEGACY_LOCALES } from "../../lib/locales.ts";
import { attr, findAttr, isJsx, strAttr, walk } from "./_mdx.ts";

/** Tabs whose cards are marked when they leave the tab. */
export const JOB_TABS = ["Payments", "Assets", "Markets"] as const;

const LOCALES = LEGACY_LOCALES.filter((l) => l !== "en");
const LOCALE_PREFIX = new RegExp(`^(?:${LOCALES.join("|")})/`);

interface NavNode {
  tab?: string;
  root?: string;
  groups?: unknown[];
  pages?: unknown[];
}

/** English nav page (`developers/docs/x/index`) -> tab name. */
export function pageTabs(nav: { tabs: NavNode[] }): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (n: unknown, tab: string) => {
    if (typeof n === "string") {
      out.set(n, tab);
      return;
    }
    if (!n || typeof n !== "object") return;
    const node = n as NavNode;
    if (node.root) out.set(node.root, tab);
    for (const c of [...(node.groups ?? []), ...(node.pages ?? [])])
      visit(c, tab);
  };
  for (const t of nav.tabs) if (t.tab) visit(t, t.tab);
  return out;
}

let cached: { root: string; tabs: Map<string, string> } | undefined;
function tabsFor(repoRoot: string) {
  if (cached?.root !== repoRoot) {
    const nav = JSON.parse(
      readFileSync(
        path.join(repoRoot, "apps", "docs", "navigation", "en.json"),
        "utf8",
      ),
    ) as { tabs: NavNode[] };
    cached = { root: repoRoot, tabs: pageTabs(nav) };
  }
  return cached.tabs;
}

/** Tab of an English page path, trying `<p>` then `<p>/index`. */
export function tabOf(tabs: Map<string, string>, page: string) {
  const p = page.replace(/\/$/, "");
  return tabs.get(p) ?? tabs.get(`${p}/index`);
}

/** The English nav page of a repo-relative page file. */
export function filePage(file: string) {
  return file
    .replace(/^apps\/docs\//, "")
    .replace(LOCALE_PREFIX, "")
    .replace(/\.mdx?$/, "");
}

/** The English nav page an href points at, or undefined if not a docs page. */
export function hrefPage(href: string) {
  if (!href.startsWith("/") || href.startsWith("//")) return undefined;
  const bare = href.split(/[?#]/)[0]!.replace(/^\//, "");
  return bare.replace(LOCALE_PREFIX, "") || undefined;
}

export const transform: Transform = {
  name: "cross-tab-cards",
  order: 310,
  appliesTo: (source, file) =>
    file.collection === "docs" && source.includes("<Card"),
  run(tree, file, ctx) {
    const tabs = tabsFor(ctx.repoRoot);
    const own = tabOf(tabs, filePage(file.path));
    if (!own || !(JOB_TABS as readonly string[]).includes(own)) return;
    walk(tree, (n: AstNode) => {
      if (!isJsx(n, "Card")) return;
      const href = strAttr(n, "href");
      const target = href && hrefPage(href);
      if (!target) return;
      const theirs = tabOf(tabs, target);
      if (!theirs || theirs === own || findAttr(n, "arrow")) return;
      n.attributes.push(attr("arrow", true));
    });
  },
};
