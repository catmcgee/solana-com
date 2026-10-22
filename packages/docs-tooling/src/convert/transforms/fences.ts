/**
 * Code fences: Code Hike meta and annotations -> docs code block syntax
 * (spec §3.2).
 *
 * Fence meta
 * - `lang !! title="X"` -> `lang X`; a title with spaces or special
 *   characters is written `title="X Y"`. `filename=x` / `name="x"` are
 *   titles too. A fence with meta but no language gets `text` (the docs
 *   need a language before any option).
 * - `-w` -> `wrap`. Docs flags (`wrap`, `expandable`, `lines`,
 *   `twoslash`, `nocopy`) and options (`icon=`, `theme=`, `highlight=`,
 *   `focus=`) are kept; unknown `key=value` options (e.g. WP5's `file=`)
 *   are kept verbatim.
 * - Legacy brace meta `{5}` is stripped: Code Hike ignored it, the docs
 *   would highlight it (spec: keep today's rendering). Highlights this
 *   transform emits are written `highlight={…}`, which is kept on re-runs,
 *   so the transform is idempotent.
 * - `highlight=15-19` (remark-include-code) -> `highlight={15-19}`.
 * - `/word/` (rehype-pretty-code word highlight, ignored by Code Hike) and
 *   Code Hike `!`/`!!` tokens are dropped.
 *
 * Annotations (whole comment lines `// !x`, `# !x`, `-- !x`, `/* !x *\/`,
 * `<!-- !x -->`; trailing `code // !x` too). Line numbers are counted after
 * every annotation line is removed, as Code Hike does: a comment line's
 * range `(a:b)` starts at the next code line (a = 1); a trailing comment's
 * range starts at its own line.
 * - `!mark`, `!mark(a:b)`, `!mark[/re/]` -> `highlight={lines}` (a regex
 *   mark marks its line).
 * - `!focus`, `!focus(a:b)` -> `focus={lines}`.
 * - `!collapse(a:b) [collapsed]` -> `expandable`.
 * - `!diff +` / `!diff -` -> `[!code ++]` / `[!code --]` comment at the end
 *   of the target line (Shiki diff notation).
 * - `!hover`, `!tooltip`, `!mention`, `!callout`, `!fold`, `!ww`, `!border`,
 *   `!bg`, `!link`, `!className`, `!label` -> removed.
 * - Any other `!name` comment line is left in place and reported as an
 *   error (verify: no line may match `/^\s*(\/\/|#|--)\s*!\w/`).
 *
 * `terminal` fences (legacy Terminal component)
 * - Only `$ ` command lines: `bash Terminal` with the prompts removed (the
 *   copy button copies runnable commands, as the Terminal did).
 * - Commands followed by output: `bash Terminal` + a following
 *   `text Output` fence.
 * - Interleaved commands and output, or a terminal tab inside a
 *   CodeTabs/CodeGroup: one `console` fence (Shiki shell-session
 *   highlighting) keeping the prompts.
 * - A Code Hike title becomes the fence title instead of "Terminal".
 *
 * `mermaid title="T"` fences
 * - The fence becomes bare `mermaid`, followed by a caption
 *   `<div className="sol-caption">T</div>` (a div, not the spec's `<p>`:
 *   MDX wraps the text in a paragraph, and `<p>` inside `<p>` is invalid).
 * - Mermaid renders client-side only (nothing in the server HTML), so every
 *   mermaid fence is followed by `<div className="nojs-only">` holding the
 *   diagram source as a `text` fence (setup probe pattern 3). Skipped when
 *   the next block already is a no-JS fallback, the pre-rendered figure
 *   from mermaid.ts, or a WP3 diagram Frame.
 *
 * Order 900 (cleanup band): runs after every component transform, so
 * WP3/WP4/WP5 see raw Code Hike syntax (notes needs `!tooltip`, APIMethod
 * needs `!!request`/`!hover`, codetabs-examples needs `file=`). Fences
 * still inside an unconverted Code Hike container (ScrollyCoding,
 * WithNotes, WithMentions, SideBySide, APIMethod, CodeReference) are left
 * untouched with a warning, so no information those transforms need is
 * destroyed.
 */
