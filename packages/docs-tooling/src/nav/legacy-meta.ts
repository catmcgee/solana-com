/**
 * Legacy Fumadocs meta.json reader and `expand(P)` implementation
 * (spec §2.2, §4.2 step 2).
 *
 * WP1 moved every meta.json next to its content (move-map status
 * `moved-meta`), so they are read from the working tree. When a file is gone
 * (after the post-compile cleanup) it is read from the pre-move commit
 * (LEGACY_REF) instead, so the compile stays reproducible.
 *
 * Fumadocs semantics implemented here (fumadocs-core page-tree builder):
 * - `pages` lists children in order: a file name, a folder name, or a nested
 *   path ("typescript/getting-started");
 * - `---Label---` starts a separator section, `---` / `--- ---` ends it;
 * - `[Text](url)` is a link entry. Navigation pages cannot be links, so these
 *   are dropped and reported;
 * - `index` is the folder's own page (the group `root` in the navigation);
 * - files and folders not listed are not shown by Fumadocs. They are
 *   appended at the end of their folder here and reported as orphans, so no
 *   page is lost (inventory: kora json-rpc-api/authentication, cookbook
 *   offline-transactions);
 * - `defaultOpen: true` becomes `expanded: true`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { DEFAULT_LOCALE } from "../lib/locales.ts";
import { LEGACY_REF, docsRoot } from "../lib/paths.ts";
import { listFilesAtRef, showFileAtRef } from "../lib/git.ts";
import type { NavEntry, NavGroup, NavPage } from "./types.ts";
import { isGroup } from "./types.ts";

export interface LegacyMeta {
  title?: string;
  pages?: string[];
  defaultOpen?: boolean;
  root?: boolean;
}

/**
 * Legacy repo path of a (new-layout) folder's meta.json for a locale.
 * `docs/core` + ja -> apps/docs/content/docs/ja/core/meta.json.
 */
export function legacyMetaPath(folder: string, loc: string): string | null {
  const [top, ...rest] = folder.split("/");
  const tail = rest.length ? `${rest.join("/")}/` : "";
  if (top === "docs") return `apps/docs/content/docs/${loc}/${tail}meta.json`;
  if (top === "developers") {
    const [coll, ...r2] = rest;
    const t2 = r2.length ? `${r2.join("/")}/` : "";
    if (coll === "cookbook")
      return loc === DEFAULT_LOCALE
        ? `apps/docs/content/cookbook/${t2}meta.json`
        : null;
    if (coll === "bootcamp")
      return `apps/docs/content/developers-learn/${loc}/${t2}meta.json`;
  }
  return null;
}

const metaCache = new Map<string, LegacyMeta | null>();
let legacyMetaFiles: Set<string> | undefined;

/** meta.json files tracked at LEGACY_REF (empty when the ref is missing). */
function legacyMetas(): Set<string> {
  if (!legacyMetaFiles) {
    try {
      legacyMetaFiles = new Set(
        listFilesAtRef(LEGACY_REF, "apps/docs/content").filter((f) =>
          f.endsWith("/meta.json"),
        ),
      );
    } catch {
      legacyMetaFiles = new Set();
    }
  }
  return legacyMetaFiles;
}

/** Read `<folder>/meta.json` for a locale (working tree, then LEGACY_REF). */
export function readMeta(
  folder: string,
  loc: string = DEFAULT_LOCALE,
  root: string = docsRoot,
): LegacyMeta | null {
  const key = `${root}\0${loc}\0${folder}`;
  if (metaCache.has(key)) return metaCache.get(key)!;
  const rel = loc === DEFAULT_LOCALE ? folder : `${loc}/${folder}`;
  const abs = path.join(root, rel, "meta.json");
  let meta: LegacyMeta | null = null;
  if (existsSync(abs)) {
    meta = JSON.parse(readFileSync(abs, "utf8")) as LegacyMeta;
  } else if (root === docsRoot) {
    const legacy = legacyMetaPath(folder, loc);
    if (legacy && legacyMetas().has(legacy)) {
      try {
        meta = JSON.parse(showFileAtRef(LEGACY_REF, legacy)) as LegacyMeta;
      } catch {
        meta = null;
      }
    }
  }
  metaCache.set(key, meta);
  return meta;
}

