/**
 * One-time compile: IA template + legacy meta.json -> navigation/en.json and
 * the labels/<loc>.json seeds (spec §4.2 step 2).
 *
 * After the first compile en.json is hand-maintained. Re-running refuses to
 * overwrite it unless `--force` is passed (the template and legacy metas are
 * kept so the compile can be reproduced and diffed).
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { DEFAULT_LOCALE, TARGET_LOCALES } from "../lib/locales.ts";
import { docsRoot as defaultDocsRoot, repoRoot } from "../lib/paths.ts";
import { IA_TEMPLATE } from "./ia-template.ts";
import {
  emptyReport,
  expandFolder,
  findIndexPages,
  readMeta,
  type ExpandContext,
  type ExpandReport,
  type LabelProvenance,
} from "./legacy-meta.ts";
import {
  devNavMessages,
  labelSites,
  sortKeys,
  type LabelMap,
} from "./labels.ts";
import { NEW_PAGE_SET } from "./new-pages.ts";
import { loadInventory } from "./pages.ts";
import type {
  LabelSource,
  NavEntry,
  NavFile,
  NavGroup,
  NavPage,
  NavTab,
  TemplateEntry,
  TemplateGroup,
  TemplateTab,
} from "./types.ts";

export interface CompileReport extends ExpandReport {
  /** English pages that ended up in no nav entry. */
  unplaced: NavPage[];
  /** Pages emitted twice. */
  duplicates: NavPage[];
  /** Explicit template pages with no file (NEW pages excluded). */
  missingExplicit: NavPage[];
  /** Label seeding coverage per locale. */
  seeded: Record<string, { seeded: number; total: number }>;
}

export interface CompileResult {
  nav: NavFile;
  seeds: Map<string, LabelMap>;
  report: CompileReport;
}

interface TemplateProvenance {
  kind: "template";
  labelFrom?: LabelSource;
  root?: NavPage;
}

type Provenance = LabelProvenance | TemplateProvenance;

function collectClaimed(tabs: TemplateTab[]): Set<NavPage> {
  const claimed = new Set<NavPage>();
  const walk = (entries: TemplateEntry[]) => {
    for (const e of entries) {
      if (typeof e === "string") claimed.add(e);
      else if ("expand" in e) continue;
      else {
        if (e.root) claimed.add(e.root);
        walk(e.pages);
      }
    }
  };
  for (const t of tabs)
    for (const g of t.groups ?? []) {
      if (g.root) claimed.add(g.root);
      walk(g.pages);
    }
  return claimed;
}

/** All English meta.json folders (docs/, developers/). */
function metaFolders(root: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    const abs = path.join(root, rel);
    if (!existsSync(abs)) return;
    if (existsSync(path.join(abs, "meta.json"))) out.push(rel);
    for (const n of readdirSync(abs).sort()) {
      if (n.startsWith(".")) continue;
      if (statSync(path.join(abs, n)).isDirectory()) walk(`${rel}/${n}`);
    }
  };
  walk("docs");
  walk("developers");
  return out;
}

export interface CompileOptions {
  template?: TemplateTab[];
  docsRoot?: string;
  /** Repo root for packages/i18n messages. */
  repoRoot?: string;
  locales?: readonly string[];
  /** NEW pages (counted as present before their stubs exist). */
  newPages?: ReadonlySet<NavPage>;
}

