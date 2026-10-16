/**
 * gen:manifest (WP9, spec §5.4/§5.11): writes
 * packages/docs-tooling/generated/pages.json, the index of every published
 * Mintlify page. packages/sitemap, gen:llms and the apps/web per-section
 * llms route read it instead of walking apps/docs themselves.
 *
 * Read-only over the content tree: it parses frontmatter, never rewrites it.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { PageManifestEntry, PagesManifest } from "../types.ts";
import {
  DEFAULT_LOCALE,
  MINTLIFY_LANGUAGE_CODE,
  TARGET_LOCALES,
} from "../lib/locales.ts";
import {
  docsRoot,
  LEGACY_REF,
  migrationDir,
  repoRoot,
  toPosix,
} from "../lib/paths.ts";

export const PAGES_MANIFEST_REL = "packages/docs-tooling/generated/pages.json";
export const GENERATED_BY = "packages/docs-tooling src/manifest (gen:manifest)";

/** Top-level folders of apps/docs that hold pages (besides <locale>/...). */
export const CONTENT_ROOTS = ["developers", "learn"] as const;

/**
 * pages.json entry. Extends the WP0 schema with the frontmatter flags the
 * consumers need (sitemap and llms skip `noindex` pages).
 */
export interface ManifestPage extends PageManifestEntry {
  /** Mintlify `noindex: true`: published but kept out of search engines. */
  noindex?: boolean;
  /** Mintlify `hidden: true`, or not referenced by the language's nav. */
  hidden?: boolean;
}

export interface ManifestFile extends PagesManifest {
  pages: ManifestPage[];
}

// ---------------------------------------------------------------------------
// Files and URLs
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.mdx?$/.test(entry.name) && entry.name !== "README.md")
      out.push(full);
  }
  return out;
}

/** Repo-relative paths of every page file, sorted. */
export function listPageFiles(root = docsRoot): string[] {
  const dirs = [
    ...CONTENT_ROOTS.map((c) => path.join(root, c)),
    ...TARGET_LOCALES.flatMap((loc) =>
      CONTENT_ROOTS.map((c) => path.join(root, loc, c)),
    ),
  ];
  return dirs
    .flatMap((d) => walk(d))
    .map((f) => toPosix(path.relative(repoRoot, f)))
    .sort();
}

/**
 * `apps/docs/fr/developers/docs/core/index.mdx` ->
 * { lang: "fr", url: "/fr/developers/docs/core" }
 */
export function fileToUrl(repoRelFile: string): { url: string; lang: string } {
  const rel = repoRelFile.replace(/^apps\/docs\//, "").replace(/\.mdx?$/, "");
  const first = rel.split("/")[0]!;
  const lang = TARGET_LOCALES.includes(first) ? first : DEFAULT_LOCALE;
  const withoutIndex = rel === "index" ? "" : rel.replace(/\/index$/, "");
  return { url: `/${withoutIndex}`, lang };
}

/** Mintlify navigation page id (`fr/developers/docs/core/index`) for a file. */
export function fileToNavPage(repoRelFile: string) {
  return repoRelFile.replace(/^apps\/docs\//, "").replace(/\.mdx?$/, "");
}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

export function readFrontmatter(source: string): Record<string, unknown> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!m) return {};
  try {
    const data = parseYaml(m[1]!) as unknown;
    return data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

const PAGE_TYPES = new Set(["conceptual", "reference", "tutorial", "guide"]);

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

// ---------------------------------------------------------------------------
// Navigation (docs.json, with $ref) -> page -> { tab, group }
// ---------------------------------------------------------------------------

export interface NavPlacement {
  tab?: string;
  group?: string;
}

type Json = unknown;

function resolveRefs(node: Json, baseDir: string, depth = 0): Json {
  if (depth > 20) throw new Error("docs.json $ref nesting too deep");
  if (Array.isArray(node))
    return node.map((n) => resolveRefs(n, baseDir, depth));
  if (node && typeof node === "object") {
    const obj = node as Record<string, Json>;
    if (typeof obj.$ref === "string") {
      const file = path.resolve(baseDir, obj.$ref);
      if (!existsSync(file)) return { ...obj, $ref: undefined };
      const loaded = resolveRefs(
        JSON.parse(readFileSync(file, "utf8")) as Json,
        path.dirname(file),
        depth + 1,
      );
      const { $ref: _ignored, ...restKeys } = obj;
      return {
        ...(loaded as Record<string, Json>),
        ...(resolveRefs(restKeys, baseDir, depth) as Record<string, Json>),
      };
    }
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries(obj))
      out[k] = resolveRefs(v, baseDir, depth);
    return out;
  }
  return node;
}

function collectPlacements(
  node: Json,
  ctx: NavPlacement,
  out: Map<string, NavPlacement>,
) {
  if (typeof node === "string") {
    if (!out.has(node)) out.set(node, { ...ctx });
    return;
  }
  if (Array.isArray(node)) {
    for (const n of node) collectPlacements(n, ctx, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, Json>;
  const next: NavPlacement = { ...ctx };
  if (typeof obj.tab === "string") {
    next.tab = obj.tab;
    next.group = undefined;
  }
  if (typeof obj.group === "string") next.group = obj.group;
  // Page ids live in arrays (`pages`, ...) and in a group's `root`; other
  // string properties (icons, hrefs, labels) are not pages.
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      // A group's landing page (`"root": "docs/core/accounts/index"`).
      if (k === "root") collectPlacements(v, next, out);
      continue;
    }
    if (k === "global" || k === "languages") continue;
    collectPlacements(v, next, out);
  }
}

/**
 * Page id -> placement, per folder locale. Reads apps/docs/docs.json and its
 * `$ref`s. Missing config yields an empty map (every page then counts as
 * hidden, which only affects the llms index grouping).
 */
export function loadNavPlacements(
  root = docsRoot,
): Map<string, Map<string, NavPlacement>> {
  const result = new Map<string, Map<string, NavPlacement>>();
  const file = path.join(root, "docs.json");
  if (!existsSync(file)) return result;
  const config = resolveRefs(
    JSON.parse(readFileSync(file, "utf8")) as Json,
    root,
  ) as { navigation?: Record<string, Json> };
  const nav = config.navigation ?? {};
  const byCode = new Map(
    Object.entries(MINTLIFY_LANGUAGE_CODE).map(([folder, code]) => [
      code,
      folder,
    ]),
  );
  const languages = Array.isArray(nav.languages)
    ? (nav.languages as Record<string, Json>[])
    : [{ language: "en", ...nav }];
  for (const entry of languages) {
    const folder = byCode.get(String(entry.language)) ?? String(entry.language);
    const placements = new Map<string, NavPlacement>();
    collectPlacements(entry, {}, placements);
    result.set(folder, placements);
  }
  return result;
}

// ---------------------------------------------------------------------------
// lastmod from git
// ---------------------------------------------------------------------------

/**
 * Commits made after the migration started (LEGACY_REF..HEAD) that touch more
 * files than this are mechanical (the move, bulk conversion, formatting) and
 * do not count as a content change. Earlier commits always count, including
 * bulk Lingo translation runs.
 */
export const MECHANICAL_COMMIT_FILES = 1500;

function git(args: string[], cwd: string) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
}

