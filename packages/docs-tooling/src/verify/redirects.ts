/**
 * Evaluate apps/web redirects (the single front door, spec D6) against
 * concrete URLs, using Next.js's own path matcher so the answer matches what
 * production does.
 *
 * apps/web/rewrites-redirects.ts is imported at runtime (requires the CLI to
 * run under tsx, which resolves its extensionless TS imports, and apps/web's
 * dependencies to be installed).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot } from "../lib/paths.ts";

export interface NextRedirect {
  source: string;
  destination: string;
  permanent?: boolean;
  statusCode?: number;
  locale?: false;
  has?: unknown[];
  missing?: unknown[];
}

export interface RedirectMatch {
  source: string;
  destination: string;
  /** Destination with params substituted (best effort). */
  resolved: string;
}

type Matcher = (pathname: string) => false | Record<string, string | string[]>;

export interface RedirectIndex {
  redirects: NextRedirect[];
  match(url: string): RedirectMatch | null;
}

export const WEB_REDIRECTS_FILE = "apps/web/rewrites-redirects.ts";

function loadNextMatcher(): (source: string) => Matcher {
  const req = createRequire(path.join(repoRoot, "apps/web/package.json"));
  const mod = req("next/dist/shared/lib/router/utils/path-match") as {
    getPathMatch: (
      source: string,
      opts: { strict?: boolean; removeUnnamedParams?: boolean },
    ) => Matcher;
  };
  return (source) =>
    mod.getPathMatch(source, { strict: true, removeUnnamedParams: true });
}

function substitute(dest: string, params: Record<string, string | string[]>) {
  return dest.replace(/:(\w+)(\([^)]*\))?([*+?])?/g, (_m, name: string) => {
    const v = params[name];
    if (v === undefined) return "";
    return Array.isArray(v) ? v.join("/") : v;
  });
}

export async function loadWebRedirects(): Promise<NextRedirect[]> {
  const file = path.join(repoRoot, WEB_REDIRECTS_FILE);
  // apps-urls.ts logs app URLs at import time; keep CLI output clean.
  const log = console.log;
  console.log = () => {};
  try {
    const mod = (await import(pathToFileURL(file).href)) as {
      default: { redirects: NextRedirect[] | (() => Promise<NextRedirect[]>) };
    };
    const r = mod.default.redirects;
    return typeof r === "function" ? await r() : r;
  } finally {
    console.log = log;
  }
}

export function buildRedirectIndex(redirects: NextRedirect[]): RedirectIndex {
  const compile = loadNextMatcher();
  const compiled = redirects
    // Conditional redirects (has/missing) don't cover a plain request.
    .filter((r) => !r.has?.length && !r.missing?.length)
    .map((r) => ({ r, m: compile(r.source) }));
  return {
    redirects,
    match(url) {
      for (const { r, m } of compiled) {
        const params = m(url);
        if (params) {
          return {
            source: r.source,
            destination: r.destination,
            resolved: substitute(r.destination, params),
          };
        }
      }
      return null;
    },
  };
}

export async function loadRedirectIndex() {
  return buildRedirectIndex(await loadWebRedirects());
}
