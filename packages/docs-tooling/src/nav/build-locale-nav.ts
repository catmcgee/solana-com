/**
 * navigation/<loc>.json from navigation/en.json (spec §2.3, decisions.md
 * "Update 2026-10-13: Lingo deferred").
 *
 * - Every locale keeps the full English IA.
 * - Page `P` becomes `<loc>/P` when that file exists. Otherwise the entry
 *   points at the English page `P` and is recorded in
 *   generated/untranslated.json (reason `missing-translation`, or
 *   `english-only` for the cookbook, which has no translations by design).
 *   The same page may appear in several language navs (the link goes to
 *   the English page).
 * - Tab/group labels come from navigation/labels/<loc>.json by key
 *   (labels.ts); a missing key falls back to English and is recorded.
 * - Internal tab `href`s are localized the same way.
 *
 * Re-running after Lingo has written new locale files swaps those entries to
 * the translated pages (see swap-translations.ts). Output is deterministic.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_LOCALE,
  NAV_LANGUAGE_CODE,
  TARGET_LOCALES,
} from "../lib/locales.ts";
import { docsRoot as defaultDocsRoot } from "../lib/paths.ts";
import type { LocaleFallback, LocaleFallbacksFile } from "../types.ts";
import { englishLabels, labelSites, type LabelMap } from "./labels.ts";
import { formatFiles, sameContent } from "./format.ts";
import {
  collectionOf,
  loadInventory,
  localize,
  pageForUrl,
  urlOf,
  type PageInventory,
} from "./pages.ts";
import type {
  NavEntry,
  NavFile,
  NavGroup,
  NavPage,
  NavTab,
  UntranslatedFile,
  UntranslatedLabel,
  UntranslatedPage,
} from "./types.ts";
import { isGroup } from "./types.ts";

export const GENERATED_BY =
  "packages/docs-tooling nav build (src/nav/build-locale-nav.ts); do not edit";

export interface NavPaths {
  docsRoot: string;
  navDir: string;
  labelsDir: string;
  generatedDir: string;
  docsJson: string;
}

export function navPaths(docsRoot: string = defaultDocsRoot): NavPaths {
  return {
    docsRoot,
    navDir: path.join(docsRoot, "navigation"),
    labelsDir: path.join(docsRoot, "navigation", "labels"),
    // Follows docsRoot so fixture projects never touch the real files
    // (apps/docs/../../packages/docs-tooling/generated).
    generatedDir: path.join(
      docsRoot,
      "..",
      "..",
      "packages",
      "docs-tooling",
      "generated",
    ),
    docsJson: path.join(docsRoot, "docs.json"),
  };
}

/** Origins whose paths are served by the docs. */
export const SITE_ORIGINS = ["https://solana.com"];

/** Path part of an href served by this project, or undefined. */
export function internalPath(href: string): string | undefined {
  if (href.startsWith("/")) return href;
  for (const o of SITE_ORIGINS)
    if (href === o || href.startsWith(`${o}/`))
      return href.slice(o.length) || "/";
  return undefined;
}

export const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

export function readJson<T>(file: string): T | undefined {
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as T)
    : undefined;
}

export function readEnNav(paths: NavPaths): NavFile {
  const nav = readJson<NavFile>(path.join(paths.navDir, "en.json"));
  if (!nav) throw new Error(`${path.join(paths.navDir, "en.json")} is missing`);
  return nav;
}

export interface LocaleBuild {
  loc: string;
  nav: NavFile;
  pages: UntranslatedPage[];
  labels: UntranslatedLabel[];
}

export function buildLocaleNav(
  en: NavFile,
  loc: string,
  inv: PageInventory,
  labels: LabelMap,
  /** Globs (apps/docs-relative) the docs Lingo project excludes. */
  lingoExcludes: readonly string[] = [],
): LocaleBuild {
  const have = inv.byLang.get(loc) ?? new Set<NavPage>();
  const enPages = inv.byLang.get(DEFAULT_LOCALE) ?? new Set<NavPage>();
  const keys = new Map<NavGroup | NavTab, string>();
  for (const s of labelSites(en)) keys.set(s.node, s.key);
  const pages: UntranslatedPage[] = [];
  const labelMisses: UntranslatedLabel[] = [];

  const page = (p: NavPage): NavPage => {
    const target = localize(p, loc);
    if (have.has(target)) return target;
    pages.push({
      loc,
      page: p,
      target,
      reason:
        collectionOf(p) === "cookbook"
          ? "english-only"
          : lingoExcludes.some((g) => path.matchesGlob(`${p}.mdx`, g))
            ? "not-in-lingo"
            : "missing-translation",
    });
    return p;
  };
  const label = (node: NavGroup | NavTab, en: string) => {
    const key = keys.get(node)!;
    const v = labels[key];
    if (v) return v;
    labelMisses.push({ loc, key, en });
    return en;
  };
  const href = (h: string) => {
    const local = internalPath(h);
    if (local === undefined) return h;
    const p = pageForUrl(local, enPages);
    if (!p || !have.has(localize(p, loc))) return h;
    return h.slice(0, h.length - local.length) + urlOf(localize(p, loc));
  };
  // External links are copied as they are (their titles are proper nouns).
  const entry = (e: NavEntry): NavEntry =>
    isGroup(e) ? group(e) : typeof e === "string" ? page(e) : { ...e };
  // Rebuild objects key by key so the output keeps en.json's key order.
  const group = (g: NavGroup): NavGroup => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(g)) {
      if (k === "group") out[k] = label(g, v as string);
      else if (k === "root") out[k] = page(v as NavPage);
      else if (k === "pages") out[k] = (v as NavEntry[]).map(entry);
      else out[k] = v;
    }
    return out as unknown as NavGroup;
  };
  const tabs = en.tabs.map((t): NavTab => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(t)) {
      if (k === "tab") out[k] = label(t, v as string);
      else if (k === "href") out[k] = href(v as string);
      else if (k === "groups") out[k] = (v as NavGroup[]).map(group);
      else if (k === "pages") out[k] = (v as NavEntry[]).map(entry);
      else out[k] = v;
    }
    return out as unknown as NavTab;
  });
  return { loc, nav: { tabs }, pages, labels: labelMisses };
}

