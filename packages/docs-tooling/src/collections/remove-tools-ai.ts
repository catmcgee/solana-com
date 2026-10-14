/**
 * WP7: remove the unreachable `docs/tools/ai` page (every language).
 *
 *   tsx src/collections/remove-tools-ai.ts [--dry-run]
 *
 * apps/web has redirected `/docs/tools/ai` to `/docs/intro/coding-with-agents`
 * since before the migration, so the 631-line page (and its 17 translations)
 * has no public URL. Merging any of its content into coding-with-agents is a
 * writer task (WP8a); the source stays in git history
 * (`git show 023c6d918:apps/docs/content/docs/en/tools/ai.mdx`).
 *
 * Refuses to delete unless, for every file:
 * - apps/web redirects its URL and `.md` twin (Next's own matcher), and
 * - no content page still links to it (run convert with the `tools-ai`
 *   transform first, which retargets those links).
 *
 * After removal, WP6 drops `docs/tools/ai` from the Hidden tab.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_LOCALE, TARGET_LOCALES } from "../lib/locales.ts";
import { docsRoot, repoRoot, toPosix } from "../lib/paths.ts";
import { gitRm } from "../lib/git.ts";
import { loadRedirectIndex, type RedirectIndex } from "../verify/redirects.ts";
import { listLayoutPages } from "../verify/verify-urls.ts";
import { retarget } from "../convert/transforms/tools-ai.ts";

export interface ToolsAiPlan {
  /** Repo-relative files that would be removed. */
  files: string[];
  problems: string[];
}

export function toolsAiFiles(root = docsRoot): string[] {
  return [DEFAULT_LOCALE, ...TARGET_LOCALES]
    .map((l) => (l === DEFAULT_LOCALE ? "" : `${l}/`) + "docs/tools/ai.mdx")
    .filter((rel) => existsSync(path.join(root, rel)))
    .map((rel) => toPosix(path.relative(repoRoot, path.join(root, rel))));
}

/** Links (markdown or href="…") that still point at the old page. */
export function remainingLinks(pages: Iterable<string>): string[] {
  const out: string[] = [];
  const re = /(?:\]\(|href=["'])([^)"'\s]*docs\/tools\/ai[^)"'\s]*)/g;
  for (const rel of pages) {
    if (/\/docs\/tools\/ai\.mdx?$/.test(rel)) continue;
    const src = readFileSync(path.join(repoRoot, rel), "utf8");
    if (!src.includes("tools/ai")) continue;
    for (const m of src.matchAll(re))
      if (retarget(m[1]!)) out.push(`${rel}: ${m[1]}`);
  }
  return out;
}

export function planToolsAi(web: RedirectIndex): ToolsAiPlan {
  const files = toolsAiFiles();
  const problems: string[] = [];
  for (const f of files) {
    const rel = f.replace(/^apps\/docs\//, "").replace(/\.mdx$/, "");
    const url = `/${rel}`;
    for (const u of [url, `${url}.md`])
      if (!web.match(u)) problems.push(`${f}: no apps/web redirect for ${u}`);
  }
  for (const l of remainingLinks(listLayoutPages()))
    problems.push(`still linked (run convert first): ${l}`);
  return { files, problems };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === new URL(import.meta.url).pathname
) {
  const dryRun = process.argv.includes("--dry-run");
  const plan = planToolsAi(await loadRedirectIndex());
  for (const f of plan.files)
    console.log(`${dryRun ? "would remove" : "remove"}: ${f}`);
  for (const p of plan.problems) console.log(`problem: ${p}`);
  if (plan.problems.length) {
    console.log(`refusing: ${plan.problems.length} problem(s)`);
    process.exit(1);
  }
  if (!dryRun && plan.files.length) gitRm(plan.files);
}
