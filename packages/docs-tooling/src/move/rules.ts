/**
 * Pure path rules for the legacy -> apps/docs layout move (spec §1.3, R1-R9, as
 * adjusted by decisions.md: Greek is removed, not moved).
 *
 * Everything here is a function of legacy repo-relative paths only, so it can
 * be unit tested and re-run after the move (legacy-urls reads the tree from
 * git at LEGACY_REF).
 */
import type { Collection, MoveRow } from "../types.ts";
import { DEFAULT_LOCALE, DROPPED_LOCALES } from "../lib/locales.ts";

export const CONTENT_PREFIX = "apps/docs/content/";
export const DOCS_PREFIX = "apps/docs/";

/** Public URL prefix of each collection. */
export const COLLECTION_BASE: Record<Collection, string> = {
  docs: "/docs",
  cookbook: "/developers/cookbook",
  bootcamp: "/developers/bootcamp",
  learn: "/learn",
};

/**
 * Public URL prefix (= folder under apps/docs) of each collection in the
 * CURRENT layout. The docs moved from /docs to /developers/docs on
 * 2026-10-16; apps/web redirects every /docs URL (and its locale twins).
 * COLLECTION_BASE above stays the legacy (Fumadocs) URL prefix.
 */
export const LAYOUT_BASE: Record<Collection, string> = {
  ...COLLECTION_BASE,
  docs: "/developers/docs",
};

/** Legacy content folder of each collection. */
export const COLLECTION_DIR: Record<Collection, string> = {
  docs: "docs",
  cookbook: "cookbook",
  bootcamp: "developers-learn",
  learn: "learn",
};

/**
 * R8: locale-only files English deleted long ago (spec §1.3). Listed
 * explicitly so the move never deletes an unexpected file; `classify` also
 * reports any locale-only file outside this list.
 */
export const R8_STALE_PATHS: readonly string[] = [
  "clients/game-sdks.mdx",
  "clients/go.mdx",
  "clients/java.mdx",
  "clients/javascript.mdx",
  "clients/python.mdx",
  "clients/rust.mdx",
  "frontend/kit.mdx",
  "intro/quick-start/cross-program-invocation.mdx",
  "intro/quick-start/deploying-programs.mdx",
  "intro/quick-start/program-derived-address.mdx",
  "payments/accept-payments/payment-button.mdx",
  "programs/faq.mdx",
  "tools/private-channels.mdx",
];

export interface LegacyEntry {
  collection: Collection;
  /** "en" for the English source; cookbook is always "en". */
  locale: string;
  /** Path below the locale folder, e.g. "core/accounts/index.mdx". */
  rel: string;
}

/** Parse `apps/docs/content/...` into collection/locale/rel. */
export function parseLegacyPath(repoPath: string): LegacyEntry | null {
  if (!repoPath.startsWith(CONTENT_PREFIX)) return null;
  const rest = repoPath.slice(CONTENT_PREFIX.length);
  const [top, ...parts] = rest.split("/");
  if (top === "cookbook") {
    return {
      collection: "cookbook",
      locale: DEFAULT_LOCALE,
      rel: parts.join("/"),
    };
  }
  const collection = (
    { docs: "docs", "developers-learn": "bootcamp", learn: "learn" } as const
  )[top as "docs" | "developers-learn" | "learn"];
  if (!collection || parts.length < 2) return null;
  const [locale, ...relParts] = parts;
  return { collection, locale: locale!, rel: relParts.join("/") };
}

export const isMdx = (rel: string) => rel.endsWith(".mdx");
export const isMeta = (rel: string) => rel.endsWith("meta.json");

/** "core/accounts/index.mdx" -> "/core/accounts"; "index.mdx" -> "". */
export function routeSuffix(rel: string): string {
  const noExt = rel.replace(/\.mdx$/, "");
  if (noExt === "index") return "";
  return "/" + noExt.replace(/\/index$/, "");
}

export function localePrefix(locale: string) {
  return locale === DEFAULT_LOCALE ? "" : `/${locale}`;
}

/** Public URL a legacy MDX file is served at. */
export function legacyUrl(entry: LegacyEntry): string {
  return (
    localePrefix(entry.locale) +
    COLLECTION_BASE[entry.collection] +
    routeSuffix(entry.rel)
  );
}

/**
 * New repo-relative path under apps/docs (R1-R7, R9). Folder layout mirrors
 * the public URL (no base path), so each file serves its own URL.
 * Docs files are under developers/docs (LAYOUT_BASE), so their URL changed:
 * apps/web redirects the legacy /docs URL.
 */
export function newPath(entry: LegacyEntry): string {
  const lp = entry.locale === DEFAULT_LOCALE ? "" : `${entry.locale}/`;
  const base = LAYOUT_BASE[entry.collection].slice(1); // drop leading "/"
  return `${DOCS_PREFIX}${lp}${base}/${entry.rel}`;
}

