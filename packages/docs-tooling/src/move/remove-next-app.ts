/**
 * Remove the Fumadocs Next.js app from apps/docs (spec §1.2).
 *
 * Refuses to delete while anything outside apps/docs still references the
 * app's code/config (imports, package dependency, file paths), so nothing
 * else in the monorepo silently breaks.
 */
import { execFileSync } from "node:child_process";
import { gitRm, listTrackedFiles } from "../lib/git.ts";
import { repoRoot } from "../lib/paths.ts";

/** Paths (relative to apps/docs) owned by the Next app. */
export const NEXT_APP_PATHS = [
  "src/",
  "public/",
  "scripts/",
  "__tests__/",
  "assets/",
  "content/",
  ".env.example",
  "AGENTS.md",
  "CLAUDE.md",
  "components.json",
  "next-env.d.ts",
  "next-intl.config.js",
  "next.config.ts",
  "oxlint.config.mts",
  "package.json",
  "postcss.config.js",
  "source.config.ts",
  "tailwind.config.js",
  "tsconfig.json",
  "vercel.json",
  "vitest.config.ts",
];

/** References outside apps/docs that would break when the app is deleted. */
const BLOCKER_PATTERNS = [
  "apps/docs/src",
  "apps/docs/public",
  "apps/docs/next.config",
  "apps/docs/source.config",
  "apps/docs/package.json",
  "apps/docs/tsconfig",
  '"solana-docs": "workspace',
];

/** Legacy content-path references: not blockers, but stale after the move. */
const STALE_PATTERNS = ["apps/docs/content"];

export function grepOutside(patterns: readonly string[]): string[] {
  const out: string[] = [];
  for (const pat of patterns) {
    let res = "";
    try {
      res = execFileSync(
        "git",
        [
          "grep",
          "-n",
          "-F",
          pat,
          "--",
          ".",
          ":!apps/docs",
          ":!pnpm-lock.yaml",
          ":!.lingo/lock.json",
          ":!migration",
          ":!packages/docs-tooling",
          ":!docs",
        ],
        { cwd: repoRoot, encoding: "utf8" },
      );
    } catch {
      continue; // git grep exits 1 when nothing matches
    }
    out.push(...res.split("\n").filter(Boolean));
  }
  return [...new Set(out)].sort();
}

export const findBlockers = () => grepOutside(BLOCKER_PATTERNS);
export const findStaleContentRefs = () => grepOutside(STALE_PATTERNS);

export function removeNextApp(
  opts: { dryRun?: boolean; force?: boolean } = {},
) {
  const blockers = findBlockers();
  const tracked = listTrackedFiles("apps/docs");
  const removed = tracked.filter((f) => {
    const rel = f.slice("apps/docs/".length);
    return NEXT_APP_PATHS.some((p) =>
      p.endsWith("/") ? rel.startsWith(p) : rel === p,
    );
  });
  if (!opts.dryRun && (!blockers.length || opts.force) && removed.length)
    gitRm(removed);
  return { removed, blockers, staleContentRefs: findStaleContentRefs() };
}
