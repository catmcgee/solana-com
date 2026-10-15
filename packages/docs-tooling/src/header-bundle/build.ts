/**
 * gen:header: bundle the real solana.com header for the Mintlify docs.
 *
 * Outputs (both generated in full; never edit them by hand):
 *
 * - `apps/docs/header.js`: esbuild bundle of `runtime/entry.jsx`, which
 *   renders the unmodified `packages/ui-chrome/src/header.tsx` (and
 *   everything it imports) with React 19 / ReactDOM and next-intl, resolved
 *   from packages/ui-chrome exactly as apps/web resolves them.
 * - `apps/docs/styles/header.css`: Tailwind 3 compiled with apps/web's
 *   `tailwind.config.js` over the ui-chrome files in the bundle, every rule
 *   scoped to `#sol-hdr` (preflight included), keyframes renamed
 *   `sol-hdr-*`, plus apps/web globals.css's dark /developers header rule and
 *   the hand-written integration rules (`integration.css`).
 *
 * Module map (everything else is the real module):
 *
 * | import                     | becomes                                         |
 * | -------------------------- | ----------------------------------------------- |
 * | `next/link`                | runtime/shims/next-link.jsx (plain `<a>`)       |
 * | `next/navigation`          | runtime/shims/next-navigation.js (location)     |
 * | `next/compat/router`       | runtime/shims/next-compat-router.js (null)      |
 * | `next/dynamic`             | runtime/shims/next-dynamic.jsx (renders null)   |
 * | `@radix-ui/react-portal`   | runtime/shims/radix-portal.jsx (portal host)    |
 * | `@inkeep/cxkit-react`      | external, never loaded (dynamic import only)    |
 * | `*.inline.svg`             | SVGR with apps/web next.config.ts's options     |
 * | other `*.svg`, `*.png`     | `""` / `{ src: "" }` (Inkeep settings only)     |
 * | `sol-header:messages`      | web messages for every docs locale (pruned)     |
 * | `sol-header:config`        | docs locales and Mintlify language codes        |
 *
 * esbuild, Tailwind 3, PostCSS and SVGR are resolved from the packages that
 * already depend on them (tsx, apps/web), so this package gains no
 * dependencies and builds with the versions solana.com builds with.
 *
 * `--check` rebuilds in memory and fails when either file differs (stale
 * against ui-chrome, @workspace/i18n messages, apps/web's Tailwind config or
 * globals.css, or this directory).
 *
 * Usage: `pnpm --filter @workspace/docs-tooling gen:header [--check]`.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadMergedMessages } from "@workspace/i18n/messages";
import {
  repoRoot,
  docsRoot as defaultDocsRoot,
  toPosix,
} from "../lib/paths.ts";
import {
  DEFAULT_LOCALE,
  MINTLIFY_LANGUAGE_CODE,
  TARGET_LOCALES,
} from "../lib/locales.ts";
import {
  emptyResult,
  finish,
  isMain,
  parseFlags,
  printResult,
  type GeneratorOptions,
  type GeneratorResult,
} from "../generators/_lib.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeDir = path.join(here, "runtime");
const shimsDir = path.join(runtimeDir, "shims");
const uiChromeDir = path.join(repoRoot, "packages/ui-chrome");
const uiChromeSrc = path.join(uiChromeDir, "src");
const webDir = path.join(repoRoot, "apps/web");

export const JS_FILE = "header.js";
export const CSS_FILE = "styles/header.css";
const SCOPE = "#sol-hdr";
const DOCS_LOCALES = [DEFAULT_LOCALE, ...TARGET_LOCALES];

// ---------------------------------------------------------------------------
// Borrowed tools (minimal shapes; this package does not depend on them)
// ---------------------------------------------------------------------------

interface ResolveArgs {
  path: string;
  importer: string;
  namespace: string;
  resolveDir: string;
  kind: string;
  pluginData?: unknown;
}
interface LoadArgs {
  path: string;
  namespace: string;
}
interface PluginBuild {
  onResolve(
    o: { filter: RegExp; namespace?: string },
    cb: (a: ResolveArgs) => unknown,
  ): void;
  onLoad(
    o: { filter: RegExp; namespace?: string },
    cb: (a: LoadArgs) => unknown,
  ): void;
  resolve(
    p: string,
    o: { resolveDir: string; kind: string; pluginData?: unknown },
  ): Promise<{ path: string; errors: Array<{ text: string }> }>;
}
interface Esbuild {
  build(o: Record<string, unknown>): Promise<{
    outputFiles: Array<{ text: string }>;
    metafile: { inputs: Record<string, unknown> };
  }>;
}
interface PostcssNode {
  type: string;
  toString(): string;
}
interface PostcssRule extends PostcssNode {
  selector: string;
  selectors: string[];
  nodes: PostcssNode[];
  parent?: { type: string; name?: string };
}
interface PostcssRoot {
  walkRules(cb: (r: PostcssRule) => void): void;
  walkAtRules(
    name: string,
    cb: (r: { params: string; parent?: unknown }) => void,
  ): void;
  walkDecls(cb: (d: { prop: string; value: string }) => void): void;
  toString(): string;
}
interface Postcss {
  (plugins: unknown[]): {
    process(css: string, o: { from: undefined }): Promise<{ css: string }>;
  };
  parse(css: string): PostcssRoot;
}
interface SvgrCore {
  transform(
    svg: string,
    config: Record<string, unknown>,
    state: Record<string, unknown>,
  ): Promise<string>;
}

function tools() {
  const toolingRequire = createRequire(import.meta.url);
  const tsxRequire = createRequire(toolingRequire.resolve("tsx/package.json"));
  const webRequire = createRequire(path.join(webDir, "package.json"));
  const svgrRequire = createRequire(
    webRequire.resolve("@svgr/webpack/package.json"),
  );
  return {
    esbuild: tsxRequire("esbuild") as Esbuild,
    tailwind: webRequire("tailwindcss") as (cfg: unknown) => unknown,
    postcss: webRequire("postcss") as Postcss,
    sass: webRequire("sass") as {
      compile(
        file: string,
        o: Record<string, unknown>,
      ): { css: string; loadedUrls: URL[] };
    },
    svgr: svgrRequire("@svgr/core") as SvgrCore,
    svgo: svgrRequire("@svgr/plugin-svgo") as unknown,
    jsx: svgrRequire("@svgr/plugin-jsx") as unknown,
  };
}

// ---------------------------------------------------------------------------
// SVGR: the options apps/web passes to @svgr/webpack for *.inline.svg
// ---------------------------------------------------------------------------

/** The `options` object of the @svgr/webpack rule in apps/web next.config.ts. */
export function webSvgrOptions(): Record<string, unknown> {
  const file = path.join(webDir, "next.config.ts");
  const src = readFileSync(file, "utf8");
  const at = src.search(/loader:\s*"@svgr\/webpack",\s*options:\s*\{/);
  if (at < 0)
    throw new Error(
      "apps/web/next.config.ts: the @svgr/webpack rule was not found",
    );
  const start = src.indexOf("{", src.indexOf("options:", at));
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0)
      return new Function(`return (${src.slice(start, i + 1)});`)() as Record<
        string,
        unknown
      >;
  }
  throw new Error("apps/web/next.config.ts: unbalanced @svgr/webpack options");
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

