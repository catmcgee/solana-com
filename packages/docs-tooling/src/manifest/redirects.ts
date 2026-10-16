/**
 * gen:redirects (WP9, spec §5.8 / D6): writes apps/docs/redirects.json, the
 * Mintlify mirror of the apps/web redirects that concern docs paths.
 *
 * apps/web is the front door and the source of truth. This mirror only
 * exists for people and crawlers who reach the *.mintlify.site host directly
 * (internal Mintlify links, the language switcher, search results there).
 * docs.json pulls it in with `"redirects": { "$ref": "./redirects.json" }`.
 *
 * Conversion from Next.js to Mintlify syntax:
 * - `/:locale(ar|de|...)/x` becomes `/:locale/x` (Mintlify has no regex
 *   constraints; on the docs host only locale folders can match there);
 * - `:param+` becomes `:param*`;
 * - `.md` twins are dropped (Mintlify derives `.md` from the page);
 * - redirects with any other regex, or with has/missing conditions, are
 *   skipped;
 * - destinations outside Mintlify (e.g. `/developers`) become absolute
 *   https://solana.com URLs;
 * - apps/web's single Greek regex rule (`/el/:path(...)`) is expanded into
 *   plain Greek catch-alls (GREEK_MIRROR) that point straight at the current
 *   prefix. Old `/docs/...` pages that moved to a different path also get a
 *   Greek twin (`/el/docs/old` → new page), listed before the catch-alls, so
 *   every Greek URL resolves in one hop. Per-page Greek rules from apps/web
 *   are dropped (the twins replace them).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { docsRoot } from "../lib/paths.ts";
import { loadWebRedirects, type NextRedirect } from "../verify/redirects.ts";

export const MINTLIFY_REDIRECTS_REL = "apps/docs/redirects.json";
export const SITE_ORIGIN = "https://solana.com";

export interface MintlifyRedirect {
  source: string;
  destination: string;
  permanent: boolean;
}

const MINTLIFY_PREFIXES = [
  "/developers/docs",
  // Old docs prefix: only redirects live there now (to /developers/docs).
  "/docs",
  "/developers/cookbook",
  "/developers/bootcamp",
];
const LEGACY_PREFIXES = ["/developers/guides", "/developers/learn"];

function under(p: string, prefix: string) {
  return (
    p === prefix || p.startsWith(`${prefix}/`) || p.startsWith(`${prefix}.`)
  );
}

/** Path served by Mintlify (ignores params and `.md`). */
export function isMintlifyPath(p: string) {
  const path = p.split("#")[0]!.split("?")[0]!;
  if (path.startsWith("/learn/")) return true;
  return MINTLIFY_PREFIXES.some((prefix) => under(path, prefix));
}

/** Exact Greek collection roots, kept (no catch-all covers them). */
const GREEK_EXACT_ROOTS = new Set([
  "/el/docs",
  "/el/developers/docs",
  "/el/developers/cookbook",
  "/el/developers/bootcamp",
]);

/**
 * Mintlify-syntax stand-ins for apps/web's Greek regex redirect, which
 * Mintlify cannot express. Only collections hosted on Mintlify are listed;
 * the rest of /el/... never reaches the docs host.
 */
const GREEK_MIRROR: NextRedirect[] = [
  { source: "/el/docs", destination: "/developers/docs" },
  // Moved pages are covered by greekDocsMoves(), listed before this.
  { source: "/el/docs/:path*", destination: "/developers/docs/:path*" },
  { source: "/el/developers/docs", destination: "/developers/docs" },
  {
    source: "/el/developers/docs/:path*",
    destination: "/developers/docs/:path*",
  },
  { source: "/el/learn/:path+", destination: "/learn/:path+" },
  { source: "/el/developers/cookbook", destination: "/developers/cookbook" },
  {
    source: "/el/developers/cookbook/:path*",
    destination: "/developers/cookbook/:path*",
  },
  { source: "/el/developers/bootcamp", destination: "/developers/bootcamp" },
  {
    source: "/el/developers/bootcamp/:path*",
    destination: "/developers/bootcamp/:path*",
  },
].map((r) => ({ ...r, permanent: true }));

