import {
  createMiddleware,
  routing,
  routingWithoutDetection,
} from "@workspace/i18n/middleware";
import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { locales } from "@workspace/i18n/config";
import { getPathnameWithoutLocale } from "@workspace/i18n/pathname";
import {
  DROPPED_DOCS_LOCALES,
  canonicalDocsPath,
  getDocsPathInfo,
  getMarkdownRequestSource,
} from "@/lib/docs-edge/paths";
import { trackMarkdownRequest } from "@/lib/docs-edge/markdown-analytics";

/**
 * Agent discovery on docs pages and their Markdown twins: the llms.txt
 * indexes and the MCP server card, next to the locale alternates the i18n
 * middleware sends in the same header.
 */
export const DOCS_AGENT_LINKS =
  '</llms.txt>; rel="llms-txt", </llms-full.txt>; rel="llms-full-txt", </.well-known/mcp/server-card.json>; rel="mcp-server-card"';

/**
 * The i18n middleware's Link header, without the alternates of locales the
 * docs have no translations for (Greek: its docs URLs redirect to English).
 */
export function withoutDroppedDocsLocales(link: string | null) {
  if (!link) return link;
  const kept = link
    .split(/,\s*(?=<)/)
    .filter(
      (entry) =>
        !DROPPED_DOCS_LOCALES.some((locale) =>
          entry.includes(`hreflang="${locale}"`),
        ),
    );
  return kept.length ? kept.join(", ") : null;
}

function withAgentLinks<T extends Response>(res: T): T {
  const link = withoutDroppedDocsLocales(res.headers.get("link"));
  res.headers.set(
    "link",
    link ? `${link}, ${DOCS_AGENT_LINKS}` : DOCS_AGENT_LINKS,
  );
  res.headers.set("x-llms-txt", "/llms.txt");
  return res;
}

// The main web app uses routing with locale detection enabled
// and doesn't need preserveProxiedLocaleCookie since it's the source of truth
const handleI18nRouting = createMiddleware(routing);

// The developer docs keep the locale of the URL, as on Mintlify: an
// unprefixed (English) docs URL serves English and never redirects to the
// locale cookie (set by visiting a translated page) or Accept-Language.
const handleDocsI18nRouting = createMiddleware(routingWithoutDetection);

export function isDeveloperDocsPath(pathname: string) {
  const rest = getDocsPathInfo(pathname)?.rest.toLowerCase();
  return (
    rest !== undefined &&
    (rest === "/developers/docs" || rest.startsWith("/developers/docs/"))
  );
}

export function isProxiedPath(normalizedPathname: string) {
  return (
    normalizedPathname.startsWith("/accelerate") ||
    normalizedPathname.startsWith("/breakpoint") ||
    normalizedPathname.startsWith("/developers/templates") ||
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
 * Docs paths (/developers/{docs,cookbook}, /learn/<article>, their
 * locale copies and `.md` twins), rendered by this app (Fumadocs). Before
 * the locale routing below:
 * 1. one 308 to the canonical path (lowercase, one locale, no `/en`);
 * 2. Markdown requests (`<page>.md` or `Accept: text/markdown`) are recorded
 *    in PostHog without delaying the response and rewritten to the Markdown
 *    route (/api/markdown/<path>), as the docs app on origin/main did.
 * Everything else returns null and takes the normal locale routing.
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
    const url = req.nextUrl.clone();
    url.pathname = `/api/markdown${info.locale ? `/${info.locale}` : ""}${route}`;
    return withAgentLinks(NextResponse.rewrite(url));
  }

  // Files under the docs (per-section /llms.txt) are routes of their own,
  // outside the locale segment.
  if (/\/[^/]+\.[a-z0-9]+$/i.test(pathname)) return NextResponse.next();

  return null;
}

export default async function proxy(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl;
  const pathSegments = pathname.split("/").filter(Boolean);
  const normalizedPathname = getPathnameWithoutLocale(pathname);

  const docsResponse = handleDocsRequest(req, event);
  if (docsResponse) return docsResponse;

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

  const response = isDeveloperDocsPath(pathname)
    ? await handleDocsI18nRouting(req)
    : await handleI18nRouting(req);

  if (getDocsPathInfo(pathname)) return withAgentLinks(response);
  return response;
}

export const config = {
  // Exclude paths that are proxied to other Vercel apps (handled by their own middleware)
  // Also exclude api routes, static files, and Next.js internals.
  // Matchers must be literals (Next.js analyses them statically).
  matcher: [
    "/SKILL.md",
    "/skill.md",
    "/((?!api|opengraph|mcp(?:/|$)|_next|_vercel|accelerate|breakpoint|changelog|docs|news(?!letter)|reports|podcasts|upgrade|upgrades|media-assets|templates-assets|.*\\..*).*)",
    // Docs paths (handleDocsRequest), including `.md` twins, which the
    // generic matcher above skips (it ignores any path with a dot). Mixed-case paths without a dot reach the generic matcher; the
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
};
