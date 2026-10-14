/**
 * Example block manifests (spec §3.1 `codetabs-examples`, §3.4 item 4;
 * examples-runner inventory §2.2).
 *
 * A *block* is what the legacy `<CodeTabs flags="r">` (or a bare fence) with
 * `file=packages/docs-examples/...#region=...` fences rendered: one or more
 * flavour tabs, each a slice of a tested source file. Blocks are declared in
 * `packages/docs-examples/<dir>/blocks.json`, next to the code they slice:
 *
 *   { "transfer": { "runnable": true, "tabs": [
 *       { "title": "Kit", "lang": "ts", "file": "kit.ts", "region": "transfer" },
 *       { "title": "Legacy", "lang": "ts", "file": "legacy.ts", "region": "transfer", "highlight": "24-30" } ] } }
 *
 * Block id = `<dir>/<name>` (dir relative to packages/docs-examples), which is
 * also the generated snippet path: `apps/docs/snippets/examples/<id>.mdx`.
 *
 * Everything in this module is pure: the convert transform uses the same
 * naming functions as the extractor and the generator, so a page's import
 * line and the generated snippet always agree without any I/O.
 */
import path from "node:path";
import { parseLegacyFenceMeta, type LegacyFenceMeta } from "./include.ts";

export const EXAMPLES_PREFIX = "packages/docs-examples/";
export const SNIPPETS_PREFIX = "/snippets/examples/";

/** Browser runners ported to run-examples.js (legacy runner id -> new id). */
export const RUNNER_IDS: Readonly<Record<string, string>> = {
  "cookbook/wallets/create-keypair": "generate-keypair",
};

export interface BlockTab {
  /** Tab label (Kit, Legacy, Rust, Python...). */
  title: string;
  /** Fence language, normalized (ts, rust, py...). */
  lang: string;
  /**
   * Source file, relative to the blocks.json directory (posix). Absent only
   * for an inline tab (`code`).
   */
  file?: string;
  /**
   * Inline code for a tab that has no tested source file (the legacy page had
   * an inline fence next to include fences). Prefer adding a real file.
   */
  code?: string;
  region?: string;
  /** 1-based line ranges within the slice, e.g. "24-30" or "8,10-12". */
  highlight?: string;
  /** Explicit recorded-output file, relative to the blocks.json directory. */
  output?: string;
  /** Overrides the block's outputNote for this tab. */
  outputNote?: string;
}

export interface Block {
  /**
   * True when the legacy block had a Run button (`flags="r"`). Only runnable
   * blocks show recorded output, and only tabs that HAVE an output get one
   * (decisions.md: no Run button without recorded output).
   */
  runnable: boolean;
  /** In-browser runner id from run-examples.js (e.g. "generate-keypair"). */
  runner?: string;
  /** Overrides the default "Output recorded on a local Surfpool network". */
  outputNote?: string;
  tabs: BlockTab[];
}

export type BlocksFile = Record<string, Block>;

const LANG_ALIASES: Record<string, string> = {
  typescript: "ts",
  javascript: "js",
  python: "py",
  rs: "rust",
};

export function normalizeLang(lang: string | null | undefined): string {
  const l = (lang ?? "").toLowerCase();
  return LANG_ALIASES[l] ?? l;
}

/** One legacy fence that includes an example file (or, inline, carries code). */
export interface IncludeFence {
  lang: string;
  meta: LegacyFenceMeta;
  /** Path relative to packages/docs-examples ("" for an inline fence). */
  file: string;
  /** Inline fence body (only when `file` is ""). */
  code?: string;
}

/** Parse a fence; null when it does not include a docs-examples file. */
export function includeFence(node: {
  lang?: string | null;
  meta?: string | null;
}): IncludeFence | null {
  const meta = parseLegacyFenceMeta(node.meta);
  if (!meta.file || !meta.file.startsWith(EXAMPLES_PREFIX)) return null;
  return {
    lang: normalizeLang(node.lang),
    meta,
    file: meta.file.slice(EXAMPLES_PREFIX.length),
  };
}

/**
 * The directory that owns a block: the deepest common directory of its tab
 * files, with a trailing `rust/...` crate path removed so Rust-only blocks
 * live beside their TS/Python siblings.
 */