type Messages = Record<string, unknown>;

function nodeAt(m: Messages, key: string): unknown {
  let cur: unknown = m;
  for (const k of key.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Messages)[k];
  }
  return cur;
}

function setAt(m: Messages, key: string, value: unknown) {
  const parts = key.split(".");
  let cur = m;
  for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {}) as Messages;
  cur[parts.at(-1)!] = value;
}

function leaves(v: unknown, prefix: string, out: Map<string, unknown>) {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, x] of Object.entries(v)) leaves(x, `${prefix}.${k}`, out);
  } else out.set(prefix, v);
  return out;
}

/**
 * Message keys ui-chrome can ask for: every string literal in the bundled
 * ui-chrome sources that names a message (or a message subtree, for
 * `t.raw`) in English common.json. ui-chrome builds no keys at runtime
 * (titles and descriptions are `titleKey`/`descriptionKey` literals in its
 * nav config).
 */
export function messageKeys(sources: string[], en: Messages): string[] {
  const keys = new Set<string>();
  for (const src of sources)
    for (const m of src.matchAll(/["'`]([a-zA-Z][\w-]*(?:\.[\w-]+)+)["'`]/g))
      if (nodeAt(en, m[1]!) !== undefined) keys.add(m[1]!);
  // Drop keys inside another kept subtree.
  const sorted = [...keys].sort();
  return sorted.filter(
    (k) => !sorted.some((p) => p !== k && k.startsWith(`${p}.`)),
  );
}

/**
 * English (pruned to `keys`) and, per docs locale, the leaves that differ
 * from it. The runtime overlays a locale's leaves on English, which is what
 * `loadMergedMessages` gives apps/web (English merged under the locale).
 */
export async function buildMessages(keys: string[]) {
  const pick = (m: Messages) => {
    const out: Messages = {};
    for (const k of keys) {
      const v = nodeAt(m, k);
      if (v !== undefined) setAt(out, k, v);
    }
    return out;
  };
  const en = pick(
    (await loadMergedMessages({
      app: "web",
      locale: DEFAULT_LOCALE,
    })) as Messages,
  );
  const enLeaves = leaves(en, "", new Map());
  const overrides: Record<string, Record<string, unknown>> = {};
  for (const locale of TARGET_LOCALES) {
    const m = pick(
      (await loadMergedMessages({ app: "web", locale })) as Messages,
    );
    const diff: Record<string, unknown> = {};
    for (const [k, v] of leaves(m, "", new Map()))
      if (enLeaves.get(k) !== v) diff[k.slice(1)] = v;
    overrides[locale] = diff;
  }
  return { en, overrides };
}

// ---------------------------------------------------------------------------
// JS bundle
// ---------------------------------------------------------------------------

const NEXT_SHIMS: Record<string, string> = {
  "next/link": "next-link.jsx",
  "next/navigation": "next-navigation.js",
  "next/compat/router": "next-compat-router.js",
  "next/dynamic": "next-dynamic.jsx",
};

interface BundleOut {
  js: string;
  /** Repo-relative paths of every bundled file. */
  inputs: string[];
}

async function bundle(
  t: ReturnType<typeof tools>,
  virtual: { messages: string; config: string },
  overrides: SourceOverrides = {},
): Promise<BundleOut> {
  const overridden = new Map(
    Object.entries(overrides).map(([rel, text]) => [
      path.join(repoRoot, rel),
      text,
    ]),
  );
  const svgrOptions = webSvgrOptions();
  const portalWrapper = readFileSync(
    path.join(shimsDir, "radix-portal.jsx"),
    "utf8",
  );
  const res = await t.esbuild.build({
    absWorkingDir: repoRoot,
    entryPoints: [path.join(runtimeDir, "entry.jsx")],
    bundle: true,
    write: false,
    metafile: true,
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    minify: true,
    charset: "utf8",
    legalComments: "eof",
    jsx: "automatic",
    logLevel: "silent",
    external: ["@inkeep/cxkit-react"],
    define: {
      "process.env.NODE_ENV": '"production"',
      // ui-chrome url-config.ts: the docs app's internal routes (/docs/*,
      // /learn/<slug>, /developers/cookbook|bootcamp/*) use next-intl links.
      "process.env.NEXT_PUBLIC_APP_NAME": '"docs"',
    },
    plugins: [
      {
        name: "sol-header",
        setup(b: PluginBuild) {
          // Test hook (buildHeader's `overrides`): load edited sources from
          // memory instead of disk. Registered first, so it wins.
          if (overridden.size)
            b.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, (a) => {
              const text = overridden.get(path.normalize(a.path));
              if (text === undefined) return undefined;
              const ext = path.extname(a.path).slice(1).replace(/^[cm]/, "");
              return {
                contents: text,
                loader: ext,
                resolveDir: path.dirname(a.path),
              };
            });
          b.onResolve({ filter: /^sol-header:(messages|config)$/ }, (a) => ({
            path: a.path.slice("sol-header:".length),
            namespace: "sol-virtual",
          }));
          b.onLoad({ filter: /.*/, namespace: "sol-virtual" }, (a) => ({
            contents: a.path === "messages" ? virtual.messages : virtual.config,
            loader: "js",
          }));
          b.onResolve({ filter: /^sol-ui-chrome\// }, async (a) => {
            const r = await b.resolve(
              `./${a.path.slice("sol-ui-chrome/".length)}`,
              { resolveDir: uiChromeSrc, kind: a.kind },
            );
            return r.errors.length ? { errors: r.errors } : { path: r.path };
          });
          b.onResolve({ filter: /^next(\/|$)/ }, (a) => {
            const shim = NEXT_SHIMS[a.path];
            if (shim) return { path: path.join(shimsDir, shim) };
            return {
              errors: [
                {
                  text: `${a.path} (from ${path.relative(repoRoot, a.importer)}) has no shim in header-bundle/runtime/shims`,
                },
              ],
            };
          });
          b.onResolve({ filter: /^@radix-ui\/react-portal$/ }, async (a) => {
            if (a.namespace === "sol-portal" || a.pluginData === "real")
              return undefined;
            const r = await b.resolve(a.path, {
              resolveDir: a.resolveDir,
              kind: a.kind,
              pluginData: "real",
            });
            if (r.errors.length) return { errors: r.errors };
            return { path: r.path, namespace: "sol-portal" };
          });
          b.onLoad({ filter: /.*/, namespace: "sol-portal" }, (a) => ({
            contents: portalWrapper.replaceAll(
              '"sol-header:real-portal"',
              JSON.stringify(a.path),
            ),
            loader: "jsx",
            resolveDir: shimsDir,
          }));
          // The runtime's own bare imports (react, react-dom, next-intl)
          // resolve from ui-chrome: one React, the one ui-chrome gets.
          b.onResolve({ filter: /^[^./]/ }, async (a) => {
            const ours =
              a.importer.startsWith(runtimeDir) || a.namespace === "sol-portal";
            if (!ours || a.pluginData === "ui") return undefined;
            const r = await b.resolve(a.path, {
              resolveDir: uiChromeSrc,
              kind: a.kind,
              pluginData: "ui",
            });
            return r.errors.length ? { errors: r.errors } : { path: r.path };
          });
          b.onLoad({ filter: /\.inline\.svg$/ }, async (a) => {
            const svg = readFileSync(a.path, "utf8");
            const code = await t.svgr.transform(svg, svgrOptions, {
              caller: {
                name: "@svgr/webpack",
                defaultPlugins: [t.svgo, t.jsx],
              },
              filePath: path.normalize(a.path),
            });
            return { contents: code, loader: "jsx", resolveDir: uiChromeSrc };
          });
          // Registered after *.inline.svg, so only the other SVGs get here.
          b.onLoad({ filter: /\.svg$/ }, () => ({
            contents: 'export default "";',
            loader: "js",
          }));
          b.onLoad({ filter: /\.(png|webp|jpe?g|ico)$/ }, () => ({
            contents: 'export default { src: "" };',
            loader: "js",
          }));
        },
      },
    ],
  });
  const inputs = Object.keys(res.metafile.inputs)
    .filter((p) => !p.startsWith("sol-virtual:"))
    .map((p) => p.replace(/^sol-portal:/, ""))
    .map((p) => toPosix(path.relative(repoRoot, path.resolve(repoRoot, p))))
    .sort();
  return { js: res.outputFiles[0]!.text, inputs };
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

/** Prefix one selector with the scope (`html`/`body`/`:host` become it). */
function scopeSelector(sel: string): string {
  const s = sel.trim();
  if (/^(html|body|:host|:root)$/.test(s)) return SCOPE;
  if (s === "*") return `${SCOPE}, ${SCOPE} *`;
  return `${SCOPE} ${s.replace(/^(html|body|:host)\s+/, "")}`;
}

/** Rename keyframes (they are global) and point animations at the new names. */
function renameKeyframes(root: PostcssRoot) {
  const names = new Set<string>();
  root.walkAtRules("keyframes", (r) => {
    names.add(r.params);
  });
  root.walkAtRules("keyframes", (r) => {
    r.params = `sol-hdr-${r.params}`;
  });
  root.walkDecls((d) => {
    if (!/^(-webkit-)?animation(-name)?$/.test(d.prop)) return;
    d.value = d.value.replace(/[\w-]+/g, (w) =>
      names.has(w) ? `sol-hdr-${w}` : w,
    );
  });
}

async function compileTailwind(
  t: ReturnType<typeof tools>,
  sources: string[],
): Promise<{ base: string; utilities: string }> {
  const webConfig = (
    await import(pathToFileURL(path.join(webDir, "tailwind.config.js")).href)
  ).default as Record<string, unknown>;
  const content = [{ raw: sources.join("\n"), extension: "tsx" }];
  const run = (input: string, extra: Record<string, unknown>) =>
    t
      .postcss([t.tailwind({ ...webConfig, content, ...extra }) as never])
      .process(input, { from: undefined })
      .then((r) => t.postcss.parse(r.css));

  // Base (preflight + the --tw-* defaults), every selector scoped.
  const base = await run("@tailwind base;", {});
  base.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && rule.parent.name === "keyframes")
      return;
    rule.selectors = [
      ...new Set(rule.selectors.flatMap((s) => scopeSelector(s).split(", "))),
    ];
  });
  const baseCss = base.toString();

  // Utilities, with the scope as the important selector.
  const util = await run("@tailwind components;\n@tailwind utilities;", {
    important: SCOPE,
    corePlugins: { preflight: false },
  });
  renameKeyframes(util);
  // Banner backgrounds are apps/web public files (served by solana.com).
  const utilCss = util
    .toString()
    .replace(/url\(\/src\//g, "url(https://solana.com/src/");
  return { base: baseCss.trim(), utilities: utilCss.trim() };
}

/**
 * apps/web globals.css's header rule for the /developers and /learn
 * landings, dark mode only (`html:has([data-dev-landing]) header > #navbar`:
 * opaque #0a0a0b, #232327 border, no blur), which is the docs page colour:
 * solana.com's header reads as one surface from /developers to /docs. The
 * `html.light` rules of that block make the bar white; they are apps/web
 * page CSS, not part of ui-chrome (whose header is dark-only), so they are
 * not used.
 */
function devLandingDark(
  t: ReturnType<typeof tools>,
  problems: GeneratorResult["problems"],
) {
  const file = path.join(webDir, "src/app/globals.css");
  const root = t.postcss.parse(readFileSync(file, "utf8"));
  const out: string[] = [];
  root.walkRules((rule) => {
    const sels = rule.selectors
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter((s) => s === "html:has([data-dev-landing]) header > #navbar");
    if (!sels.length) return;
    const body = rule.nodes.map((n) => `  ${n.toString()};`).join("\n");
    out.push(`${SCOPE} header > nav[data-sol-navbar] {\n${body}\n}`);
  });
  if (!out.length)
    problems.push({
      level: "error",
      file: "apps/web/src/app/globals.css",
      message:
        "the dark /developers header rule (html:has([data-dev-landing]) header > #navbar) was not found; update header-bundle/build.ts",
    });
  return out.join("\n");
}

/**
 * apps/web's element rules (src/scss, imported by app/[locale]/layout.tsx
 * after the Tailwind base): `body` typography (Diatype, 1.3125rem / 140%,
 * white), heading line-heights, `a`, `ul`, ... The header inherits them on
 * solana.com. Only rules whose selectors are all bare element names are
 * kept; `html`/`body` become #sol-hdr, the rest are scoped under it.
 * Returns the CSS and the Sass files read (build inputs).
 */
function webElementCss(t: ReturnType<typeof tools>) {
  const entry = path.join(webDir, "src/scss/index.scss");
  const res = t.sass.compile(entry, {
    loadPaths: [
      path.join(webDir, "src/scss"),
      path.join(webDir, "node_modules"),
    ],
    logger: { warn() {}, debug() {} },
  });
  const root = t.postcss.parse(res.css);
  const out: string[] = [];
  root.walkRules((rule) => {
    if (rule.parent?.type !== "root") return;
    const sels = rule.selectors.map((x) => x.trim());
    if (!sels.every((x) => /^[a-z][a-z0-9]*$/.test(x))) return;
    const scoped = [...new Set(sels.map(scopeSelector))];
    const body = rule.nodes
      .filter((n) => n.type === "decl")
      .map((n) => `  ${n.toString()};`)
      .join("\n");
    if (body) out.push(`${scoped.join(",\n")} {\n${body}\n}`);
  });
  const files = res.loadedUrls
    .filter((u) => u.protocol === "file:")
    .map((u) => toPosix(path.relative(repoRoot, fileURLToPath(u))));
  return { css: out.join("\n"), files };
}

/**
 * apps/web globals.css `:root` custom properties the compiled utilities read
 * (the Tailwind config's `rounded-lg` is `var(--radius)`), on #sol-hdr.
 */
function rootVariables(t: ReturnType<typeof tools>, utilities: string): string {
  const used = new Set(
    [...utilities.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]!),
  );
  const root = t.postcss.parse(
    readFileSync(path.join(webDir, "src/app/globals.css"), "utf8"),
  );
  const decls: string[] = [];
  root.walkRules((rule) => {
    if (rule.selector.trim() !== ":root") return;
    for (const n of rule.nodes) {
      const d = n as unknown as { type: string; prop: string; value: string };
      if (d.type === "decl" && used.has(d.prop))
        decls.push(`  ${d.prop}: ${d.value};`);
    }
  });
  return decls.length ? `${SCOPE} {\n${decls.join("\n")}\n}` : "";
}

// ---------------------------------------------------------------------------
// Build + write
// ---------------------------------------------------------------------------

/**
 * Repo-relative path -> file contents used instead of the file on disk.
 * Test-only: lets the --check test edit a source without touching the repo.
 */
export type SourceOverrides = Record<string, string>;

function hashOf(files: string[], overrides: SourceOverrides = {}) {
  const h = createHash("sha256");
  for (const f of [...new Set(files)].sort()) {
    h.update(f);
    h.update("\0");
    h.update(overrides[f] ?? readFileSync(path.join(repoRoot, f)));
    h.update("\0");
  }
  return h.digest("hex").slice(0, 16);
}

function format(
  abs: string,
  text: string,
  problems: GeneratorResult["problems"],
) {
  const bin = path.join(repoRoot, "node_modules/.bin/oxfmt");
  try {
    return execFileSync(bin, [`--stdin-filepath=${abs}`], {
      cwd: repoRoot,
      input: text,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    problems.push({
      level: "warn",
      file: path.relative(repoRoot, abs),
      message: `oxfmt failed (${(e as Error).message.split("\n")[0]}); written unformatted`,
    });
    return text;
  }
}

export interface HeaderBuild {
  js: string;
  css: string;
  inputs: string[];
  keys: string[];
}

export async function buildHeader(
  problems: GeneratorResult["problems"] = [],
  overrides: SourceOverrides = {},
): Promise<HeaderBuild> {
  const t = tools();
  const config = `export const DEFAULT_LOCALE = ${JSON.stringify(DEFAULT_LOCALE)};
export const DOCS_LOCALES = ${JSON.stringify(DOCS_LOCALES)};
export const MINTLIFY_LANGUAGE_CODE = ${JSON.stringify(MINTLIFY_LANGUAGE_CODE)};`;

  // Pass 1: which ui-chrome files are in the bundle (for keys and Tailwind).
  const probe = await bundle(
    t,
    {
      messages: "export const EN = {}; export const OVERRIDES = {};",
      config,
    },
    overrides,
  );
  const uiFiles = probe.inputs.filter((f) =>
    f.startsWith("packages/ui-chrome/src/"),
  );
  const uiSources = uiFiles.map(
    (f) => overrides[f] ?? readFileSync(path.join(repoRoot, f), "utf8"),
  );
  const enAll = (await loadMergedMessages({
    app: "web",
    locale: DEFAULT_LOCALE,
  })) as Messages;
  const keys = messageKeys(uiSources, enAll);
  const { en, overrides: localeStrings } = await buildMessages(keys);

  // Pass 2: the bundle.
  const out = await bundle(
    t,
    {
      messages: `export const EN = ${JSON.stringify(en)};\nexport const OVERRIDES = ${JSON.stringify(localeStrings)};`,
      config,
    },
    overrides,
  );

  const messageFiles = DOCS_LOCALES.map(
    (l) => `packages/i18n/messages/web/${l}/common.json`,
  );
  const buildFiles = [
    "packages/docs-tooling/src/header-bundle/build.ts",
    "packages/docs-tooling/src/header-bundle/integration.css",
    // Loaded with readFileSync into the sol-portal namespace, so the
    // metafile lists it under @radix-ui/react-portal's path instead.
    "packages/docs-tooling/src/header-bundle/runtime/shims/radix-portal.jsx",
    "apps/web/tailwind.config.js",
    "apps/web/src/app/globals.css",
    "apps/web/next.config.ts",
  ];
  const tw = await compileTailwind(t, uiSources);
  const web = webElementCss(t);
  const inputs = [...out.inputs, ...messageFiles, ...buildFiles, ...web.files];
  const hash = hashOf(inputs, overrides);

  const banner = (what: string) =>
    `/* GENERATED by packages/docs-tooling/src/header-bundle (gen:header). Do not edit.
 * ${what}
 * Inputs: ${uiFiles.length} packages/ui-chrome files, the web messages of ${DOCS_LOCALES.length} docs locales, apps/web Tailwind config; hash ${hash}.
 * Regenerate: pnpm --filter @workspace/docs-tooling gen:header */\n`;

  const js =
    banner(
      "The real solana.com header (packages/ui-chrome Header) with React, mounted over Mintlify's top row.",
    ) + out.js;

  const integration = readFileSync(path.join(here, "integration.css"), "utf8");
  const dev = devLandingDark(t, problems);
  const css =
    banner(
      "Styles for header.js: apps/web's Tailwind for the ui-chrome header, scoped to #sol-hdr, and the Mintlify integration rules.",
    ) +
    [
      "/* 1. Tailwind base (preflight), scoped to #sol-hdr. */",
      tw.base,
      "/* 2. apps/web src/scss element rules (body typography, headings, links), scoped to #sol-hdr. */",
      web.css,
      "/* 3. Integration (header-bundle/integration.css). */",
      integration.trim(),
      "/* 4. Tailwind utilities used by ui-chrome (apps/web tailwind.config.js), scoped to #sol-hdr. */",
      tw.utilities,
      "/* 5. apps/web globals.css: :root variables the utilities use, and the /developers header (dark). */",
      rootVariables(t, tw.utilities),
      dev,
    ].join("\n\n") +
    "\n";
  return { js: js.endsWith("\n") ? js : `${js}\n`, css, inputs, keys };
}

export async function runHeader(
  opts: GeneratorOptions & { overrides?: SourceOverrides } = {},
): Promise<GeneratorResult> {
  const r = emptyResult();
  const docsRoot = opts.docsRoot ?? defaultDocsRoot;
  const check = !!opts.check;
  const built = await buildHeader(r.problems, opts.overrides);
  const files: Array<[string, string]> = [
    [JS_FILE, built.js],
    [CSS_FILE, format(path.join(docsRoot, CSS_FILE), built.css, r.problems)],
  ];
  for (const [rel, next] of files) {
    const abs = path.join(docsRoot, rel);
    let prev = "";
    try {
      prev = readFileSync(abs, "utf8");
    } catch {
      // missing: written below
    }
    if (prev !== next) {
      r.written.push(rel);
      if (check)
        r.problems.push({
          level: "error",
          file: `apps/docs/${rel}`,
          message:
            "stale: it differs from a fresh build of packages/ui-chrome + messages; run gen:header",
        });
      else writeFileSync(abs, next);
    }
  }
  return finish(r, check);
}

if (isMain(import.meta.url)) {
  const f = parseFlags(process.argv.slice(2));
  runHeader({ check: f.check })
    .then((r) => {
      printResult("gen:header", r, f.check);
      process.exit(r.ok ? 0 : 1);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