import type { AstNode, ConvertContext, Transform } from "../../types.ts";
import {
  NOJS_CLASS,
  attr,
  flow,
  isBlankText,
  isJsx,
  isNojsBlock,
  jsxAncestorNames,
  paragraph,
  strAttr,
  text,
} from "./_wp2.ts";

type Code = AstNode & {
  type: "code";
  lang?: string | null;
  meta?: string | null;
  value: string;
};

/** Containers whose own transforms read raw Code Hike fences. */
export const CODE_HIKE_CONTAINERS = new Set([
  "ScrollyCoding",
  "WithNotes",
  "WithMentions",
  "SideBySide",
  "APIMethod",
  "CodeReference",
]);

const STRIPPED_ANNOTATIONS = new Set([
  "hover",
  "tooltip",
  "mention",
  "callout",
  "fold",
  "ww",
  "border",
  "bg",
  "link",
  "className",
  "label",
]);
const HANDLED_ANNOTATIONS = new Set(["mark", "focus", "collapse", "diff"]);

const DOCS_FENCE_FLAGS = new Set([
  "wrap",
  "expandable",
  "lines",
  "twoslash",
  "nocopy",
]);

// ---------------------------------------------------------------------------
// Line sets
// ---------------------------------------------------------------------------

/** Parse `1,3-5` (or `{1,3-5}`) into line numbers. */
export function parseLines(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.replace(/[{}\s]/g, "").split(",")) {
    if (!part) continue;
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.push(i);
  }
  return out;
}

/** `[1,2,3,5]` -> `1-3,5`. */
export function formatLines(lines: Iterable<number>): string {
  const sorted = [...new Set(lines)].filter((n) => n > 0).sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    parts.push(i === j ? `${sorted[i]}` : `${sorted[i]}-${sorted[j]}`);
    i = j + 1;
  }
  return parts.join(",");
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

/** Split fence meta into tokens, keeping quoted strings and braces whole. */
export function tokenizeMeta(meta: string): string[] {
  const out: string[] = [];
  let i = 0;
  const s = meta.trim();
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i]!)) i++;
    if (i >= s.length) break;
    let tok = "";
    while (i < s.length && !/\s/.test(s[i]!)) {
      const c = s[i]!;
      if (c === '"' || c === "'") {
        const end = s.indexOf(c, i + 1);
        const stop = end === -1 ? s.length : end + 1;
        tok += s.slice(i, stop);
        i = stop;
      } else if (c === "{") {
        let depth = 0;
        let j = i;
        for (; j < s.length; j++) {
          if (s[j] === "{") depth++;
          else if (s[j] === "}" && --depth === 0) break;
        }
        tok += s.slice(i, j + 1);
        i = j + 1;
      } else if (c === "/" && tok === "") {
        // /word/ highlight token (may contain spaces? not in practice)
        const end = s.indexOf("/", i + 1);
        const stop = end === -1 ? s.length : end + 1;
        tok += s.slice(i, stop);
        i = stop;
      } else {
        tok += c;
        i++;
      }
    }
    out.push(tok);
  }
  return out;
}

