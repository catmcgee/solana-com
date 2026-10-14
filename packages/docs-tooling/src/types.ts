/**
 * Shared interfaces published by WP0. Later work packages depend on these
 * shapes; change them only with a matching update to every consumer.
 */

// ---------------------------------------------------------------------------
// Content collections
// ---------------------------------------------------------------------------

/** Legacy Fumadocs collection names, as used in legacy-urls and move-map. */
export type Collection = "docs" | "cookbook" | "bootcamp" | "learn";

// ---------------------------------------------------------------------------
// Move map (migration/move-map.csv)
// ---------------------------------------------------------------------------

/**
 * Status of one legacy file in the move.
 * - `moved`              git mv to `dest`
 * - `moved-meta`         legacy meta.json moved next to its content; WP6
 *                        compiles navigation from it, then deletes it
 * - `moved-asset`        non-MDX sibling (R9) or public asset moved to `dest`
 * - `moved-data`         non-content data moved into packages/docs-tooling
 * - `copied-asset`       asset referenced by content that only existed in
 *                        apps/web/public; copied (web keeps its copy)
 * - `removed-redirect`   git rm; `redirect` holds the target URL. Used for
 *                        Greek (decisions.md) and redirect-covered R8 files
 * - `removed-collision`  git rm; another file serves the same URL (`dest`)
 * - `removed`            git rm; no public URL (e.g. Greek meta.json)
 * - `kept-uncovered`     R8 file kept because no apps/web redirect covers it
 * - `route-pending`      URL served by a React route today; the new owner
 *                        (`dest`) is built by a later work package
 */
export type MoveStatus =
  | "moved"
  | "moved-meta"
  | "moved-asset"
  | "moved-data"
  | "copied-asset"
  | "removed-redirect"
  | "removed-collision"
  | "removed"
  | "kept-uncovered"
  | "route-pending";

/** The rule from spec §1.3 that produced a row (plus local extensions). */
export type MoveRule =
  | "R1"
  | "R2"
  | "R3"
  | "R4"
  | "R5"
  | "R6"
  | "R7"
  | "R8"
  | "R9"
  /** Greek removal (decisions.md). */
  | "EL"
  /** meta.json kept beside content until WP6 compiles navigation. */
  | "META"
  /** Data files relocated into packages/docs-tooling. */
  | "DATA"
  /** Public assets -> apps/docs/docs-assets (spec §1.4). */
  | "ASSET"
  /** Non-MDX routes (e.g. the /learn landing). */
  | "ROUTE";

export interface MoveRow {
  /** Repo-relative legacy path. */
  src: string;
  /** Repo-relative new path ("" when removed without a replacement). */
  dest: string;
  /** Public URL the file served ("" for non-page files). */
  url: string;
  status: MoveStatus;
  rule: MoveRule;
  /** Redirect target for removed rows. */
  redirect: string;
  /** Free-form note (redirect rule that covers it, collision partner...). */
  note: string;
}

// ---------------------------------------------------------------------------
// Legacy URLs (migration/legacy-urls.txt / .tsv)
// ---------------------------------------------------------------------------

/**
 * - `page`         the locale has its own file and an English twin
 * - `fallback`     Fumadocs served the English file for a missing translation
 * - `route`        served by a React route, not an MDX file
 * - `locale-only`  a locale file with no English twin. Fumadocs never served
 *                  it (its loader indexes pages from the default language
 *                  only); apps/web or the docs app redirected the URL, or it
 *                  404'd. Listed so the new layout cannot start serving it
 *                  by accident.
 */
export type LegacyUrlKind = "page" | "fallback" | "route" | "locale-only";

/** Collections in legacy-urls: the content collections plus React landings. */
export type LegacyUrlCollection = Collection | "developers";

export interface LegacyUrl {
  url: string;
  collection: LegacyUrlCollection;
  locale: string;
  kind: LegacyUrlKind;
  /** Repo-relative legacy file (or route file) that rendered the URL. */
  servedFrom: string;
}

// ---------------------------------------------------------------------------
// Convert (WP2-WP4, WP7)
// ---------------------------------------------------------------------------

/**
 * Minimal mdast-compatible node. WP2 swaps in the real `mdast` types when it
 * adds unified/remark; the registry does not depend on a parser.
 */
export interface AstNode {
  type: string;
  children?: AstNode[];
  [key: string]: unknown;
}

export interface ConvertFile {
  /** Repo-relative path of the file being converted. */
  path: string;
  /** Locale of the file ("en" for English). */
  locale: string;
  collection: Collection;
  /** Parsed frontmatter (mutable; serialized back by the runner). */
  frontmatter: Record<string, unknown>;
  /**
   * The file's original source, as parsed (set by the runner). Node
   * `position` offsets index into it. Read-only.
   */
  source?: string;
}

export interface ConvertContext {
  /** Report a problem without failing the run. */
  warn(message: string, node?: AstNode): void;
  /** Report a problem that fails the run (and `--check`). */
  error(message: string, node?: AstNode): void;
  /** Absolute monorepo root. */
  repoRoot: string;
}

/**
 * A transform is a pure, idempotent function over one file's AST (spec §4.3).
 * It mutates `tree` in place. None of its source constructs may appear in its
 * own output, so running convert twice is a byte-identical no-op.
 */
export type TransformFn = (
  tree: AstNode,
  file: ConvertFile,
  ctx: ConvertContext,
) => void;

export interface Transform {
  /** Unique id, also the fixture folder name under __fixtures__/convert/. */
  name: string;
  /** Lower runs first. Ties are broken by `name`. */
  order: number;
  /** Owning work package, for reports. */
  owner: string;
  /** Text-level pre-check: skip the transform when this returns false. */
  appliesTo?: (source: string, file: ConvertFile) => boolean;
  run: TransformFn;
}

// ---------------------------------------------------------------------------
// Generated manifests (WP9 / WP6 consume these)
// ---------------------------------------------------------------------------

/** One entry of packages/docs-tooling/generated/pages.json. */
export interface PageManifestEntry {
  url: string;
  /** Repo-relative MDX path. */
  file: string;
  lang: string;
  title: string;
  description?: string;
  tab?: string;
  group?: string;
  type?: "conceptual" | "reference" | "tutorial" | "guide";
  related?: string[];
  /** ISO date of the last content commit. */
  lastmod?: string;
}

export interface PagesManifest {
  generatedBy: string;
  pages: PageManifestEntry[];
}

/** One entry of packages/docs-tooling/generated/locale-fallbacks.json. */
export interface LocaleFallback {
  loc: string;
  /** Page path without the collection prefix, e.g. "video-guides/index". */
  path: string;
  collection: "docs" | "bootcamp" | "learn";
}

export interface LocaleFallbacksFile {
  generatedBy: string;
  fallbacks: LocaleFallback[];
}
