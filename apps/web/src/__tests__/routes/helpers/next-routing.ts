/**
 * Resolves a pathname against the apps/web routing table the way Next.js
 * does for a plain GET: next.config redirects first (first match wins), then
 * beforeFiles rewrites (first match wins; an external destination ends
 * routing). Uses Next's own path matcher and destination compiler so
 * patterns behave exactly as in production.
 */
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { prepareDestination } from "next/dist/shared/lib/router/utils/prepare-destination";
import rewritesAndRedirects from "@@/rewrites-redirects";

type Route = {
  source: string;
  destination: string;
  permanent?: boolean;
  has?: unknown[];
  missing?: unknown[];
};

export type Resolution =
  | {
      kind: "redirect";
      destination: string;
      permanent: boolean;
      source: string;
    }
  | { kind: "rewrite"; destination: string; source: string }
  | { kind: "none" };

function compile(routes: Route[]) {
  return routes
    .filter((route) => !route.has?.length && !route.missing?.length)
    .map((route) => ({
      route,
      match: getPathMatch(route.source, {
        strict: true,
        removeUnnamedParams: true,
      }),
    }));
}

const redirects = compile(rewritesAndRedirects.redirects as Route[]);
const rewrites = compile(rewritesAndRedirects.rewrites.beforeFiles as Route[]);

function apply(destination: string, params: Record<string, unknown>) {
  const { newUrl, parsedDestination } = prepareDestination({
    appendParamsToQuery: false,
    destination,
    params: params as Record<string, string | string[]>,
    query: {},
  });
  if (parsedDestination.hostname) {
    const port = parsedDestination.port ? `:${parsedDestination.port}` : "";
    return `${parsedDestination.protocol}//${parsedDestination.hostname}${port}${parsedDestination.pathname}`;
  }
  return newUrl;
}

export function resolveRedirect(pathname: string): Resolution {
  for (const { route, match } of redirects) {
    const params = match(pathname);
    if (params) {
      return {
        kind: "redirect",
        destination: apply(route.destination, params),
        permanent: route.permanent ?? true,
        source: route.source,
      };
    }
  }
  return { kind: "none" };
}

export function resolveRewrite(pathname: string): Resolution {
  for (const { route, match } of rewrites) {
    const params = match(pathname);
    if (params) {
      return {
        kind: "rewrite",
        destination: apply(route.destination, params),
        source: route.source,
      };
    }
  }
  return { kind: "none" };
}

/** Redirects take precedence over rewrites (middleware is not simulated). */
export function resolve(pathname: string): Resolution {
  const redirect = resolveRedirect(pathname);
  return redirect.kind === "redirect" ? redirect : resolveRewrite(pathname);
}
