/**
 * `examples extract [--dry-run]` (spec §4.1 `examples:extract`, §4.2 step 3).
 *
 * Reads every content page under apps/docs (READ-ONLY), finds the legacy
 * example blocks (`<CodeTabs>` of `file=packages/docs-examples/...` fences,
 * or a bare include fence) and writes their definitions into
 * `packages/docs-examples/<dir>/blocks.json`. Pages are rewritten to import
 * the generated snippets by the `codetabs-examples` convert transform, which
 * derives the same ids from the same fences (src/examples/blocks.ts).
 *
 * Entries already in a blocks.json that no page references (for example the
 * hand-written job-path blocks) are kept. An extracted definition that
 * disagrees with an existing entry of the same id is a conflict and fails.
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { docsRoot, repoRoot, toPosix } from "../lib/paths.ts";
import { mdxCodec } from "../convert/codec.ts";
import {
  normalizeBlock,
  sameBlock,
  stableJson,
  type Block,
  type BlocksFile,
} from "./blocks.ts";
import { scanExampleBlocks } from "./mdast.ts";

export const examplesRoot = path.join(repoRoot, "packages", "docs-examples");

export interface ExtractResult {
  /** id -> block definition. */
  blocks: Map<string, Block>;
  /** id -> repo-relative pages that use it. */
  usage: Map<string, string[]>;
  conflicts: string[];
  problems: string[];
  /** blocks.json files written (or that would be, with dryRun). */
  written: string[];
  pagesScanned: number;
}

const SKIP_DIRS = new Set(["node_modules", "snippets", ".git"]);
/** Repo docs at the Mintlify root that are not pages (they quote the syntax). */
const SKIP_FILES = new Set(["CONTRIBUTING.md", "README.md"]);

export function listContentPages(root = docsRoot): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) {
        if (!SKIP_DIRS.has(name)) walk(p);
      } else if (/\.mdx?$/.test(name) && !SKIP_FILES.has(name)) out.push(p);
    }
  };
  walk(root);
  return out;
}

export function extractBlocks(
  opts: { dryRun?: boolean; pages?: string[] } = {},
): ExtractResult {
  const res: ExtractResult = {
    blocks: new Map(),
    usage: new Map(),
    conflicts: [],
    problems: [],
    written: [],
    pagesScanned: 0,
  };
  const pages = opts.pages ?? listContentPages();
  for (const abs of pages) {
    const source = readFileSync(abs, "utf8");
    if (!source.includes("file=packages/docs-examples/")) continue;
    res.pagesScanned++;
    const rel = toPosix(path.relative(repoRoot, abs));
    const { tree } = mdxCodec.parse(source, { path: rel });
    const scan = scanExampleBlocks(tree);
    for (const p of scan.problems) res.problems.push(`${rel}: ${p.message}`);
    for (const { ref } of scan.blocks) {
      const prev = res.blocks.get(ref.id);
      if (prev && !sameBlock(prev, ref.block)) {
        res.conflicts.push(
          `${ref.id}: ${rel} defines it differently from ${res.usage.get(ref.id)?.[0]}\n    ${JSON.stringify(normalizeBlock(ref.block))}\n    ${JSON.stringify(normalizeBlock(prev))}`,
        );
        continue;
      }
      res.blocks.set(ref.id, prev ?? normalizeBlock(ref.block));
      const u = res.usage.get(ref.id) ?? [];
      if (!u.includes(rel)) u.push(rel);
      res.usage.set(ref.id, u);
    }
  }

  // Group by directory and merge into blocks.json files.
  const byDir = new Map<string, Map<string, Block>>();
  for (const [id, block] of res.blocks) {
    const dir = id.slice(0, id.lastIndexOf("/"));
    const name = id.slice(id.lastIndexOf("/") + 1);
    if (!byDir.has(dir)) byDir.set(dir, new Map());
    byDir.get(dir)!.set(name, block);
  }
  for (const [dir, entries] of [...byDir].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const file = path.join(examplesRoot, dir, "blocks.json");
    if (!existsSync(path.dirname(file))) {
      res.problems.push(
        `${dir}: directory does not exist in packages/docs-examples`,
      );
      continue;
    }
    const current: BlocksFile = existsSync(file)
      ? (JSON.parse(readFileSync(file, "utf8")) as BlocksFile)
      : {};
    const next: BlocksFile = { ...current };
    for (const [name, block] of entries) {
      const have = current[name];
      if (have && !sameBlock(have, block)) {
        res.conflicts.push(
          `${dir}/${name}: blocks.json entry differs from the page definition (edit blocks.json or the page)`,
        );
        continue;
      }
      next[name] = have ?? block;
    }
    const sorted = Object.fromEntries(
      Object.keys(next)
        .sort()
        .map((k) => [k, next[k]]),
    );
    const text = stableJson(sorted);
    if (!existsSync(file) || readFileSync(file, "utf8") !== text) {
      res.written.push(toPosix(path.relative(repoRoot, file)));
      if (!opts.dryRun) writeFileSync(file, text);
    }
  }
  return res;
}