/** Latest content commit date per repo-relative path under apps/docs. */
export function gitLastModified(cwd = repoRoot): Map<string, string> {
  const out = new Map<string, string>();
  let log = "";
  let migrationCommits = new Set<string>();
  try {
    log = git(
      [
        "log",
        "--no-renames",
        "--format=%x01%H %cI",
        "--name-only",
        "--",
        "apps/docs",
      ],
      cwd,
    );
    migrationCommits = new Set(
      git(["rev-list", `${LEGACY_REF}..HEAD`], cwd)
        .split("\n")
        .filter(Boolean),
    );
  } catch {
    return out;
  }
  for (const chunk of log.split("\x01")) {
    if (!chunk.trim()) continue;
    const [head, ...files] = chunk.split("\n").filter(Boolean);
    const [hash = "", date] = (head ?? "").split(" ");
    if (!date) continue;
    if (migrationCommits.has(hash) && files.length > MECHANICAL_COMMIT_FILES)
      continue;
    for (const f of files) if (!out.has(f)) out.set(f, date);
  }
  return out;
}

/** move-map.csv dest -> src, so moved files inherit their legacy history. */
export function loadMoveSources(): Map<string, string> {
  const out = new Map<string, string>();
  const file = path.join(migrationDir, "move-map.csv");
  if (!existsSync(file)) return out;
  const lines = readFileSync(file, "utf8").split("\n").slice(1);
  for (const line of lines) {
    // src,dest,... (paths never contain commas)
    const [src, dest] = line.split(",");
    if (src && dest) out.set(dest, src);
  }
  return out;
}

function maxDate(a?: string, b?: string) {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export interface BuildManifestOptions {
  root?: string;
  /** Skip git (tests, --check). */
  lastmod?: boolean;
}

export function buildPagesManifest(
  opts: BuildManifestOptions = {},
): ManifestFile {
  const root = opts.root ?? docsRoot;
  const nav = loadNavPlacements(root);
  const dates = opts.lastmod === false ? new Map() : gitLastModified();
  const moved = opts.lastmod === false ? new Map() : loadMoveSources();

  const pages: ManifestPage[] = [];
  for (const file of listPageFiles(root)) {
    const abs = path.join(repoRoot, file);
    const fm = readFrontmatter(readFileSync(abs, "utf8"));
    const { url, lang } = fileToUrl(file);
    const placement = nav.get(lang)?.get(fileToNavPage(file));
    const title =
      str(fm.title) ?? str(fm.sidebarTitle) ?? url.split("/").pop() ?? url;
    const entry: ManifestPage = { url, file, lang, title };
    const description = str(fm.description);
    if (description) entry.description = description;
    if (placement?.tab) entry.tab = placement.tab;
    if (placement?.group) entry.group = placement.group;
    if (typeof fm.type === "string" && PAGE_TYPES.has(fm.type))
      entry.type = fm.type as ManifestPage["type"];
    if (Array.isArray(fm.related))
      entry.related = fm.related.filter(
        (r): r is string => typeof r === "string",
      );
    const lastmod = maxDate(dates.get(file), dates.get(moved.get(file) ?? ""));
    if (lastmod) entry.lastmod = lastmod;
    if (fm.noindex === true) entry.noindex = true;
    if (fm.hidden === true || (nav.size > 0 && !placement)) entry.hidden = true;
    pages.push(entry);
  }
  pages.sort((a, b) => a.url.localeCompare(b.url));
  return { generatedBy: GENERATED_BY, pages };
}

/** Drops fields that change with every commit, for `--check`. */
export function stableManifest(m: ManifestFile): ManifestFile {
  return {
    ...m,
    pages: m.pages.map(({ lastmod: _lastmod, ...rest }) => rest),
  };
}

export function serializeManifest(m: ManifestFile) {
  return `${JSON.stringify(m, null, 2)}\n`;
}

export function readPagesManifest(
  file = path.join(repoRoot, PAGES_MANIFEST_REL),
): ManifestFile | null {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as ManifestFile;
}
