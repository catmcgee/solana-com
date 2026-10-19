import { getPathnameWithoutLocale } from "@workspace/i18n/pathname";

function matchesRouteSegment(
  pathname: string | null | undefined,
  route: string,
) {
  if (!pathname) {
    return false;
  }

  const path = getPathnameWithoutLocale(pathname);
  return path === route || path.startsWith(`${route}/`);
}

/**
 * The docs tab bar (Start here, Payments, ...) under the global header.
 * The /developers landing is a marketing page with its own job picker, so it
 * shows only the global header; its sub-pages (templates, cookbook, ...) and
 * the docs keep the bar so readers can move between docs sections.
 */
export function shouldShowDevelopersNav(pathname: string | null | undefined) {
  if (isExactRoute(pathname, "/developers")) return false;
  return (
    matchesRouteSegment(pathname, "/developers") ||
    matchesRouteSegment(pathname, "/docs")
  );
}

function isExactRoute(pathname: string | null | undefined, route: string) {
  if (!pathname) return false;
  const path =
    getPathnameWithoutLocale(pathname.split(/[?#]/)[0]!).replace(/\/+$/, "") ||
    "/";
  return path === route;
}

export function shouldShowDocsSidebarToggle(
  pathname: string | null | undefined,
) {
  return (
    matchesRouteSegment(pathname, "/developers/docs") ||
    matchesRouteSegment(pathname, "/docs") ||
    matchesRouteSegment(pathname, "/developers/cookbook")
  );
}

/**
 * Pages that wear the docs chrome instead of the solana.com Header and
 * Footer: the /developers landing (exact path, any locale) and the developer
 * docs (/developers/docs, /developers/cookbook, /developers/bootcamp,
 * /learn/<article>; the /learn landing keeps the site chrome). They use the
 * docs' light/dark theme, stored in localStorage "isDarkMode", so one choice
 * applies to all of them. ThemeProvider leaves <html> alone there; apps/web's
 * docs header owns the theme.
 */
export function isDocsChromeRoute(pathname: string | null | undefined) {
  return isExactRoute(pathname, "/developers") || isDocsPageRoute(pathname);
}

/** The developer docs pages (not the /developers landing). */
export function isDocsPageRoute(pathname: string | null | undefined) {
  if (!pathname) return false;
  const path = getPathnameWithoutLocale(pathname.split(/[?#]/)[0]!);
  return (
    matchesRouteSegment(path, "/developers/docs") ||
    matchesRouteSegment(path, "/developers/cookbook") ||
    matchesRouteSegment(path, "/developers/bootcamp") ||
    /^\/learn\/[^/]/.test(path)
  );
}

/**
 * Landing pages that support light and dark mode on the exact path only.
 * Their subpages stay dark-only, so these deliberately do not use
 * matchesRouteSegment. The /developers landing manages its own theme (see
 * isDocsChromeRoute), so it is not listed.
 */
const EXACT_THEME_ROUTES = new Set(["/learn"]);

function matchesExactRoute(pathname: string | null | undefined) {
  if (!pathname) {
    return false;
  }

  const path = getPathnameWithoutLocale(pathname).replace(/\/+$/, "") || "/";
  return EXACT_THEME_ROUTES.has(path);
}

export function isThemeRoute(pathname: string | null | undefined) {
  return (
    matchesExactRoute(pathname) ||
    matchesRouteSegment(pathname, "/developers/docs") ||
    matchesRouteSegment(pathname, "/docs") ||
    matchesRouteSegment(pathname, "/developers/cookbook") ||
    matchesRouteSegment(pathname, "/developers/bootcamp")
  );
}