export function blockDir(files: string[]): string {
  const parts = files.map((f) => path.posix.dirname(f).split("/"));
  const common: string[] = [];
  for (let i = 0; ; i++) {
    const seg = parts[0]![i];
    if (seg === undefined || parts.some((p) => p[i] !== seg)) break;
    common.push(seg);
  }
  const rust = common.indexOf("rust");
  return (rust > 0 ? common.slice(0, rust) : common).join("/");
}

/** Block name: the first tab's region, else its file stem. */
export function blockName(first: IncludeFence): string {
  if (first.meta.region) return first.meta.region;
  return path.posix.basename(first.file).replace(/\.[^.]+$/, "");
}

export interface BlockRef {
  /** `<dir>/<name>`, also the snippet path below snippets/examples. */
  id: string;
  dir: string;
  name: string;
  block: Block;
}

/**
 * Build the block a legacy group of include fences describes. `runnable` and
 * `runner` come from the `<CodeTabs>` wrapper (or a `-r` fence flag).
 */
export function blockFromFences(
  fences: IncludeFence[],
  opts: { runnable: boolean; runner?: string },
): BlockRef {
  const included = fences.filter((f) => f.file);
  if (included.length === 0)
    throw new Error("a block needs at least one docs-examples include fence");
  const dir = blockDir(included.map((f) => f.file));
  const name = blockName(included[0]!);
  const runnable =
    opts.runnable || fences.some((f) => f.meta.flags.includes("r"));
  const tabs = fences.map((f): BlockTab => {
    const tab: BlockTab = {
      title: f.meta.title || defaultTitle(f.lang),
      lang: f.lang,
    };
    if (f.file) tab.file = path.posix.relative(dir, f.file);
    else tab.code = f.code ?? "";
    if (f.meta.region) tab.region = f.meta.region;
    if (f.meta.highlight) tab.highlight = f.meta.highlight;
    if (f.meta.output) {
      const out = f.meta.output.startsWith(EXAMPLES_PREFIX)
        ? f.meta.output.slice(EXAMPLES_PREFIX.length)
        : f.meta.output;
      tab.output = path.posix.relative(dir, out);
    }
    return tab;
  });
  const block: Block = { runnable, tabs };
  if (opts.runner) block.runner = RUNNER_IDS[opts.runner] ?? opts.runner;
  return { id: `${dir}/${name}`, dir, name, block };
}

function defaultTitle(lang: string) {
  return (
    { ts: "TypeScript", js: "JavaScript", rust: "Rust", py: "Python" }[lang] ??
    lang
  );
}

/** Snippet import path for a block id. */
export function snippetImportPath(id: string): string {
  return `${SNIPPETS_PREFIX}${id}.mdx`;
}

/**
 * MDX component name for a block on a page: PascalCase of the last directory
 * segment and the block name, e.g. `cookbook/transactions/send-sol/transfer`
 * -> `SendSolTransfer`. Always starts with a letter.
 */
export function componentName(id: string): string {
  const segs = id.split("/");
  const dir = segs.at(-2) ?? "";
  const name = segs.at(-1) ?? "";
  const words = (dir === name ? name : `${dir}-${name}`)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const pascal = words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join("");
  return /^[A-Za-z]/.test(pascal) ? pascal : `Example${pascal}`;
}

/** Stable JSON for blocks.json / index.json (2-space, trailing newline). */
export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Two block definitions describe the same rendered block. */
export function sameBlock(a: Block, b: Block): boolean {
  return (
    JSON.stringify(normalizeBlock(a)) === JSON.stringify(normalizeBlock(b))
  );
}

export function normalizeBlock(b: Block): Block {
  const out: Block = {
    runnable: b.runnable,
    tabs: b.tabs.map((t) => {
      const tab: BlockTab = { title: t.title, lang: normalizeLang(t.lang) };
      if (t.file !== undefined) tab.file = t.file;
      if (t.code !== undefined) tab.code = t.code;
      if (t.region) tab.region = t.region;
      if (t.highlight) tab.highlight = t.highlight;
      if (t.output) tab.output = t.output;
      if (t.outputNote) tab.outputNote = t.outputNote;
      return tab;
    }),
  };
  if (b.runner) out.runner = b.runner;
  if (b.outputNote) out.outputNote = b.outputNote;
  return out;
}
