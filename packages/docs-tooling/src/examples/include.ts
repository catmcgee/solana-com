/**
 * Synchronous port of the parts of `@devrelkit/remark-include-code@0.1.2`
 * that the legacy docs used (spec §4.1 allows a vendored copy). Behaviour is
 * kept identical so generated snippets show exactly the code the Fumadocs
 * site showed:
 *
 * - `#region <name>` / `#endregion` markers use `//` or `#` by fence
 *   language;
 * - every region with the same name is included, joined by a blank line;
 * - the start marker's indent is stripped from each line of that region;
 * - the end marker matches ANY `#endregion` (name ignored) and nested
 *   `#region` lines are dropped;
 * - leading/trailing blank lines are trimmed; a file without a region is
 *   included whole with trailing whitespace removed.
 *
 * Plus the docs' own `remark-web3js-specifier` rewrite: the examples package
 * installs both web3.js majors under aliases, the docs show the real name.
 */

const SLASH_LANGS = new Set([
  "ts",
  "tsx",
  "typescript",
  "js",
  "jsx",
  "javascript",
  "rust",
  "rs",
  "c",
  "cpp",
  "c++",
  "go",
  "java",
  "swift",
  "kotlin",
  "kt",
  "scala",
  "dart",
]);
const HASH_LANGS = new Set([
  "py",
  "python",
  "sh",
  "bash",
  "zsh",
  "ruby",
  "rb",
  "yaml",
  "yml",
  "toml",
  "r",
  "perl",
  "pl",
]);

export function commentTokenForLang(lang: string): "//" | "#" {
  const l = lang.toLowerCase();
  if (HASH_LANGS.has(l)) return "#";
  if (SLASH_LANGS.has(l)) return "//";
  return "//";
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export class RegionNotFoundError extends Error {
  constructor(region: string, file?: string) {
    super(`region "${region}" not found${file ? ` in "${file}"` : ""}`);
    this.name = "RegionNotFoundError";
  }
}

export function sliceRegion(opts: {
  source: string;
  region: string;
  lang: string;
  file?: string;
}): string {
  const token = escapeRegex(commentTokenForLang(opts.lang));
  const startRe = new RegExp(`^\\s*${token}\\s*#region\\s+(\\S+)\\s*$`);
  const endRe = new RegExp(`^\\s*${token}\\s*#endregion\\b.*$`);
  const slices: string[] = [];
  let inRegion = false;
  let buffer: string[] = [];
  let baseIndent = 0;
  for (const line of opts.source.split(/\r?\n/)) {
    if (!inRegion) {
      const m = line.match(startRe);
      if (m && m[1] === opts.region) {
        inRegion = true;
        baseIndent = (line.match(/^[ \t]*/) ?? [""])[0].length;
        buffer = [];
      }
      continue;
    }
    if (endRe.test(line)) {
      slices.push(buffer.join("\n"));
      inRegion = false;
      continue;
    }
    if (startRe.test(line)) continue;
    buffer.push(stripIndent(line, baseIndent));
  }
  if (slices.length === 0)
    throw new RegionNotFoundError(opts.region, opts.file);
  return slices.join("\n\n").replace(/^\n+|\n+$/g, "");
}

function stripIndent(line: string, n: number) {
  let i = 0;
  while (i < n && i < line.length && (line[i] === " " || line[i] === "\t")) i++;
  return line.slice(i);
}

export type LineRange = [number, number];

/** `"24-30,33"` -> `[[24,30],[33,33]]`. Throws on malformed input. */
export function parseRanges(input: string): LineRange[] {
  const out: LineRange[] = [];
  for (const piece of input.split(",")) {
    const part = piece.trim();
    if (!part) continue;
    const dash = part.indexOf("-");
    const a = Number(dash === -1 ? part : part.slice(0, dash));
    const b = Number(dash === -1 ? part : part.slice(dash + 1));
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a)
      throw new Error(`invalid highlight range: "${input}"`);
    out.push([a, b]);
  }
  return out;
}

export function formatRanges(ranges: LineRange[]): string {
  return ranges.map(([a, b]) => (a === b ? String(a) : `${a}-${b}`)).join(",");
}

const WEB3JS_SPECIFIER = /@solana\/web3\.js-(?:v3|legacy)(?![\w-])/g;

/** `@solana/web3.js-legacy` / `-v3` -> `@solana/web3.js` (remark-web3js-specifier). */
export function rewriteWeb3jsSpecifier(code: string): string {
  return code.replace(WEB3JS_SPECIFIER, "@solana/web3.js");
}

/**
 * Parsed legacy Code Hike fence meta, e.g.
 * `!! title="Kit" file=packages/docs-examples/x/kit.ts#region=transfer highlight=24-30`.
 */
export interface LegacyFenceMeta {
  title?: string;
  /** Repo-relative path from `file=` (without the `#region=` fragment). */
  file?: string;
  region?: string;
  highlight?: string;
  output?: string;
  /** `-r`, `-c`... flag letters. */
  flags: string;
  /** Anything not understood, for diagnostics. */
  rest: string;
}

export function parseLegacyFenceMeta(
  meta: string | null | undefined,
): LegacyFenceMeta {
  let s = (meta ?? "").trim();
  const out: LegacyFenceMeta = { flags: "", rest: "" };
  s = s.replace(/^!!\s*/, "");
  const take = (re: RegExp) => {
    const m = s.match(re);
    if (!m) return undefined;
    s = (s.slice(0, m.index) + " " + s.slice(m.index! + m[0].length)).trim();
    return m[1] ?? m[2];
  };
  out.title = take(/(?:^|\s)title=(?:"([^"]*)"|(\S+))/);
  const file = take(/(?:^|\s)file=(\S+)/);
  if (file) {
    const hash = file.indexOf("#");
    out.file = hash === -1 ? file : file.slice(0, hash);
    if (hash !== -1) {
      const frag = file.slice(hash + 1);
      const eq = frag.indexOf("=");
      if (eq === -1) out.region = frag || undefined;
      else if (frag.slice(0, eq) === "region")
        out.region = frag.slice(eq + 1) || undefined;
    }
  }
  out.highlight = take(/(?:^|\s)highlight=(\S+)/);
  out.output = take(/(?:^|\s)output=(\S+)/);
  const flags: string[] = [];
  s = s.replace(/(?:^|\s)-([a-z]+)(?=\s|$)/g, (_, f: string) => {
    flags.push(f);
    return " ";
  });
  out.flags = flags.join("");
  out.rest = s.replace(/\s+/g, " ").trim();
  return out;
}
