/**
 * Path rules for the docs URL space, which apps/web serves
 * itself (Fumadocs). Pure functions only: this module is imported by
 * `src/proxy.ts` and by `rewrites-redirects.ts`, so it must not touch
 * the filesystem or any Next.js runtime API.
 */
import { defaultLocale, locales } from "@workspace/i18n/config";

/**
 * Locales the docs are not translated into (decisions.md: no `el`).
 * Their docs URLs redirect to the English page.
 */
export const DROPPED_DOCS_LOCALES: readonly string[] = ["el"];

/**
 * Non-default locales the docs are served in (17). Folder names and
 * public URLs keep these codes even where docs.json's language code differs
 * (ja -> jp, zh -> cn, pt -> pt-BR); that code appears only in
 * `navigation.languages`, never in page paths.
 */
export const DOCS_TRANSLATED_LOCALES: readonly string[] = locales.filter(
  (locale) =>
    locale !== defaultLocale && !DROPPED_DOCS_LOCALES.includes(locale),
);

/** `ar|de|...|zh`, for `:locale(...)` constraints in rewrite sources. */
export const DOCS_TRANSLATED_LOCALE_PATTERN = DOCS_TRANSLATED_LOCALES.join("|");

/**
 * Path prefixes (without a locale) of docs pages. `/learn` itself is the
 * apps/web landing, so only articles below it are docs paths.
 * `/docs` moved to `/developers/docs` (2026-10-16); the old prefix is only
 * redirects now (next.config, before middleware), but stays listed so that a
 * mixed-case `/Docs/x` still gets the lowercase 308 and then the redirect.
 */
const DOCS_COLLECTION_PREFIXES = [
  "/developers/docs",
  "/docs",
  "/developers/cookbook",
  "/developers/bootcamp",
] as const;
const LEARN_ARTICLE_PREFIX = "/learn/";

export interface DocsPathInfo {
  /** First path segment when it is a known locale code (any case). */
  locale: string | null;
  /** Path without the locale prefix, original case. */
  rest: string;
}

function stripMd(pathname: string) {
  return pathname.endsWith(".md") ? pathname.slice(0, -3) : pathname;
}

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * True when `restLower` (lowercase, locale removed) is a docs path:
 * `/developers/{docs,cookbook,bootcamp}[...]` (and the old `/docs`),
 * `/learn/<article>`, plus their `.md` twins.
 */
function isDocsContentPath(restLower: string) {
  const path = stripMd(restLower);
  if (path.startsWith(LEARN_ARTICLE_PREFIX) && path.length > 7) return true;
  return DOCS_COLLECTION_PREFIXES.some((prefix) => matchesPrefix(path, prefix));
}

/**
 * Splits `pathname` into an optional locale and the rest, when the rest is a
 * docs path (case-insensitive, so that `/Docs/X` is
 * recognised and can be normalised). Returns null for everything else.
 */
export function getDocsPathInfo(pathname: string): DocsPathInfo | null {
  const segments = pathname.split("/");
  const first = segments[1] ?? "";
  const firstLower = first.toLowerCase();
  const hasLocale = locales.includes(firstLower);
  const rest = hasLocale ? `/${segments.slice(2).join("/")}` : pathname;

  if (!isDocsContentPath(rest.toLowerCase())) return null;

  return { locale: hasLocale ? first : null, rest };
}

/**
 * The canonical form of a docs path, applying the three normalisations the
 * old docs-app middleware did (spec §5.8), in one hop:
 * 1. lowercase the path;
 * 2. remove duplicate locale segments, keeping the first;
 * 3. drop a leading default-locale segment
 *    (`/en/developers/docs/x` -> `/developers/docs/x`).
 * Returns null when the path is already canonical.
 */
export function canonicalDocsPath(pathname: string): string | null {
  let canonical = pathname.toLowerCase();

  const segments = canonical.split("/").filter(Boolean);
  const localeSegments = segments.filter((segment) =>
    locales.includes(segment),
  );
  if (localeSegments.length > 1) {
    const firstLocale = localeSegments[0];
    const firstIndex = segments.indexOf(firstLocale);
    const cleaned = segments.filter(
      (segment, index) =>
        !locales.includes(segment) ||
        (segment === firstLocale && index === firstIndex),
    );
    canonical = `/${cleaned.join("/")}`;
  }

  if (canonical === `/${defaultLocale}`) {
    canonical = "/";
  } else if (canonical.startsWith(`/${defaultLocale}/`)) {
    canonical = canonical.slice(defaultLocale.length + 1);
  }

  return canonical === pathname ? null : canonical;
}

export type MarkdownRequestSource = "accept-header" | "md-extension";

/**
 * Classifies a request for the PostHog `docs_markdown_requested` event
 * (ported from the old docs-app middleware). The docs routes answer both
 * forms; the middleware only records them.
 */
export function getMarkdownRequestSource(
  pathname: string,
  acceptHeader: string | null,
): MarkdownRequestSource | null {
  if (pathname.endsWith(".md")) return "md-extension";
  if (pathname.endsWith("/llms.txt")) return null;
  if ((acceptHeader ?? "").includes("text/markdown")) return "accept-header";
  return null;
}
