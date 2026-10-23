/**
 * verify-nav: exact navigation coverage.
 *
 * Errors (fail the run):
 * - a nav entry (page, group root, internal tab href) has no file;
 * - an English page is in en.json zero times or more than once
 *   (UNLISTED pages excepted);
 * - a locale page is in its locale nav zero times or more than once, or a
 *   locale nav references another locale's page;
 * - a locale nav points at the English page although the translation exists
 *   (run `nav build` / `nav swap`);
 * - a locale nav's structure differs from en.json;
 * - generated files (locale navs, labels/en.json, untranslated.json,
 *   locale-fallbacks.json, docs.json navigation) are stale.
 *
 * Reported, not failing (decisions.md): untranslated pages and labels, stale
 * keys in labels/<loc>.json.
 */
import path from "node:path";
import { DEFAULT_LOCALE, TARGET_LOCALES } from "../lib/locales.ts";
import {
  internalPath,
  navPaths,
  readEnNav,
  readJson,
  runBuild,
} from "./build-locale-nav.ts";
import { englishLabels, type LabelMap } from "./labels.ts";
import { langOf, loadInventory, pageForUrl, stripLocale } from "./pages.ts";
import type { NavEntry, NavFile, NavPage } from "./types.ts";
import { isGroup } from "./types.ts";
import { isUnlisted } from "./unlisted.ts";

export interface VerifyNavResult {
  errors: string[];
  warnings: string[];
  info: string[];
  counts: Record<
    string,
    { files: number; navEntries: number; english: number }
  >;
}

/** All page references of a nav (pages + roots), in order. */
export function navPageRefs(nav: NavFile): NavPage[] {
  const out: NavPage[] = [];
  const walk = (entries: NavEntry[]) => {
    for (const e of entries) {
      if (typeof e === "string") out.push(e);
      else if (isGroup(e)) {
        if (e.root) out.push(e.root);
        walk(e.pages);
      }
    }
  };
  for (const t of nav.tabs) {
    for (const g of t.groups ?? []) {
      if (g.root) out.push(g.root);
      walk(g.pages);
    }
    walk(t.pages ?? []);
  }
  return out;
}

/** Structure fingerprint: nav with pages and labels erased. */
function shape(nav: NavFile): string {
  const g = (e: NavEntry): unknown =>
    isGroup(e)
      ? {
          r: e.root ? 1 : 0,
          p: e.pages.map(g),
          x: [e.expanded, e.hidden, e.searchable, e.directory],
        }
      : typeof e === "string"
        ? 0
        : { l: e.href };
  return JSON.stringify(
    nav.tabs.map((t) => ({
      h: t.href ? 1 : 0,
      x: [t.icon, t.align, t.hidden, t.searchable],
      g: (t.groups ?? []).map(g),
      p: (t.pages ?? []).map(g),
    })),
  );
}

export interface VerifyNavOptions {
  docsRoot?: string;
  locales?: readonly string[];
}

export function verifyNav(opts: VerifyNavOptions = {}): VerifyNavResult {
  const paths = navPaths(opts.docsRoot);
  const locales = opts.locales ?? TARGET_LOCALES;
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];
  const counts: VerifyNavResult["counts"] = {};
  const inv = loadInventory(paths.docsRoot);
  const en = readEnNav(paths);
  const enShape = shape(en);

  const check = (loc: string, nav: NavFile) => {
    const files = inv.byLang.get(loc) ?? new Set<NavPage>();
    const refs = navPageRefs(nav);
    const seen = new Map<NavPage, number>();
    let english = 0;
    for (const r of refs) {
      seen.set(r, (seen.get(r) ?? 0) + 1);
      if (!inv.all.has(r)) errors.push(`${loc}: nav entry "${r}" has no file`);
      const l = langOf(r);
      if (loc === DEFAULT_LOCALE) {
        if (l !== DEFAULT_LOCALE)
          errors.push(`en: nav references locale page "${r}"`);
      } else if (l === DEFAULT_LOCALE) {
        english++;
        if (files.has(`${loc}/${r}`))
          errors.push(
            `${loc}: "${r}" points at English but ${loc}/${r} exists (run nav build)`,
          );
      } else if (l !== loc) {
        errors.push(`${loc}: nav references another locale's page "${r}"`);
      }
    }
    for (const [r, n] of seen)
      if (n > 1) errors.push(`${loc}: "${r}" appears ${n} times`);
    for (const f of files) {
      if (seen.has(f)) continue;
      const bare = stripLocale(f);
      if (isUnlisted(bare, loc)) continue;
      errors.push(`${loc}: page "${f}" is in no nav entry`);
    }
    for (const t of nav.tabs) {
      const local = t.href ? internalPath(t.href) : undefined;
      if (local === undefined) continue;
      if (!pageForUrl(local, inv.all))
        errors.push(`${loc}: tab "${t.tab}" href ${t.href} has no page`);
    }
    if (loc !== DEFAULT_LOCALE && shape(nav) !== enShape)
      errors.push(`${loc}: structure differs from en.json (run nav build)`);
    counts[loc] = { files: files.size, navEntries: refs.length, english };
  };

  check(DEFAULT_LOCALE, en);

  for (const loc of locales) {
    const nav = readJson<NavFile>(path.join(paths.navDir, `${loc}.json`));
    if (!nav) {
      errors.push(`${loc}: navigation/${loc}.json is missing (run nav build)`);
      continue;
    }
    check(loc, nav);
    const labels =
      readJson<LabelMap>(path.join(paths.labelsDir, `${loc}.json`)) ?? {};
    const enLabels = englishLabels(en);
    const stale = Object.keys(labels).filter((k) => !(k in enLabels));
    if (stale.length)
      warnings.push(
        `${loc}: ${stale.length} label key(s) no longer in en.json: ${stale.slice(0, 5).join(", ")}${stale.length > 5 ? ", …" : ""}`,
      );
  }

  // Generated files are fresh.
  const build = runBuild({ docsRoot: paths.docsRoot, check: true, locales });
  for (const f of build.stale)
    errors.push(
      `stale generated file: ${path.relative(paths.docsRoot, f)} (run nav build)`,
    );

  // Reported lists.
  const u = build.untranslated;
  const missing = u.pages.filter((p) => p.reason === "missing-translation");
  const byPage = new Map<string, number>();
  for (const p of missing) byPage.set(p.page, (byPage.get(p.page) ?? 0) + 1);
  const notInLingo = new Set(
    u.pages.filter((p) => p.reason === "not-in-lingo").map((p) => p.page),
  );
  info.push(
    `untranslated (English fallback, reported not failing): ${missing.length} page entries across ${locales.length} locales (${byPage.size} distinct pages), ${u.pages.filter((p) => p.reason === "english-only").length} english-only cookbook entries, ${u.labels.length} labels`,
  );
  if (notInLingo.size)
    warnings.push(
      `${notInLingo.size} page(s) are excluded from the docs Lingo project, so no locale will get them: ${[...notInLingo].join(", ")}`,
    );

  return { errors, warnings, info, counts };
}