/** Repo-relative legacy path for an entry. */
export function legacyPath(entry: LegacyEntry): string {
  if (entry.collection === "cookbook") {
    return `${CONTENT_PREFIX}cookbook/${entry.rel}`;
  }
  return `${CONTENT_PREFIX}${COLLECTION_DIR[entry.collection]}/${entry.locale}/${entry.rel}`;
}

/** Rule id for a moved entry. */
function moveRule(entry: LegacyEntry): MoveRow["rule"] {
  const en = entry.locale === DEFAULT_LOCALE;
  if (isMeta(entry.rel)) return "META";
  if (!isMdx(entry.rel)) return "R9";
  switch (entry.collection) {
    case "docs":
      return en ? "R1" : "R2";
    case "cookbook":
      return "R3";
    case "bootcamp":
      return en ? "R4" : "R5";
    case "learn":
      return en ? "R6" : "R7";
  }
}

export interface ClassifyResult {
  rows: MoveRow[];
  /** Locale-only docs files that are not in R8_STALE_PATHS. */
  unexpectedLocaleOnly: string[];
}

/**
 * Plan every legacy content file. R8 rows come out as `removed-redirect`
 * candidates; `move.ts` downgrades them to `kept-uncovered` when the redirect
 * check fails.
 */
export function classify(files: readonly string[]): ClassifyResult {
  const entries = files
    .map((f) => ({ f, e: parseLegacyPath(f) }))
    .filter((x): x is { f: string; e: LegacyEntry } => x.e !== null);

  const enDocs = new Set(
    entries
      .filter((x) => x.e.collection === "docs" && x.e.locale === DEFAULT_LOCALE)
      .map((x) => x.e.rel),
  );
  const r8 = new Set(R8_STALE_PATHS);
  const unexpectedLocaleOnly: string[] = [];
  const rows: MoveRow[] = [];

  for (const { f, e } of entries) {
    const url = isMdx(e.rel) ? legacyUrl(e) : "";
    const base: Omit<MoveRow, "status" | "rule" | "dest"> = {
      src: f,
      url,
      redirect: "",
      note: "",
    };

    if (DROPPED_LOCALES.includes(e.locale)) {
      const enEntry = { ...e, locale: DEFAULT_LOCALE };
      rows.push({
        ...base,
        dest: "",
        rule: "EL",
        status: url ? "removed-redirect" : "removed",
        redirect: url ? legacyUrl(enEntry) : "",
        note: url
          ? `Greek dropped (decisions.md); /${e.locale}${COLLECTION_BASE[e.collection]}/* -> ${COLLECTION_BASE[e.collection]}/*`
          : "Greek dropped (decisions.md)",
      });
      continue;
    }

    if (
      e.collection === "docs" &&
      e.locale !== DEFAULT_LOCALE &&
      isMdx(e.rel) &&
      !enDocs.has(e.rel)
    ) {
      if (r8.has(e.rel)) {
        rows.push({
          ...base,
          dest: "",
          rule: "R8",
          status: "removed-redirect",
          note: "stale locale-only file (spec Q1/R8)",
        });
        continue;
      }
      unexpectedLocaleOnly.push(f);
    }

    const rule = moveRule(e);
    rows.push({
      ...base,
      dest: newPath(e),
      rule,
      status:
        rule === "META"
          ? "moved-meta"
          : rule === "R9"
            ? "moved-asset"
            : "moved",
    });
  }

  // R8 URL collisions: the stale file shares its URL with a surviving file
  // (tools/private-channels.mdx vs tools/private-channels/index.mdx).
  const survivingByUrl = new Map<string, MoveRow>();
  for (const row of rows) {
    if (row.status === "moved" && row.url) survivingByUrl.set(row.url, row);
  }
  for (const row of rows) {
    if (row.rule !== "R8") continue;
    const partner = survivingByUrl.get(row.url);
    if (partner) {
      row.status = "removed-collision";
      row.dest = partner.dest;
      row.note = `stale locale-only file; same URL is served by ${partner.dest}`;
    }
  }

  rows.sort((a, b) => (a.src < b.src ? -1 : a.src > b.src ? 1 : 0));
  return { rows, unexpectedLocaleOnly };
}

/**
 * The files in the NEW layout that would serve a URL, if the URL is in a
 * docs namespace (folder layout = URL). Returns both candidates
 * (`x.mdx`, `x/index.mdx`); callers check which exist.
 */
export function candidateFilesForUrl(url: string): string[] {
  const clean = url.replace(/\/+$/, "");
  const rel = clean.replace(/^\//, "");
  if (!rel) return [];
  return [`${DOCS_PREFIX}${rel}.mdx`, `${DOCS_PREFIX}${rel}/index.mdx`];
}
