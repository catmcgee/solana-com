/**
 * Swap locale nav entries from the English fallback to the translated page
 * once Lingo has written it (decisions.md, "Lingo deferred").
 *
 * Usage after a Lingo run:
 *   pnpm --filter @workspace/docs-tooling nav:swap
 *
 * It rebuilds every locale nav from en.json (the builder prefers `<loc>/P`
 * whenever that file exists), rewrites generated/untranslated.json and
 * generated/locale-fallbacks.json, and reports which entries were swapped
 * and which are still untranslated. Running it twice is a no-op.
 */
import path from "node:path";
import { navPaths, readJson, runBuild } from "./build-locale-nav.ts";
import type { UntranslatedFile } from "./types.ts";

export interface SwapResult {
  swapped: { loc: string; page: string; target: string }[];
  /** Entries that newly fell back to English (a translation was deleted). */
  regressed: { loc: string; page: string }[];
  remaining: number;
  written: string[];
}

export function runSwap(
  opts: {
    docsRoot?: string;
    check?: boolean;
    locales?: readonly string[];
  } = {},
): SwapResult {
  const paths = navPaths(opts.docsRoot);
  const before =
    readJson<UntranslatedFile>(
      path.join(paths.generatedDir, "untranslated.json"),
    )?.pages ?? [];
  const r = runBuild({
    docsRoot: paths.docsRoot,
    check: opts.check,
    locales: opts.locales,
  });
  const key = (p: { loc: string; page: string }) => `${p.loc}\0${p.page}`;
  const after = new Set(r.untranslated.pages.map(key));
  const prev = new Set(before.map(key));
  return {
    swapped: before
      .filter((p) => !after.has(key(p)))
      .map(({ loc, page, target }) => ({ loc, page, target })),
    regressed: r.untranslated.pages
      .filter((p) => !prev.has(key(p)))
      .map(({ loc, page }) => ({ loc, page })),
    remaining: r.untranslated.pages.filter(
      (p) => p.reason === "missing-translation",
    ).length,
    written: opts.check ? [] : r.stale,
  };
}