function isGreekRegexRule(r: NextRedirect) {
  return r.source.startsWith("/el/:path(");
}

/**
 * Greek twins of the old-prefix redirects for pages that moved: `/docs/x`
 * redirects somewhere other than `/developers/docs/x`, so the Greek
 * catch-all alone would land on a missing page.
 */
function greekDocsMoves(redirects: NextRedirect[]): NextRedirect[] {
  return redirects
    .filter(
      (r) =>
        r.source.startsWith("/docs/") &&
        r.destination !== `/developers${r.source}` &&
        !r.has?.length &&
        !r.missing?.length,
    )
    .map((r) => ({ ...r, source: `/el${r.source}`, permanent: true }));
}

const LOCALE_PARAM = /^\/:locale\([^)]*\)/;
const LITERAL_LOCALE = /^\/[a-z]{2}(?=\/)/;

function stripLocale(source: string) {
  if (LOCALE_PARAM.test(source)) return source.replace(LOCALE_PARAM, "");
  if (LITERAL_LOCALE.test(source)) return source.replace(LITERAL_LOCALE, "");
  return source;
}

/** Converts one Next.js redirect, or returns null when it is not mirrored. */
export function toMintlifyRedirect(r: NextRedirect): MintlifyRedirect | null {
  if (r.has?.length || r.missing?.length) return null;
  if (!r.destination.startsWith("/")) return null;
  const bare = stripLocale(r.source);
  if (bare.endsWith(".md") || r.destination.endsWith(".md")) return null;
  if (
    !isMintlifyPath(bare) &&
    !LEGACY_PREFIXES.some((prefix) => under(bare, prefix))
  )
    return null;

  const source = r.source.replace(LOCALE_PARAM, "/:locale").replace(/\+/g, "*");
  // Any regex left (custom param patterns) cannot be expressed in Mintlify.
  if (/[()]/.test(source)) return null;

  const destPath = r.destination.replace(/\+/g, "*");
  const destination = isMintlifyPath(destPath.replace(/^\/:locale/, ""))
    ? destPath
    : `${SITE_ORIGIN}${destPath}`;

  return {
    source,
    destination,
    permanent: r.permanent ?? true,
  };
}

export function buildMintlifyRedirects(
  redirects: NextRedirect[],
): MintlifyRedirect[] {
  const seen = new Set<string>();
  const out: MintlifyRedirect[] = [];
  const twins = greekDocsMoves(redirects);
  const generated = new Set<NextRedirect>(twins);
  const expanded = redirects.flatMap((r) =>
    isGreekRegexRule(r) ? [...twins, ...GREEK_MIRROR] : [r],
  );
  for (const r of expanded) {
    // apps/web's own per-page Greek shortcuts are dropped; the generated
    // twins and the Greek catch-alls cover them (spec V4).
    if (
      r.source.startsWith("/el/") &&
      !r.source.includes(":") &&
      !generated.has(r)
    ) {
      if (!GREEK_EXACT_ROOTS.has(r.source)) continue;
    }
    const m = toMintlifyRedirect(r);
    if (!m || seen.has(m.source)) continue;
    // A redirect onto itself (e.g. after locale stripping) would loop.
    if (m.source === m.destination) continue;
    seen.add(m.source);
    out.push(m);
  }
  return out;
}

export function serializeRedirects(list: MintlifyRedirect[]) {
  return `${JSON.stringify(list, null, 2)}\n`;
}

export async function generateMintlifyRedirects() {
  return serializeRedirects(buildMintlifyRedirects(await loadWebRedirects()));
}

export function readCommittedRedirects(root = docsRoot) {
  const file = path.join(root, "redirects.json");
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}
