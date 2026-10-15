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
    matchesRouteSegment(pathname, "/docs") ||
    matchesRouteSegment(pathname, "/developers/cookbook")
  );
}

/**
 * Landing pages that support light and dark mode on the exact path only.
 * Their subpages (for example /developers/payments) stay dark-only, so these
 * deliberately do not use matchesRouteSegment.
 */
const EXACT_THEME_ROUTES = new Set(["/developers", "/learn"]);

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
    matchesRouteSegment(pathname, "/docs") ||
    matchesRouteSegment(pathname, "/developers/cookbook") ||
    matchesRouteSegment(pathname, "/developers/bootcamp")
  );
}
