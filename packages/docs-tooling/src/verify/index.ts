/**
 * `docs-tooling verify`: every repo-side check in one
 * command. CI runs it on every change to apps/docs/** or
 * packages/docs-tooling/**; the apps/web build then compiles every page.
 *
 *  1. counts        pages per collection and locale (report)
 *  2. residual      0 Fumadocs/Code Hike constructs (src/verify/residual.ts)
 *     + math        0 prose blocks a math renderer would turn into KaTeX (two or
 *                   more `$` with one unescaped in text; see
 *                   transforms/dollar-escape.ts). Pages and snippets.
 *  3. navigation    exact nav coverage (src/nav/verify-nav.ts) + legacy URL
 *                   parity (src/verify/verify-urls.ts)
 *  4. frontmatter   parses; `type` in the allowed enum (dropped keys are
 *                   residual patterns)
 *  5. assets        every /docs-assets/* reference exists; themed pairs
 *     + RPC Try it  every RPC method page's first <RequestExample> fence is
 *                   a request rpc-try-it.js can send (src/verify/rpc-try-it.ts)
 *  6. generators    every generator passes --check
 *  7. convert       `convert --check`: the tree is converted and idempotent
 *
 * Exit code 1 when any check fails. `--skip-generators` / `--skip-convert`
 * shorten local runs.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { repoRoot, toolingRoot } from "../lib/paths.ts";
import { verifyNav } from "../nav/verify-nav.ts";
import { runConvert } from "../convert/run.ts";
import { loadRedirectIndex } from "./redirects.ts";
import { layoutKey, listLayoutPages, runVerifyUrls } from "./verify-urls.ts";
import { listSnippets, printResidual, scanResidual } from "./residual.ts";
import { mdxCodec } from "../convert/codec.ts";
import { findMathRisks } from "../convert/transforms/dollar-escape.ts";
import { scanRpcTryIt } from "./rpc-try-it.ts";

export const ALLOWED_TYPES = new Set([
  "conceptual",
  "reference",
  "tutorial",
  "guide",
]);

export const GENERATOR_CHECKS: [string, string[]][] = [
  ["examples:build --check", ["src/cli.ts", "examples", "--check"]],
  ["gen:surfpool --check", ["src/generators/surfpool-rpc.ts", "--check"]],
  ["gen:paths --check", ["src/generators/paths.ts", "--check"]],
  ["gen:concepts --check", ["src/generators/concepts.ts", "--check"]],
  ["gen:addresses --check", ["src/generators/addresses.ts", "--check"]],
  ["nav:build --check", ["src/cli.ts", "nav", "build", "--check"]],
  ["gen:tags --check", ["src/generators/tags.ts", "--check"]],
  ["gen:manifest/llms --check", ["src/manifest/cli.ts", "all", "--check"]],
];

interface Check {
  name: string;
  ok: boolean;
  detail: string[];
}

function frontmatterOf(src: string): Record<string, unknown> | string {
  const m = /^---\n([\s\S]*?)\n---/.exec(src);
  if (!m) return {};
  try {
    return (YAML.parse(m[1]!) as Record<string, unknown>) ?? {};
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export function checkFrontmatterAndAssets(
  files = [...listLayoutPages()].sort(),
) {
  const fm: string[] = [];
  const assets: string[] = [];
  const counts = new Map<string, number>();
  const assetRe =
    /(?:src=["']|\]\(|href=["']|poster=["'])(\/docs-assets\/[^"')\s#?]+)/g;
  for (const f of files) {
    const key = layoutKey(f);
    const k = key ? `${key.collection}\t${key.locale}` : "other\t-";
    counts.set(k, (counts.get(k) ?? 0) + 1);
    const src = readFileSync(path.join(repoRoot, f), "utf8");
    const data = frontmatterOf(src);
    if (typeof data === "string")
      fm.push(`${f}: frontmatter does not parse: ${data}`);
    else if (data.type !== undefined && !ALLOWED_TYPES.has(String(data.type)))
      fm.push(
        `${f}: type "${String(data.type)}" not in ${[...ALLOWED_TYPES].join("|")}`,
      );
    for (const m of src.matchAll(assetRe)) {
      let url = m[1]!;
      try {
        url = decodeURI(url);
      } catch {
        // keep
      }
      const abs = path.join(repoRoot, "apps/docs", url);
      if (!existsSync(abs)) assets.push(`${f}: missing ${m[1]}`);
      // Themed pair: X-light.svg needs X.svg and vice versa (themed-image).
      const light = /^(.*)-light(\.\w+)$/.exec(url);
      if (
        light &&
        !existsSync(path.join(repoRoot, "apps/docs", `${light[1]}${light[2]}`))
      )
        assets.push(`${f}: themed pair ${url} has no dark variant`);
    }
  }
  return { fm, assets, counts };
}

/**
 * Blocks where remark-math (single-dollar inline math) would turn prose
 * dollar amounts into KaTeX. No page intends math; a page that does can opt out with
 * `math: true` in its frontmatter.
 */
