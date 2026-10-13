/**
 * `convert [--files <prefix>] [--locale <loc>] [--check]` (spec §4.1).
 *
 * Converts every content file independently (locales are not projected from
 * English). With `--check`, converts in memory and fails if any file would
 * change, which is how CI proves the committed tree is converted and the
 * transforms are idempotent.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  AstNode,
  ConvertContext,
  ConvertFile,
  Collection,
} from "../types.ts";
import { repoRoot } from "../lib/paths.ts";
import { DEFAULT_LOCALE, LEGACY_LOCALES } from "../lib/locales.ts";
import { listLayoutPages, layoutKey } from "../verify/verify-urls.ts";
import { TransformRegistry, defaultTransforms } from "./registry.ts";

/** Parse/serialize step. WP2 supplies the unified + remark-mdx codec. */
export interface Codec {
  name: string;
  parse(source: string): {
    tree: AstNode;
    frontmatter: Record<string, unknown>;
  };
  stringify(tree: AstNode, frontmatter: Record<string, unknown>): string;
}

/**
 * Placeholder codec: the whole file is one `raw` node. Lets the runner, the
 * fixture harness and text-level transforms work before WP2 lands a parser.
 */
export const rawCodec: Codec = {
  name: "raw",
  parse(source) {
    return {
      tree: { type: "root", children: [{ type: "raw", value: source }] },
      frontmatter: {},
    };
  },
  stringify(tree) {
    return (tree.children ?? []).map((n) => String(n.value ?? "")).join("");
  },
};

export interface Diagnostic {
  file: string;
  level: "warn" | "error";
  transform: string;
  message: string;
}

export function convertSource(
  source: string,
  file: Omit<ConvertFile, "frontmatter">,
  registry: TransformRegistry,
  codec: Codec = rawCodec,
): { output: string; diagnostics: Diagnostic[] } {
  const transforms = registry.list((t) =>
    t.appliesTo ? t.appliesTo(source, { ...file, frontmatter: {} }) : true,
  );
  if (transforms.length === 0) return { output: source, diagnostics: [] };
  const { tree, frontmatter } = codec.parse(source);
  const diagnostics: Diagnostic[] = [];
  for (const t of transforms) {
    const ctx: ConvertContext = {
      repoRoot,
      warn: (message) =>
        diagnostics.push({
          file: file.path,
          level: "warn",
          transform: t.name,
          message,
        }),
      error: (message) =>
        diagnostics.push({
          file: file.path,
          level: "error",
          transform: t.name,
          message,
        }),
    };
    t.run(tree, { ...file, frontmatter }, ctx);
  }
  return { output: codec.stringify(tree, frontmatter), diagnostics };
}

export interface ConvertOptions {
  files?: string;
  locale?: string;
  check?: boolean;
  registry?: TransformRegistry;
  codec?: Codec;
}

export function runConvert(opts: ConvertOptions = {}) {
  const registry = opts.registry ?? defaultTransforms();
  const all = [...listLayoutPages()].sort();
  const selected = all.filter((f) => {
    const key = layoutKey(f);
    if (!key) return false;
    if (opts.locale && key.locale !== opts.locale) return false;
    if (
      opts.files &&
      !f.startsWith(opts.files) &&
      !f.startsWith(`apps/docs/${opts.files}`)
    )
      return false;
    return true;
  });
  const changed: string[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const f of selected) {
    const key = layoutKey(f)!;
    const abs = path.join(repoRoot, f);
    const source = readFileSync(abs, "utf8");
    const res = convertSource(
      source,
      {
        path: f,
        locale: LEGACY_LOCALES.includes(key.locale)
          ? key.locale
          : DEFAULT_LOCALE,
        collection: key.collection as Collection,
      },
      registry,
      opts.codec,
    );
    diagnostics.push(...res.diagnostics);
    if (res.output !== source) {
      changed.push(f);
      if (!opts.check) writeFileSync(abs, res.output);
    }
  }
  const errors = diagnostics.filter((d) => d.level === "error");
  return {
    transforms: registry.list().map((t) => t.name),
    files: selected.length,
    changed,
    diagnostics,
    ok: errors.length === 0 && (!opts.check || changed.length === 0),
  };
}