export function compileLegacyNav(opts: CompileOptions = {}): CompileResult {
  const template = opts.template ?? IA_TEMPLATE;
  const root = opts.docsRoot ?? defaultDocsRoot;
  const rRoot = opts.repoRoot ?? repoRoot;
  const locales = opts.locales ?? TARGET_LOCALES;
  const inv = loadInventory(root);
  const enPages = new Set(inv.byLang.get(DEFAULT_LOCALE));
  // NEW pages count as present so the compile does not depend on the stubs.
  const newPages = opts.newPages ?? NEW_PAGE_SET;
  for (const p of newPages) enPages.add(p);

  const claimed = collectClaimed(template);
  const provenance = new Map<NavGroup | NavTab, Provenance>();
  const expandProv = new Map<NavGroup, LabelProvenance>();
  const ctx: ExpandContext = {
    pages: enPages,
    claimed,
    emitted: new Set(),
    report: emptyReport(),
    provenance: expandProv,
    indexPages: findIndexPages(enPages, root),
    docsRoot: root,
  };
  const duplicates: NavPage[] = [];
  const missingExplicit: NavPage[] = [];

  const place = (p: NavPage) => {
    if (ctx.emitted.has(p)) duplicates.push(p);
    ctx.emitted.add(p);
    if (!enPages.has(p)) missingExplicit.push(p);
  };

  const compileEntries = (entries: TemplateEntry[]): NavEntry[] => {
    const out: NavEntry[] = [];
    for (const e of entries) {
      if (typeof e === "string") {
        place(e);
        out.push(e);
      } else if ("expand" in e) {
        out.push(...expandFolder(ctx, e.expand));
      } else {
        out.push(compileGroup(e));
      }
    }
    return out;
  };

  const compileGroup = (g: TemplateGroup): NavGroup => {
    if (g.root) place(g.root);
    const pages = compileEntries(g.pages);
    const directory =
      g.directory ??
      (g.root && ctx.indexPages.has(g.root) ? "card" : undefined);
    const out: NavGroup = {
      group: g.group,
      ...(g.root ? { root: g.root } : {}),
      ...(g.icon ? { icon: g.icon } : {}),
      ...(g.expanded !== undefined ? { expanded: g.expanded } : {}),
      ...(g.hidden ? { hidden: true } : {}),
      ...(g.searchable ? { searchable: true } : {}),
      ...(directory ? { directory } : {}),
      pages,
    };
    provenance.set(out, {
      kind: "template",
      labelFrom: g.labelFrom,
      root: g.root,
    });
    return out;
  };

  const tabs: NavTab[] = template.map((t) => {
    const tab: NavTab = {
      tab: t.tab,
      ...(t.icon ? { icon: t.icon } : {}),
      ...(t.href ? { href: t.href } : {}),
      ...(t.align ? { align: t.align } : {}),
      ...(t.hidden ? { hidden: true } : {}),
      ...(t.searchable ? { searchable: true } : {}),
      ...(t.groups ? { groups: t.groups.map(compileGroup) } : {}),
    };
    provenance.set(tab, { kind: "template", labelFrom: t.labelFrom });
    return tab;
  });
  for (const [g, p] of expandProv) provenance.set(g, p);

  const nav: NavFile = { tabs };
  const unplaced = [...enPages].filter((p) => !ctx.emitted.has(p)).sort();

  // ---- label seeds ---------------------------------------------------------
  const enNav = devNavMessages(DEFAULT_LOCALE, rRoot);
  const titleIndex = new Map<string, string[]>();
  for (const f of metaFolders(root)) {
    const t = readMeta(f, DEFAULT_LOCALE, root)?.title;
    if (!t) continue;
    const k = t.toLowerCase();
    titleIndex.set(k, [...(titleIndex.get(k) ?? []), f]);
  }
  const metaTitle = (folder: string, loc: string) =>
    readMeta(folder, loc, root)?.title;

  /** Resolve a label for one locale, or undefined. */
  const resolve = (
    en: string,
    prov: Provenance | undefined,
    loc: string,
  ): string | undefined => {
    const fromMessage = (key: string) => devNavMessages(loc, rRoot)[key];
    if (prov?.kind === "meta") {
      // The cookbook has no locale meta.json; fall through to title matching.
      const v = metaTitle(prov.folder, loc);
      if (v) return v;
    }
    if (prov?.kind === "template" && prov.labelFrom) {
      if (prov.labelFrom === "none") return undefined;
      if (prov.labelFrom.startsWith("meta:"))
        return metaTitle(prov.labelFrom.slice(5), loc);
      return fromMessage(prov.labelFrom.slice(8));
    }
    // auto: the root's own folder, then UI strings, then any legacy folder
    // with the same English title (most common translation wins).
    if (prov?.kind === "template" && prov.root) {
      const folder = path.posix.dirname(prov.root);
      const t = readMeta(folder, DEFAULT_LOCALE, root)?.title;
      if (t && t.toLowerCase() === en.toLowerCase())
        return metaTitle(folder, loc);
    }
    const msgKey = Object.keys(enNav).find(
      (k) => enNav[k]!.toLowerCase() === en.toLowerCase(),
    );
    if (msgKey) return fromMessage(msgKey);
    const folders = titleIndex.get(en.toLowerCase());
    if (folders?.length) {
      const counts = new Map<string, number>();
      for (const f of folders) {
        const t = metaTitle(f, loc);
        if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      let best: string | undefined;
      let n = 0;
      for (const [t, c] of counts)
        if (c > n) {
          best = t;
          n = c;
        }
      return best;
    }
    return undefined;
  };

  const sites = labelSites(nav);
  const seeds = new Map<string, LabelMap>();
  const seeded: CompileReport["seeded"] = {};
  for (const loc of locales) {
    const m: LabelMap = {};
    for (const s of sites) {
      const v = resolve(s.en, provenance.get(s.node), loc)?.trim();
      if (v) m[s.key] = v;
    }
    seeds.set(loc, sortKeys(m));
    seeded[loc] = { seeded: Object.keys(m).length, total: sites.length };
  }

  return {
    nav,
    seeds,
    report: {
      ...ctx.report,
      unplaced,
      duplicates,
      missingExplicit: missingExplicit.filter((p) => !newPages.has(p)),
      seeded,
    },
  };
}
