import { createMiddleware, routing } from "@workspace/i18n/middleware";
import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { locales } from "@workspace/i18n/config";
import { getPathnameWithoutLocale } from "@workspace/i18n/pathname";
import {
  canonicalDocsPath,
  getDocsPathInfo,
  getMarkdownRequestSource,
} from "@/lib/docs-edge/paths";
import { trackMarkdownRequest } from "@/lib/docs-edge/markdown-analytics";
import {
  isDocumentNavigation,
  proxyDocsDocument,
} from "@/lib/docs-edge/head-inject";

// The main web app uses routing with locale detection enabled
// and doesn't need preserveProxiedLocaleCookie since it's the source of truth
const handleI18nRouting = createMiddleware(routing);

export function isProxiedPath(normalizedPathname: string) {
  return (
    normalizedPathname.startsWith("/accelerate") ||
    normalizedPathname.startsWith("/breakpoint") ||
    normalizedPathname.startsWith("/developers/templates") ||
    normalizedPathname.startsWith("/developers/cookbook") ||
    normalizedPathname.startsWith("/developers/bootcamp") ||
    normalizedPathname.startsWith("/developers/docs") ||
    normalizedPathname.startsWith("/docs") ||
    // /learn itself is an apps/web page (WP10); articles are Mintlify.
    normalizedPathname.startsWith("/learn/") ||
    (normalizedPathname.startsWith("/news") &&
      !normalizedPathname.startsWith("/newsletter")) ||
    normalizedPathname.startsWith("/changelog") ||
    normalizedPathname.startsWith("/reports") ||
    normalizedPathname.startsWith("/podcasts") ||
    normalizedPathname === "/upgrade" ||
    normalizedPathname.startsWith("/upgrades") ||
    normalizedPathname.startsWith("/media-assets") ||
    normalizedPathname.startsWith("/templates-assets") ||
    normalizedPathname.startsWith("/opengraph")
  );
}

/**
 * Docs paths proxied to Mintlify (spec §5.5, §5.8). The old docs app's
 * middleware did this work; Mintlify cannot, so apps/web does it before the
 * beforeFiles rewrite hands the request to Mintlify:
 * 1. one 308 to the canonical path (lowercase, one locale, no `/en`);
 * 2. record markdown requests (`.md` or `Accept: text/markdown`) in PostHog
 *    without delaying the response;
 * 3. `NextResponse.next()`, so the rewrite in rewrites-redirects.ts runs.
 *    For HTML document navigations the default export then serves the page
 *    itself instead, with our header CSS injected into <head>
 *    (lib/docs-edge/head-inject.ts); every other request keeps the rewrite.
 * Greek (`/el/...`) docs URLs never get here: next.config redirects run
 * before middleware.
 */
