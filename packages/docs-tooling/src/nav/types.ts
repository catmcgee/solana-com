/**
 * Docs navigation shapes (navigation/<lang>.json, read by apps/web
 * src/lib/docs/navigation.ts).
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

/** An external sidebar link. */
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
   * above them (the Start here tab). The docs render a page here as a plain
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