/** The `navigation` value docs.json must carry. */
export function docsJsonNavigation(
  locales: readonly string[] = TARGET_LOCALES,
) {
  return {
    languages: [
      { language: "en", default: true, $ref: "./navigation/en.json" },
      ...locales.map((loc) => ({
        language: NAV_LANGUAGE_CODE[loc]!,
        $ref: `./navigation/${loc}.json`,
      })),
    ],
  };
}

export interface BuildResult {
  /** file -> expected content. */
  outputs: Map<string, string>;
  untranslated: UntranslatedFile;
  fallbacks: LocaleFallbacksFile;
  builds: LocaleBuild[];
  /** Files whose on-disk content differs from the expected output. */
  stale: string[];
}

export interface BuildOptions {
  docsRoot?: string;
  check?: boolean;
  locales?: readonly string[];
  /** Also rewrite docs.json `navigation` (default true). */
  wireDocsJson?: boolean;
}

export function runBuild(opts: BuildOptions = {}): BuildResult {
  const paths = navPaths(opts.docsRoot);
  const locales = opts.locales ?? TARGET_LOCALES;
  const en = readEnNav(paths);
  const inv = loadInventory(paths.docsRoot);
  const outputs = new Map<string, string>();

  outputs.set(path.join(paths.labelsDir, "en.json"), json(englishLabels(en)));
  const lingo = readJson<{ files?: { exclude?: string[] }[] }>(
    path.join(paths.docsRoot, ".lingo", "config.json"),
  );
  const lingoExcludes = (lingo?.files ?? []).flatMap((f) => f.exclude ?? []);
  const builds: LocaleBuild[] = [];
  for (const loc of locales) {
    const labels =
      readJson<LabelMap>(path.join(paths.labelsDir, `${loc}.json`)) ?? {};
    const b = buildLocaleNav(en, loc, inv, labels, lingoExcludes);
    builds.push(b);
    outputs.set(path.join(paths.navDir, `${loc}.json`), json(b.nav));
  }

  const summary: UntranslatedFile["summary"] = {};
  for (const b of builds)
    summary[b.loc] = {
      pages: b.pages.filter((p) => p.reason === "missing-translation").length,
      englishOnly: b.pages.filter((p) => p.reason === "english-only").length,
      notInLingo: b.pages.filter((p) => p.reason === "not-in-lingo").length,
      labels: b.labels.length,
    };
  const untranslated: UntranslatedFile = {
    generatedBy: GENERATED_BY,
    note: "Locale nav entries that point at the English page because the translation does not exist yet (decisions.md, Lingo deferred). `missing-translation` is Lingo work: after Lingo writes the files, run `pnpm --filter @workspace/docs-tooling nav:swap` to point the navs at them. `english-only` (cookbook) is English by design. `not-in-lingo` pages are excluded by apps/docs/.lingo/config.json (RPC reference) and need a policy decision.",
    summary,
    pages: builds.flatMap((b) => b.pages),
    labels: builds.flatMap((b) => b.labels),
  };
  outputs.set(
    path.join(paths.generatedDir, "untranslated.json"),
    json(untranslated),
  );

  const fallbacks: LocaleFallbacksFile = {
    generatedBy: GENERATED_BY,
    fallbacks: untranslated.pages
      .filter((p) => p.reason !== "english-only")
      .map((p): LocaleFallback | null => {
        const c = collectionOf(p.page);
        if (c === "docs")
          return {
            loc: p.loc,
            path: p.page.slice("developers/docs/".length),
            collection: "docs",
          };
        if (c === "bootcamp")
          return {
            loc: p.loc,
            path: p.page.slice("developers/bootcamp/".length),
            collection: "bootcamp",
          };
        if (c === "learn")
          return { loc: p.loc, path: p.page.slice(6), collection: "learn" };
        return null;
      })
      .filter((x): x is LocaleFallback => x !== null)
      .map((f) => ({ ...f, path: f.path.replace(/(^|\/)index$/, "") })),
  };
  outputs.set(
    path.join(paths.generatedDir, "locale-fallbacks.json"),
    json(fallbacks),
  );

  if (opts.wireDocsJson !== false && existsSync(paths.docsJson)) {
    const raw = readFileSync(paths.docsJson, "utf8");
    const docs = JSON.parse(raw) as Record<string, unknown>;
    const want = docsJsonNavigation(locales);
    if (JSON.stringify(docs.navigation) !== JSON.stringify(want)) {
      docs.navigation = want;
      outputs.set(paths.docsJson, json(docs));
    } else {
      outputs.set(paths.docsJson, raw);
    }
  }

  const stale: string[] = [];
  for (const [file, content] of outputs)
    if (!sameContent(file, content)) stale.push(file);
  if (!opts.check && stale.length) {
    for (const file of stale) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, outputs.get(file)!);
    }
    formatFiles(stale);
  }
  return { outputs, untranslated, fallbacks, builds, stale };
}
