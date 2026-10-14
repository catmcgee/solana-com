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
import type { ConvertContext, ConvertFile, Collection } from "../types.ts";
import { repoRoot } from "../lib/paths.ts";
import { DEFAULT_LOCALE, LEGACY_LOCALES } from "../lib/locales.ts";
import { listLayoutPages, layoutKey } from "../verify/verify-urls.ts";
import { TransformRegistry, defaultTransforms } from "./registry.ts";
import { mdxCodec, type Codec } from "./codec.ts";

export { mdxCodec, rawCodec, stringifyFresh, type Codec } from "./codec.ts";

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
  codec: Codec = mdxCodec,
): { output: string; diagnostics: Diagnostic[] } {
  const transforms = registry.list((t) =>
    t.appliesTo ? t.appliesTo(source, { ...file, frontmatter: {} }) : true,
  );
  if (transforms.length === 0) return { output: source, diagnostics: [] };
  const diagnostics: Diagnostic[] = [];
  let parsed: ReturnType<Codec["parse"]>;
  try {
    parsed = codec.parse(source, { path: file.path });
  } catch (err) {
    diagnostics.push({
      file: file.path,
      level: "error",
      transform: `codec:${codec.name}`,
      message: `parse failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return { output: source, diagnostics };
  }
  const { tree, frontmatter } = parsed;
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
    try {
      t.run(tree, { ...file, frontmatter, source }, ctx);
    } catch (err) {
      // The tree may be half-mutated: keep the file as it was.
      diagnostics.push({
        file: file.path,
        level: "error",
        transform: t.name,
        message: `threw: ${err instanceof Error ? err.message : String(err)}`,
      });
      return { output: source, diagnostics };
    }
  }
  return { output: codec.stringify(tree, frontmatter), diagnostics };
}

export interface ConvertOptions {
  /** Path prefix, or a comma-separated list of prefixes. */
  files?: string;
  /** Path prefixes to skip (relative to apps/docs, or repo-relative). */
  exclude?: string[];
  locale?: string;
  check?: boolean;
  /** Convert in memory and report changes, without writing or failing. */
  dryRun?: boolean;
  registry?: TransformRegistry;
  codec?: Codec;
}

export async function runConvert(opts: ConvertOptions = {}) {
  const registry = opts.registry ?? (await defaultTransforms());
  const all = [...listLayoutPages()].sort();
  const filePrefixes = opts.files
    ?.split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const selected = all.filter((f) => {
    const key = layoutKey(f);
    if (!key) return false;
    if (opts.locale && key.locale !== opts.locale) return false;
    if (
      filePrefixes?.length &&
      !filePrefixes.some(
        (x) => f.startsWith(x) || f.startsWith(`apps/docs/${x}`),
      )
    )
      return false;
    if (
      opts.exclude?.some(
        (x) => f.startsWith(x) || f.startsWith(`apps/docs/${x}`),
      )
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
      if (!opts.check && !opts.dryRun) writeFileSync(abs, res.output);
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