export function clearMetaCache() {
  metaCache.clear();
}

/** "fullstack-apps" -> "Fullstack Apps" (folders without a meta title). */
export function titleCase(name: string): string {
  return name
    .split(/[-_]/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export const SEPARATOR = /^---(.*)---$/;
export const LINK = /^\[(.+)\]\((.+)\)$/;

/** Where a group label came from, for seeding labels/<loc>.json. */
export type LabelProvenance =
  | { kind: "meta"; folder: string }
  | { kind: "separator"; folder: string; label: string }
  | { kind: "folder-title"; folder: string };

export interface ExpandReport {
  /** `[Text](url)` entries that could not become navigation pages. */
  droppedLinks: { folder: string; entry: string }[];
  /** Pages/folders on disk but not in meta.json, appended at the end. */
  orphans: { folder: string; page: string }[];
  /** meta.json entries with no file or folder behind them. */
  missing: { folder: string; entry: string }[];
  /** Expanded entries skipped because the template places them elsewhere. */
  placedElsewhere: { folder: string; page: string }[];
  /** Unsupported meta syntax ("...", "!x"). */
  unsupported: { folder: string; entry: string }[];
}

export function emptyReport(): ExpandReport {
  return {
    droppedLinks: [],
    orphans: [],
    missing: [],
    placedElsewhere: [],
    unsupported: [],
  };
}

export interface ExpandContext {
  /** Every English page (apps/docs-relative, no extension). */
  pages: ReadonlySet<NavPage>;
  /** Pages the template places explicitly (never emitted by an expansion). */
  claimed: ReadonlySet<NavPage>;
  /** Pages emitted so far, to keep expansions disjoint. */
  emitted: Set<NavPage>;
  report: ExpandReport;
  provenance: Map<NavGroup, LabelProvenance>;
  /** Pages whose frontmatter has `index: true` (-> directory: card). */
  indexPages: ReadonlySet<NavPage>;
  docsRoot: string;
}

function hasPageUnder(ctx: ExpandContext, folder: string) {
  const prefix = `${folder}/`;
  for (const p of ctx.pages) if (p.startsWith(prefix)) return true;
  return false;
}

function emittedUnder(ctx: ExpandContext, folder: string) {
  const prefix = `${folder}/`;
  for (const p of ctx.emitted) if (p.startsWith(prefix)) return true;
  return false;
}

function allClaimedUnder(ctx: ExpandContext, folder: string) {
  const prefix = `${folder}/`;
  let any = false;
  for (const p of ctx.pages) {
    if (!p.startsWith(prefix)) continue;
    any = true;
    if (!ctx.claimed.has(p)) return false;
  }
  return any;
}

/** Group (or bare page) for a legacy folder, or null when it is empty. */
export function folderGroup(
  ctx: ExpandContext,
  folder: string,
): NavEntry | null {
  const meta = readMeta(folder, DEFAULT_LOCALE, ctx.docsRoot);
  const indexPage = `${folder}/index`;
  const root =
    ctx.pages.has(indexPage) &&
    !ctx.claimed.has(indexPage) &&
    !ctx.emitted.has(indexPage)
      ? indexPage
      : undefined;
  if (root) ctx.emitted.add(root);
  const children = expandFolder(ctx, folder);
  if (!children.length) return root ?? null;
  const group: NavGroup = {
    group: meta?.title ?? titleCase(path.posix.basename(folder)),
    ...(root ? { root } : {}),
    ...(meta?.defaultOpen === true ? { expanded: true } : {}),
    ...(root && ctx.indexPages.has(root) ? { directory: "card" as const } : {}),
    pages: children,
  };
  ctx.provenance.set(
    group,
    meta?.title ? { kind: "meta", folder } : { kind: "folder-title", folder },
  );
  return group;
}

/**
 * `expand(folder)`: the ordered children of a legacy folder. The folder's own
 * index page is never included (it is the enclosing group's root).
 */
export function expandFolder(ctx: ExpandContext, folder: string): NavEntry[] {
  const meta = readMeta(folder, DEFAULT_LOCALE, ctx.docsRoot);
  const top: NavEntry[] = [];
  let current = top;
  const emit = (p: NavPage) => {
    if (ctx.emitted.has(p)) return false;
    ctx.emitted.add(p);
    current.push(p);
    return true;
  };

  const absFolder = path.join(ctx.docsRoot, folder);
  const listed: string[] =
    meta?.pages ??
    (existsSync(absFolder)
      ? readdirSync(absFolder)
          .filter((n) => !n.startsWith("."))
          .map((n) => n.replace(/\.mdx?$/, ""))
          .filter((n) => n !== "index" && n !== "meta.json")
          .sort()
      : []);

  for (const raw of listed) {
    const entry = raw.trim();
    const sep = SEPARATOR.exec(entry);
    if (sep || entry === "---") {
      const label = (sep?.[1] ?? "").trim();
      if (!label) {
        current = top;
        continue;
      }
      const g: NavGroup = { group: label, pages: [] };
      ctx.provenance.set(g, { kind: "separator", folder, label });
      top.push(g);
      current = g.pages;
      continue;
    }
    if (LINK.test(entry)) {
      ctx.report.droppedLinks.push({ folder, entry });
      continue;
    }
    if (entry.startsWith("...") || entry.startsWith("!")) {
      ctx.report.unsupported.push({ folder, entry });
      continue;
    }
    const p = `${folder}/${entry}`;
    if (entry === "index") continue; // the folder's root
    if (ctx.pages.has(p)) {
      if (ctx.claimed.has(p)) {
        ctx.report.placedElsewhere.push({ folder, page: p });
        continue;
      }
      emit(p);
      continue;
    }
    const abs = path.join(ctx.docsRoot, p);
    if (
      existsSync(abs) &&
      statSync(abs).isDirectory() &&
      hasPageUnder(ctx, p)
    ) {
      if (allClaimedUnder(ctx, p)) {
        ctx.report.placedElsewhere.push({ folder, page: `${p}/` });
        continue;
      }
      const g = folderGroup(ctx, p);
      if (g) current.push(g);
      continue;
    }
    ctx.report.missing.push({ folder, entry });
  }

  // Orphans: direct children that meta.json does not list.
  if (existsSync(absFolder)) {
    for (const name of readdirSync(absFolder).sort()) {
      if (name.startsWith(".") || name === "meta.json") continue;
      const abs = path.join(absFolder, name);
      const isDir = statSync(abs).isDirectory();
      const p = `${folder}/${name.replace(/\.mdx?$/, "")}`;
      if (!isDir) {
        if (!/\.mdx?$/.test(name) || p === `${folder}/index`) continue;
        if (ctx.emitted.has(p) || ctx.claimed.has(p)) continue;
        ctx.emitted.add(p);
        top.push(p);
        ctx.report.orphans.push({ folder, page: p });
      } else {
        if (!hasPageUnder(ctx, p) || emittedUnder(ctx, p)) continue;
        if (allClaimedUnder(ctx, p)) continue;
        const g = folderGroup(ctx, p);
        if (g) {
          top.push(g);
          ctx.report.orphans.push({ folder, page: `${p}/` });
        }
      }
    }
  }

  // Drop separator groups that ended up empty.
  return top.filter((e) => !isGroup(e) || e.pages.length > 0);
}

/** Pages whose frontmatter sets `index: true` (Fumadocs DocsCategory). */
export function findIndexPages(
  pages: Iterable<NavPage>,
  root: string = docsRoot,
): Set<NavPage> {
  const out = new Set<NavPage>();
  for (const p of pages) {
    const file = [`${p}.mdx`, `${p}.md`]
      .map((f) => path.join(root, f))
      .find((f) => existsSync(f));
    if (!file) continue;
    const head = readFileSync(file, "utf8").slice(0, 4000);
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(head);
    if (fm && /^index:\s*true\s*$/m.test(fm[1]!)) out.add(p);
  }
  return out;
}