export function handleDocsRequest(
  req: NextRequest,
  event: Pick<NextFetchEvent, "waitUntil">,
): NextResponse | null {
  const { pathname } = req.nextUrl;
  const info = getDocsPathInfo(pathname);
  if (!info) {
    return null;
  }

  const canonical = canonicalDocsPath(pathname);
  if (canonical) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}${canonical}${req.nextUrl.search}`,
      308,
    );
  }

  const source = getMarkdownRequestSource(pathname, req.headers.get("accept"));
  if (source) {
    const route = info.rest.endsWith(".md")
      ? info.rest.slice(0, -3)
      : info.rest;
    event.waitUntil(
      trackMarkdownRequest({ route, source, locale: info.locale }),
    );
  }

  return NextResponse.next();
}

export default async function middleware(
  req: NextRequest,
  event: NextFetchEvent,
) {
  const { pathname } = req.nextUrl;
  const pathSegments = pathname.split("/").filter(Boolean);
  const normalizedPathname = getPathnameWithoutLocale(pathname);

  const docsResponse = handleDocsRequest(req, event);
  if (docsResponse) {
    if (
      docsResponse.headers.get("x-middleware-next") === "1" &&
      isDocumentNavigation(req)
    ) {
      // Falls back to the rewrite when no rule matches or Mintlify is down.
      const injected = await proxyDocsDocument(req);
      if (injected) return injected;
    }
    return docsResponse;
  }

  // Skip i18n for paths that are proxied to other Vercel apps via rewrites
  // These paths are handled by their respective app's middleware
  if (isProxiedPath(normalizedPathname)) {
    return NextResponse.next();
  }

  const canonicalSkillPath = "/SKILL.md";
  if (pathname.toLowerCase() === "/skill.md") {
    if (pathname !== canonicalSkillPath) {
      return NextResponse.redirect(
        `${req.nextUrl.origin}${canonicalSkillPath}`,
        308,
      );
    }

    // Rewrite /SKILL.md to the skills.md route handler
    const rewriteUrl = req.nextUrl.clone();
    rewriteUrl.pathname = "/skill.md";
    return NextResponse.rewrite(rewriteUrl);
  }

  if (pathname !== pathname.toLowerCase()) {
    return NextResponse.redirect(
      `${req.nextUrl.origin + pathname.toLowerCase()}`,
    );
  }

  // Remove duplicate locale segments from path
  const localeSegments = pathSegments.filter((segment) =>
    locales.includes(segment),
  );

  if (localeSegments.length > 1) {
    // Keep only the first locale, remove all others
    const firstLocale = localeSegments[0];
    const cleanedSegments = pathSegments.filter(
      (segment, index) =>
        !locales.includes(segment) ||
        (segment === firstLocale && pathSegments.indexOf(segment) === index),
    );

    const cleanedPath = `/${cleanedSegments.join("/")}`;
    return NextResponse.redirect(
      `${req.nextUrl.origin}${cleanedPath}${req.nextUrl.search}`,
    );
  }

  const localeParam = req.nextUrl?.searchParams?.get("locale");
  if (localeParam && !locales.includes(localeParam)) {
    // An invalid locale search param means that the pages router was trying
    // to do a soft navigation and matched the route pages/[locale]/[...slug]
    // the right route will be resolved after the middleware adds the right locale prefix
    // we can safely remove the locale and slug params to avoid poluting the URL
    req.nextUrl.searchParams.delete("locale");
    req.nextUrl.searchParams.delete("slug");
  }

  const response = await handleI18nRouting(req);

  return response;
}

export const config = {
  // Exclude paths that are proxied to other Vercel apps (handled by their own middleware)
  // Also exclude api routes, static files, and Next.js internals.
  // `learn/` (not `learn`): the /learn landing is an apps/web page.
  // Matchers must be literals (Next.js analyses them statically).
  matcher: [
    "/SKILL.md",
    "/skill.md",
    "/((?!api|opengraph|_next|_vercel|accelerate|breakpoint|changelog|docs|learn/|news(?!letter)|reports|podcasts|upgrade|upgrades|media-assets|templates-assets|mintlify-assets|_mintlify|.*\\..*).*)",
    // Docs paths proxied to Mintlify (handleDocsRequest), including `.md`
    // twins, which the generic matcher above skips (it ignores any path with
    // a dot). Mixed-case paths without a dot reach the generic matcher; the
    // last entry catches mixed-case `.md` twins (/DOCS/x.md, /FR/Learn/y.md)
    // so they get the same 308 to the lowercase path.
    "/docs",
    "/docs.md",
    "/docs/:path*",
    "/:locale/docs",
    "/:locale/docs.md",
    "/:locale/docs/:path*",
    "/learn/:path+",
    "/:locale/learn/:path+",
    "/developers/:section(docs|cookbook|bootcamp)",
    "/developers/:section(docs|cookbook|bootcamp).md",
    "/developers/:section(docs|cookbook|bootcamp)/:path*",
    "/:locale/developers/:section(docs|cookbook|bootcamp)",
    "/:locale/developers/:section(docs|cookbook|bootcamp).md",
    "/:locale/developers/:section(docs|cookbook|bootcamp)/:path*",
    "/:path((?:[a-zA-Z]{2}(?:-[a-zA-Z]+)?/)?(?:[dD][oO][cC][sS]|[lL][eE][aA][rR][nN]|[dD][eE][vV][eE][lL][oO][pP][eE][rR][sS])(?:/[^.]*)?\\.[mM][dD])",
  ],
  runtime: "nodejs",
};
