/**
 * Mintlify navigation shapes (the subset we emit) plus the IA template
 * shapes used once by compile-legacy-nav.
 *
 * Mintlify schema reference: https://mintlify.com/docs.json
 * (tabSchema / groupsSchema / pageOrGroupSchema).
 */

/** A page entry: a path relative to apps/docs, without extension. */
export type NavPage = string;

export interface NavGroup {
  group: string;
  /** Page that opens when the group label is clicked. */
  root?: NavPage;
  icon?: string;
  /** Small label next to the group name (path groups show their duration). */
  tag?: string;
  expanded?: boolean;
  hidden?: boolean;
  searchable?: boolean;
  directory?: "none" | "accordion" | "card";
  pages: NavEntry[];
}

/** An external sidebar link (Mintlify `navigationLinkSchema`). */
export interface NavLink {
  type: "link";
  title: string;
  /** Absolute http(s) URL. */
  href: string;
}

export type NavEntry = NavPage | NavGroup | NavLink;

export interface NavTab {
  tab: string;
  icon?: string;
  /** External or internal link instead of a sidebar. */
  href?: string;
  align?: "start" | "end";
  hidden?: boolean;
  searchable?: boolean;
  groups?: NavGroup[];
  /**
   * Pages (and groups) listed straight in the tab, with no group header
   * above them (the Start here tab). Mintlify renders a page here as a plain
   * sidebar entry and a group as a collapsible entry.
   */
  pages?: NavEntry[];
}

/** Contents of apps/docs/navigation/<loc>.json (referenced via $ref). */
export interface NavFile {
  tabs: NavTab[];
}

export const isGroup = (e: NavEntry): e is NavGroup =>
  typeof e === "object" && "group" in e;
export const isLink = (e: NavEntry): e is NavLink =>
  typeof e === "object" && (e as NavLink).type === "link";

// ---------------------------------------------------------------------------
// IA template (one-time compile input)
// ---------------------------------------------------------------------------

/**
 * `expand(P)`: replaced by the ordered subtree from the legacy meta.json of
 * folder P (spec §2.2). Pages placed explicitly anywhere else in the template
 * are skipped, so an expansion never duplicates them.
 */
export interface ExpandMarker {
  expand: string;
}

/**
 * Where a template label's translations come from when seeding
 * labels/<loc>.json:
 * - `meta:<folder>`    the locale meta.json `title` of that legacy folder
 * - `message:<key>`    packages/i18n/messages/web/<loc>/common.json key
 * - `none`             no seed (Lingo translates it later)
 * When omitted, the compiler matches the English label against the legacy
 * meta titles and the developers.nav.* strings (case-insensitive).
 */
export type LabelSource = `meta:${string}` | `message:${string}` | "none";

export interface TemplateGroup {
  group: string;
  root?: NavPage;
  icon?: string;
  tag?: string;
  expanded?: boolean;
  hidden?: boolean;
  searchable?: boolean;
  directory?: "none" | "accordion" | "card";
  labelFrom?: LabelSource;
  pages: TemplateEntry[];
}

export type TemplateEntry = NavPage | ExpandMarker | TemplateGroup;

export interface TemplateTab {
  tab: string;
  icon?: string;
  href?: string;
  align?: "start" | "end";
  hidden?: boolean;
  searchable?: boolean;
  labelFrom?: LabelSource;
  groups?: TemplateGroup[];
}

// ---------------------------------------------------------------------------
// Generated outputs
// ---------------------------------------------------------------------------

export type UntranslatedReason =
  /** The locale has no file yet; Lingo should translate it. */
  | "missing-translation"
  /** The collection is English-only by design (cookbook). */
  | "english-only"
  /**
   * The page is excluded from the docs Lingo project
   * (apps/docs/.lingo/config.json `exclude`, e.g. docs/rpc/**), so Lingo will
   * never write it. Needs a policy decision or a manual translation.
   */
  | "not-in-lingo";

export interface UntranslatedPage {
  /** Folder/URL locale (ja, zh, pt, ...). */
  loc: string;
  /** English page path used in the locale nav, e.g. "docs/rpc/providers". */
  page: NavPage;
  /** Where the translation will live, e.g. "ja/docs/rpc/providers". */
  target: NavPage;
  reason: UntranslatedReason;
}

export interface UntranslatedLabel {
  loc: string;
  key: string;
  en: string;
}

/** packages/docs-tooling/generated/untranslated.json */
export interface UntranslatedFile {
  generatedBy: string;
  note: string;
  summary: Record<
    string,
    { pages: number; englishOnly: number; notInLingo: number; labels: number }
  >;
  pages: UntranslatedPage[];
  labels: UntranslatedLabel[];
}

/** Locale page deliberately left out of every nav, with the reason. */
export interface UnlistedPage {
  /** Path without the locale prefix, e.g. "docs/payments/accept-payments/payment-button". */
  page: NavPage;
  /** Locales it applies to ("*" = every target locale that has the file). */
  locales: "*" | string[];
  reason: string;
}