export function scanMathRisks(files: string[]): string[] {
  const out: string[] = [];
  for (const f of files) {
    const src = readFileSync(path.join(repoRoot, f), "utf8");
    if (!/\$[^]*\$/.test(src)) continue;
    const fm = frontmatterOf(src);
    if (typeof fm === "object" && fm.math === true) continue;
    let tree;
    try {
      tree = mdxCodec.parse(src, { path: f }).tree;
    } catch {
      continue; // parse failures are reported by convert --check
    }
    for (const r of findMathRisks(tree, src))
      out.push(`${f}:${r.line}: ${r.text.replace(/\s+/g, " ")}`);
  }
  return out;
}

export async function runVerify(
  opts: { generators?: boolean; convert?: boolean; json?: boolean } = {},
) {
  const checks: Check[] = [];
  const files = [...listLayoutPages()].sort();

  // 1 + 4 + 5
  const { fm, assets, counts } = checkFrontmatterAndAssets(files);
  checks.push({
    name: "counts",
    ok: true,
    detail: [...counts]
      .sort()
      .map(([k, n]) => `${k.replace("\t", " / ")}: ${n}`),
  });

  // 2
  const residual = scanResidual();
  printResidual(residual);
  checks.push({
    name: "residual syntax (0 hits)",
    ok: residual.total === 0,
    detail: residual.hits
      .slice(0, 50)
      .map((h) => `${h.pattern} ${h.file}:${h.line}`),
  });

  const math = scanMathRisks([...files, ...listSnippets()].sort());
  checks.push({
    name: "prose `$` rendered as KaTeX math (0 blocks)",
    ok: math.length === 0,
    detail: math.slice(0, 50),
  });

  // 3
  const nav = verifyNav();
  checks.push({
    name: "navigation coverage",
    ok: nav.errors.length === 0,
    detail: [...nav.errors, ...nav.warnings],
  });
  const urls = runVerifyUrls({ web: await loadRedirectIndex() });
  checks.push({
    name: `legacy URL parity (${urls.total} URLs)`,
    ok:
      !urls.failures.length &&
      !urls.moveMapProblems.length &&
      !urls.stray.length,
    detail: [
      ...urls.failures
        .slice(0, 50)
        .map((f) => `FAIL ${f.cls} ${f.url} ${f.target}`),
      ...urls.moveMapProblems.slice(0, 20),
      ...urls.stray.map((s) => `stray ${s}`),
      `missing translations (reported, not failing): ${urls.missingTranslations.length}`,
    ],
  });

  checks.push({
    name: "frontmatter",
    ok: fm.length === 0,
    detail: fm.slice(0, 50),
  });
  checks.push({
    name: "assets",
    ok: assets.length === 0,
    detail: assets.slice(0, 50),
  });

  const tryIt = scanRpcTryIt();
  const enTryIt = ["http", "ws"]
    .map((k) => `${tryIt.counts.get(`en ${k}`) ?? 0} ${k}`)
    .join(" + ");
  checks.push({
    name: `RPC Try it (en: ${enTryIt}; ${tryIt.pages.length} pages in all locales)`,
    ok: tryIt.failures.length === 0,
    detail: [
      ...tryIt.failures.slice(0, 50),
      `translated pages without a sendable example (reported, not failing): ${tryIt.localeWarnings.length}`,
    ],
  });

  // 6
  if (opts.generators !== false) {
    for (const [name, args] of GENERATOR_CHECKS) {
      const r = spawnSync("npx", ["tsx", ...args], {
        cwd: toolingRoot,
        encoding: "utf8",
      });
      const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n");
      checks.push({
        name: `generator ${name}`,
        ok: r.status === 0,
        detail: out.slice(-5),
      });
    }
  }

  // 7
  if (opts.convert !== false) {
    const r = await runConvert({ check: true });
    const errors = r.diagnostics.filter((d) => d.level === "error");
    checks.push({
      name: `convert --check (${r.files} files)`,
      ok: r.ok,
      detail: [
        ...r.changed.slice(0, 50).map((c) => `stale ${c}`),
        ...errors
          .slice(0, 20)
          .map((d) => `error ${d.transform} ${d.file}: ${d.message}`),
      ],
    });
  }

  if (opts.json) console.log(JSON.stringify(checks, null, 2));
  else {
    console.log("\nverify:");
    for (const c of checks) {
      console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name}`);
      if (!c.ok || c.name === "counts")
        for (const d of c.detail) console.log(`        ${d}`);
    }
  }
  return checks.every((c) => c.ok) ? 0 : 1;
}