function unquote(v: string): string {
  const m = /^(["'])([\s\S]*)\1$/.exec(v);
  return m ? m[2]! : v;
}

export interface FenceMeta {
  title?: string;
  highlight: Set<number>;
  focus: Set<number>;
  flags: Set<string>;
  /** Options kept verbatim, in source order (`icon=…`, `file=…`, …). */
  options: string[];
  /** Code Hike `!!` slot marker or `!name` block name present. */
  codeHike: boolean;
}

export function parseMeta(meta: string | null | undefined): FenceMeta {
  const m: FenceMeta = {
    highlight: new Set(),
    focus: new Set(),
    flags: new Set(),
    options: [],
    codeHike: false,
  };
  const words: string[] = [];
  for (const tok of tokenizeMeta(meta ?? "")) {
    if (tok.startsWith("!")) {
      m.codeHike = true;
      continue;
    }
    if (tok === "-w") {
      m.flags.add("wrap");
      continue;
    }
    if (DOCS_FENCE_FLAGS.has(tok)) {
      m.flags.add(tok);
      continue;
    }
    if (/^\{[\d,\s-]*\}$/.test(tok)) continue; // legacy brace meta: dropped
    if (/^\/.*\/$/.test(tok)) continue; // /word/ highlight: dropped
    const kv = /^([A-Za-z][\w-]*)=([\s\S]*)$/.exec(tok);
    if (kv) {
      const [, key, raw] = kv as unknown as [string, string, string];
      const value = unquote(raw);
      if (key === "title" || key === "filename" || key === "name") {
        m.title = value;
      } else if (key === "highlight") {
        for (const n of parseLines(value)) m.highlight.add(n);
      } else if (key === "focus") {
        for (const n of parseLines(value)) m.focus.add(n);
      } else if (
        (key === "wrap" || key === "expandable" || key === "lines") &&
        value !== "false"
      ) {
        m.flags.add(key);
      } else {
        m.options.push(tok);
      }
      continue;
    }
    words.push(tok);
  }
  if (m.title === undefined && words.length) m.title = words.join(" ");
  return m;
}

function titleToken(title: string): string {
  const bare =
    /^[^\s"'{}=]+$/.test(title) &&
    !DOCS_FENCE_FLAGS.has(title) &&
    !title.startsWith("!") &&
    !title.startsWith("/") &&
    !title.startsWith("-");
  if (bare) return title;
  return title.includes('"') ? `title='${title}'` : `title="${title}"`;
}

export function formatMeta(m: FenceMeta): string {
  const parts: string[] = [];
  if (m.title) parts.push(titleToken(m.title));
  if (m.highlight.size) parts.push(`highlight={${formatLines(m.highlight)}}`);
  if (m.focus.size) parts.push(`focus={${formatLines(m.focus)}}`);
  for (const f of ["wrap", "expandable", "lines", "twoslash", "nocopy"])
    if (m.flags.has(f)) parts.push(f);
  parts.push(...m.options);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

const LINE_ANNOTATION =
  /^\s*(?:\/\/|#|--|;|\/\*|<!--|\{\/\*)\s*!([A-Za-z][\w-]*)(.*?)\s*(?:\*\/\}?|-->)?\s*$/;
const TRAILING_ANNOTATION =
  /^(.*?\S)\s*(?:\/\/|#|--)\s*!(mark|focus|hover|tooltip|mention|callout|diff)\b(.*)$/;

interface Annotation {
  name: string;
  range?: string;
  regex?: boolean;
  query: string;
}

function parseAnnotation(name: string, rest: string): Annotation {
  const a: Annotation = { name, query: "" };
  let r = rest;
  const range = /^\(([^)]*)\)/.exec(r);
  if (range) {
    a.range = range[1];
    r = r.slice(range[0].length);
  }
  const re = /^\[\/.*\/[a-z]*\]/.exec(r);
  if (re) {
    a.regex = true;
    r = r.slice(re[0].length);
  }
  a.query = r.trim();
  return a;
}

/** Lines (1-based, in the cleaned code) an annotation applies to. */
function targetLines(a: Annotation, anchor: number, total: number): number[] {
  if (!a.range || a.regex) return anchor <= total ? [anchor] : [];
  const m = /^\s*(\d+)(?:\s*:\s*(\d+))?\s*$/.exec(a.range);
  if (!m) return anchor <= total ? [anchor] : [];
  const from = Number(m[1]);
  const to = m[2] ? Number(m[2]) : from;
  const out: number[] = [];
  for (let i = anchor + from - 1; i <= Math.min(anchor + to - 1, total); i++)
    out.push(i);
  return out;
}

function commentFor(lang: string): [string, string] {
  const l = lang.toLowerCase();
  if (
    /^(py|python|sh|bash|shell|zsh|console|toml|ya?ml|rb|ruby|r|ini|conf|dockerfile|makefile|make|perl|ps1|powershell|elixir|ex|exs|nix|hcl|tf|terraform|cmake)$/.test(
      l,
    )
  )
    return ["# ", ""];
  if (/^(sql|lua|haskell|hs|elm)$/.test(l)) return ["-- ", ""];
  if (/^(html|xml|svg|md|markdown|mdx|vue|svelte)$/.test(l))
    return ["<!-- ", " -->"];
  if (/^(css|scss|less)$/.test(l)) return ["/* ", " */"];
  return ["// ", ""];
}

export interface AnnotationResult {
  value: string;
  highlight: number[];
  focus: number[];
  expandable: boolean;
  unknown: string[];
}

/** Remove annotation comments from `value` and resolve them to lines. */
export function resolveAnnotations(
  value: string,
  lang: string,
): AnnotationResult {
  const kept: string[] = [];
  const pending: Array<{ a: Annotation; anchor: number }> = [];
  const unknown: string[] = [];
  for (const line of value.split("\n")) {
    const whole = LINE_ANNOTATION.exec(line);
    if (whole) {
      const name = whole[1]!;
      if (HANDLED_ANNOTATIONS.has(name) || STRIPPED_ANNOTATIONS.has(name)) {
        pending.push({
          a: parseAnnotation(name, whole[2] ?? ""),
          anchor: kept.length + 1,
        });
        continue;
      }
      unknown.push(line.trim());
      kept.push(line);
      continue;
    }
    const trailing = TRAILING_ANNOTATION.exec(line);
    if (trailing) {
      kept.push(trailing[1]!);
      pending.push({
        a: parseAnnotation(trailing[2]!, trailing[3] ?? ""),
        anchor: kept.length,
      });
      continue;
    }
    kept.push(line);
  }
  const total = kept.length;
  const highlight: number[] = [];
  const focus: number[] = [];
  let expandable = false;
  const diff = new Map<number, "++" | "--">();
  for (const { a, anchor } of pending) {
    const lines = targetLines(a, anchor, total);
    if (a.name === "mark") highlight.push(...lines);
    else if (a.name === "focus") focus.push(...lines);
    else if (a.name === "collapse") expandable = true;
    else if (a.name === "diff") {
      const sign = a.query.startsWith("-") ? "--" : "++";
      for (const l of lines) diff.set(l, sign);
    }
  }
  if (diff.size) {
    const [open, close] = commentFor(lang);
    for (const [l, sign] of diff) {
      const i = l - 1;
      if (kept[i] !== undefined)
        kept[i] = `${kept[i]} ${open}[!code ${sign}]${close}`;
    }
  }
  return { value: kept.join("\n"), highlight, focus, expandable, unknown };
}

// ---------------------------------------------------------------------------
// terminal / mermaid
// ---------------------------------------------------------------------------

function code(lang: string, meta: string, value: string): Code {
  return { type: "code", lang, meta: meta || null, value };
}

/** Split a legacy `terminal` fence (see header). */
export function convertTerminal(node: Code, inTabs: boolean): Code[] {
  const meta = parseMeta(node.meta);
  const lines = node.value.split("\n");
  // Command lines: `$ …`, plus continuation lines after a trailing `\`.
  const cmdFlags: boolean[] = [];
  let cont = false;
  for (const l of lines) {
    const cmd: boolean = cont || /^\$( |$)/.test(l);
    cmdFlags.push(cmd);
    cont = cmd && /\\\s*$/.test(l);
  }
  const isCmdAt = (i: number) => cmdFlags[i]!;
  const title = meta.title;
  const withTitle = (m: FenceMeta, t: string | undefined) =>
    formatMeta({ ...m, title: t });
  const cmdCount = cmdFlags.filter(Boolean).length;
  const firstOut = lines.findIndex((l, i) => !isCmdAt(i) && l.trim() !== "");
  const lastCmd = cmdFlags.lastIndexOf(true);
  const strip = (l: string) => l.replace(/^\$ ?/, "");
  if (cmdCount === 0) {
    // Output only (or prompts omitted): plain text.
    return [code("text", withTitle(meta, title ?? "Output"), node.value)];
  }
  if (firstOut === -1) {
    return [
      code(
        "bash",
        withTitle(meta, title ?? "Terminal"),
        lines.map(strip).join("\n").replace(/\n+$/, ""),
      ),
    ];
  }
  if (!inTabs && firstOut > lastCmd) {
    const cmds = lines
      .slice(0, firstOut)
      .map(strip)
      .join("\n")
      .replace(/\n+$/, "");
    const out = lines.slice(firstOut).join("\n").replace(/\n+$/, "");
    const plain: FenceMeta = {
      ...meta,
      highlight: new Set(),
      focus: new Set(),
    };
    return [
      code("bash", withTitle(plain, title ?? "Terminal"), cmds),
      code(
        "text",
        withTitle(
          {
            ...plain,
            flags: new Set([...plain.flags].filter((f) => f !== "expandable")),
          },
          "Output",
        ),
        out,
      ),
    ];
  }
  return [code("console", withTitle(meta, title ?? "Terminal"), node.value)];
}

function isCaption(n: AstNode | undefined): boolean {
  return (
    (isJsx(n, "div") || isJsx(n, "p")) &&
    (strAttr(n, "className") ?? "").split(/\s+/).includes("sol-caption")
  );
}

/** Mermaid fence -> bare fence [+ caption] + no-JS source fallback. */
function convertMermaid(
  node: Code,
  siblings: AstNode[],
  index: number,
): AstNode[] {
  const meta = parseMeta(node.meta);
  const after = siblings.slice(index + 1).filter((s) => !isBlankText(s));
  const out: AstNode[] = [node];
  if (node.meta) node.meta = null;
  const hasCaption = isCaption(after[0]);
  if (meta.title && !hasCaption) {
    out.push(
      flow(
        "div",
        [attr("className", "sol-caption")],
        [paragraph([text(meta.title)])],
      ),
    );
  }
  const next = hasCaption ? after[1] : after[0];
  // mermaid.ts (order 86) already put the pre-rendered figure there.
  const isFigure =
    isJsx(next, "div") &&
    (
      next!.attributes as { name?: string; value?: unknown }[] | undefined
    )?.some((a) => a.name === "data-fallback" && a.value === "mermaid");
  if (!isNojsBlock(next) && !isJsx(next, "Frame") && !isFigure) {
    out.push(
      flow(
        "div",
        [attr("className", NOJS_CLASS)],
        [code("text", meta.title ? titleToken(meta.title) : "", node.value)],
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------

function normalizeFence(node: Code, ctx: ConvertContext): void {
  // ``` title="x" (no language): remark reads the first meta token as lang.
  if (node.lang && /[="'{]/.test(node.lang)) {
    node.meta = [node.lang, node.meta ?? ""].join(" ").trim();
    node.lang = null;
  }
  const meta = parseMeta(node.meta);
  const lang = node.lang ?? "";
  const ann = resolveAnnotations(node.value, lang);
  for (const u of ann.unknown)
    ctx.error(`unknown Code Hike annotation left in a fence: ${u}`);
  for (const l of ann.highlight) meta.highlight.add(l);
  for (const l of ann.focus) meta.focus.add(l);
  if (ann.expandable) meta.flags.add("expandable");
  const nextMeta = formatMeta(meta);
  if (ann.value !== node.value) node.value = ann.value;
  if (!node.lang && nextMeta) node.lang = "text";
  if ((node.meta ?? "") !== nextMeta) node.meta = nextMeta || null;
}

export const transform: Transform = {
  name: "fences",
  order: 900,
  owner: "WP2",
  appliesTo: (source) => source.includes("```") || source.includes("~~~"),
  run(tree, _file, ctx) {
    const warned = new Set<AstNode>();
    const visit = (n: AstNode, ancestors: AstNode[]) => {
      const kids = n.children;
      if (!kids) return;
      const names = jsxAncestorNames([...ancestors, n]);
      const blocker = [...ancestors, n].find(
        (a) => isJsx(a) && CODE_HIKE_CONTAINERS.has(String(a.name)),
      );
      if (blocker) {
        if (!warned.has(blocker)) {
          warned.add(blocker);
          ctx.warn(
            `fences inside unconverted <${String(blocker.name)}> left as Code Hike syntax`,
          );
        }
        return;
      }
      const inTabs = names.some((x) => x === "CodeTabs" || x === "CodeGroup");
      for (let i = 0; i < kids.length; i++) {
        const c = kids[i]!;
        if (c.type !== "code") {
          visit(c, [...ancestors, n]);
          continue;
        }
        const node = c as Code;
        if (node.lang === "terminal") {
          const out = convertTerminal(node, inTabs);
          for (const o of out) normalizeFence(o, ctx);
          kids.splice(i, 1, ...out);
          i += out.length - 1;
          continue;
        }
        normalizeFence(node, ctx);
        if (node.lang === "mermaid") {
          const out = convertMermaid(node, kids, i);
          if (out.length > 1) {
            kids.splice(i, 1, ...out);
            i += out.length - 1;
          }
        }
      }
    };
    visit(tree, []);
  },
};
