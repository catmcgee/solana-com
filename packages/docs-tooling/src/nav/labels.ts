/**
 * Tab and group labels for the locale navigations (spec §2.3 item 3).
 *
 * en.json holds the English strings (the docs read it directly, so it cannot
 * hold placeholder ids). Each tab/group gets a stable key derived from its
 * position in the label hierarchy: slug(tab) "." slug(group) "." ...,
 * with "~2", "~3" for siblings that share a slug. `labels/en.json` maps
 * key -> English and is the Lingo source; `labels/<loc>.json` is the Lingo
 * target (seeded once from the legacy locale meta.json titles and the
 * developers.nav.* UI strings). A key missing from a locale file falls back
 * to English and is listed in generated/untranslated.json.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "../lib/paths.ts";
import type { NavEntry, NavFile, NavGroup, NavTab } from "./types.ts";
import { isGroup } from "./types.ts";

export function slug(s: string): string {
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

export interface LabelSite {
  key: string;
  en: string;
  node: NavTab | NavGroup;
}

/** Every tab/group label with its key, in document order. */
export function labelSites(nav: NavFile): LabelSite[] {
  const out: LabelSite[] = [];
  const uniq = (parent: string, label: string, seen: Map<string, number>) => {
    const base = slug(label);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const own = n === 1 ? base : `${base}~${n}`;
    return parent ? `${parent}.${own}` : own;
  };
  const walkEntries = (entries: NavEntry[], parent: string) => {
    const seen = new Map<string, number>();
    for (const e of entries) {
      if (!isGroup(e)) continue;
      const key = uniq(parent, e.group, seen);
      out.push({ key, en: e.group, node: e });
      walkEntries(e.pages, key);
    }
  };
  const tabSeen = new Map<string, number>();
  for (const t of nav.tabs) {
    const key = uniq("", t.tab, tabSeen);
    out.push({ key, en: t.tab, node: t });
    walkEntries([...(t.groups ?? []), ...(t.pages ?? [])], key);
  }
  return out;
}

export type LabelMap = Record<string, string>;

/** Sorted key -> English map (labels/en.json). */
export function englishLabels(nav: NavFile): LabelMap {
  const m: LabelMap = {};
  for (const s of labelSites(nav)) m[s.key] = s.en;
  return sortKeys(m);
}

export function sortKeys<T>(m: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(m).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

// ---------------------------------------------------------------------------
// UI message strings (developers.nav.*)
// ---------------------------------------------------------------------------

const messageCache = new Map<string, Record<string, string>>();

/** packages/i18n/messages/web/<loc>/common.json developers.nav. */
export function devNavMessages(
  loc: string,
  root: string = repoRoot,
): Record<string, string> {
  const k = `${root}\0${loc}`;
  if (messageCache.has(k)) return messageCache.get(k)!;
  const file = path.join(
    root,
    "packages/i18n/messages/web",
    loc,
    "common.json",
  );
  let nav: Record<string, string> = {};
  if (existsSync(file)) {
    const json = JSON.parse(readFileSync(file, "utf8")) as {
      developers?: { nav?: Record<string, string> };
    };
    nav = json.developers?.nav ?? {};
  }
  messageCache.set(k, nav);
  return nav;
}
