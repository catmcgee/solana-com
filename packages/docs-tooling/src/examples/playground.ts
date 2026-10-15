/**
 * "Open in Playground" source markers for generated example snippets.
 *
 * Every tab of a generated snippet that comes from a real file in
 * packages/docs-examples carries a hidden marker right before its code fence
 * (rendered by `playgroundMarker` in render.ts):
 *
 *   <div className="sol-pg" data-pg-src="packages/docs-examples/.../kit.ts"
 *     data-pg-open="packages/docs-examples/.../kit.ts" data-pg-kind="ts" />
 *
 * apps/docs/playground.js reads it and turns the code block's toolbar control
 * into a link to Solana Playground's GitHub import
 * (`<origin>/github.com/<owner>/<repo>/tree/<ref>/<data-pg-open>`) when
 * `data-pg-kind` is one the playground can import (`CONFIG.enabledKinds` there).
 * Inline tabs (no source file) get a marker without `data-pg-src`, so markers
 * stay index-aligned with the tabs of a `<CodeGroup>`.
 *
 * The kind mirrors the playground's own import pipeline (verified against the
 * deployed bundle of https://solana-playground-two.vercel.app, 2026-10-15):
 * `/{githubUrl}` lists the path with the GitHub contents API, keeps only
 * .js/.json/.py/.rs/.ts files, then requires a framework:
 *   - Anchor:   no .py file, and a `lib.rs` containing `#[program]`
 *   - Native:   any .rs containing `entrypoint!`
 *   - Seahorse: any .py containing `seahorse.prelude`
 * and finally keeps only `src/**.rs`, `client/**.{js,ts}` and
 * `tests/**.{js,ts}` (Anchor/Native). Anything else fails with "Could not
 * identify framework" / "Could not convert files". So client code (TS, JS,
 * Rust binaries, Python) gets a language kind (`ts`, `js`, `rust`, `py`) that
 * the script leaves disabled until the playground learns to import it.
 *
 * Granularity: a Rust file inside a crate (`<crate>/src/**.rs` with a
 * `<crate>/Cargo.toml`) opens the crate folder (the playground needs the
 * whole `src/` tree; this is how solana-developers/program-examples links
 * import). Every other file opens on its own. Pure apart from reading the
 * committed example tree; deterministic.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { repoRoot, toPosix } from "../lib/paths.ts";

export type PlaygroundKind =
  | "anchor"
  | "native"
  | "seahorse"
  | "ts"
  | "js"
  | "rust"
  | "py"
  | "other";

export interface PlaygroundSource {
  /** Repo-relative path of the file the tab's code is sliced from. */
  src: string;
  /** Repo-relative file or folder the playground should import. */
  open: string;
  kind: PlaygroundKind;
}

/** File types the playground's GitHub import loads (its language list). */
const PG_EXTENSIONS = new Set([".js", ".json", ".py", ".rs", ".ts"]);
const SKIP_DIRS = new Set(["node_modules", "target", ".git"]);
/** Characters the playground's GitHub URL parser accepts in a path. */
const PG_PATH = /^[\w\-/.]+$/;

function listFiles(absDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) {
        if (!SKIP_DIRS.has(name)) walk(p);
      } else if (PG_EXTENSIONS.has(path.extname(name))) out.push(p);
    }
  };
  walk(absDir);
  return out;
}

/** The playground's framework detection + layout conversion, as a kind. */
export function detectProgramKind(
  files: [path: string, content: string][],
): PlaygroundKind | undefined {
  const isAnchor =
    !files.some(([p]) => p.endsWith(".py")) &&
    files.some(([p, c]) => p.endsWith("lib.rs") && c.includes("#[program]"));
  const isNative = files.some(
    ([p, c]) => p.endsWith(".rs") && c.includes("entrypoint!"),
  );
  const isSeahorse = files.some(
    ([p, c]) => p.endsWith(".py") && c.includes("seahorse.prelude"),
  );
  const kind: PlaygroundKind | undefined = isAnchor
    ? "anchor"
    : isNative
      ? "native"
      : isSeahorse
        ? "seahorse"
        : undefined;
  if (kind === "anchor" || kind === "native") {
    // convertToPlayground keeps only these; an empty result is an error.
    const kept = files.some(
      ([p]) =>
        /(^|\/)src\/.*\.rs$/.test(p) ||
        /(^|\/)(client|tests)\/.*\.(js|ts)$/.test(p),
    );
    if (!kept) return undefined;
  }
  return kind;
}

function languageKind(file: string): PlaygroundKind {
  switch (path.extname(file)) {
    case ".ts":
    case ".tsx":
      return "ts";
    case ".js":
    case ".mjs":
      return "js";
    case ".rs":
      return "rust";
    case ".py":
      return "py";
    default:
      return "other";
  }
}

/** Marker data for a tab sliced from `fileRel` (repo-relative, posix). */
export function playgroundSource(fileRel: string): PlaygroundSource {
  const abs = path.join(repoRoot, fileRel);
  let openAbs = abs;
  const crate = /^(.*)\/src\/.+\.rs$/.exec(fileRel);
  if (crate && existsSync(path.join(repoRoot, crate[1]!, "Cargo.toml")))
    openAbs = path.join(repoRoot, crate[1]!);
  const open = toPosix(path.relative(repoRoot, openAbs));
  const files: [string, string][] = (
    openAbs === abs ? [abs] : listFiles(openAbs)
  )
    .filter((f) => PG_EXTENSIONS.has(path.extname(f)))
    .map((f) => [
      toPosix(path.relative(openAbs === abs ? path.dirname(abs) : openAbs, f)),
      readFileSync(f, "utf8"),
    ]);
  let kind = detectProgramKind(files) ?? languageKind(fileRel);
  // The playground's URL parser drops anything else from the path.
  if (!PG_PATH.test(open)) kind = "other";
  return { src: fileRel, open, kind };
}

/**
 * Marker data for a whole example folder (`dirRel`, repo-relative, posix),
 * e.g. the folder a path demo terminal runs its steps from
 * (generators/paths.ts). `files` are the step sources in that folder, in
 * step order; the kind is the playground's framework when the folder is a
 * program, else the language of the first step source.
 */
export function playgroundFolderSource(
  dirRel: string,
  files: string[],
  root = repoRoot,
): PlaygroundSource | undefined {
  const abs = path.join(root, dirRel);
  if (!files.length || !existsSync(abs)) return undefined;
  const contents: [string, string][] = listFiles(abs).map((f) => [
    toPosix(path.relative(abs, f)),
    readFileSync(f, "utf8"),
  ]);
  let kind = detectProgramKind(contents) ?? languageKind(files[0]!);
  if (!PG_PATH.test(dirRel)) kind = "other";
  return { src: files[0]!, open: dirRel, kind };
}
