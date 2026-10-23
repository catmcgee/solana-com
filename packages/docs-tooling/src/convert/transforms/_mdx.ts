/**
 * Shared MDX/JSX node helpers for the core transforms (callout, cards, tabs,
 * steps, accordion, images, themed-image, embed, html, fences, inline-code,
 * ...) and, through _codehike.ts, the Code Hike transforms.
 *
 * Not a transform: files starting with `_` are skipped by discovery.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import type { AstNode } from "../../types.ts";
import { docsRoot } from "../../lib/paths.ts";

// ---------------------------------------------------------------------------
// Node types and predicates
// ---------------------------------------------------------------------------

export interface JsxAttr {
  type: "mdxJsxAttribute" | "mdxJsxExpressionAttribute";
  name?: string;
  value?: string | null | { type: string; value: string; data?: unknown };
  [key: string]: unknown;
}

export type Jsx = AstNode & {
  type: "mdxJsxFlowElement" | "mdxJsxTextElement";
  name: string | null;
  attributes: JsxAttr[];
  children: AstNode[];
};

export function isJsx(n: AstNode | undefined, name?: string): n is Jsx {
  if (!n) return false;
  if (n.type !== "mdxJsxFlowElement" && n.type !== "mdxJsxTextElement")
    return false;
  return name === undefined || n.name === name;
}

/** Whitespace-only text (MDX keeps these between inline JSX children). */
export function isBlankText(n: AstNode): boolean {
  return n.type === "text" && String(n.value ?? "").trim() === "";
}

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------

export function findAttr(n: Jsx, name: string): JsxAttr | undefined {
  return (n.attributes ?? []).find(
    (a) => a.type === "mdxJsxAttribute" && a.name === name,
  );
}

export function hasAttr(n: Jsx, name: string): boolean {
  return findAttr(n, name) !== undefined;
}

/**
 * Attribute as a string: `name="x"` -> "x"; `name={"x"}` / `name={'x'}` ->
 * "x" (string-literal expressions only); boolean `name` -> "". Any other
 * expression -> undefined.
 */
export function strAttr(n: Jsx, name: string): string | undefined {
  const a = findAttr(n, name);
  if (!a) return undefined;
  if (a.value === null || a.value === undefined) return "";
  if (typeof a.value === "string") return a.value;
  return parseJsString(a.value.value);
}

/** Raw expression source of `name={...}`, if the attribute is an expression. */
export function exprAttrSource(n: Jsx, name: string): string | undefined {
  const a = findAttr(n, name);
  if (!a || a.value === null || typeof a.value !== "object") return undefined;
  return a.value.value;
}

export function attr(name: string, value: string | true): JsxAttr {
  return {
    type: "mdxJsxAttribute",
    name,
    value: value === true ? null : value,
  };
}

export function exprAttr(name: string, expression: string): JsxAttr {
  return {
    type: "mdxJsxAttribute",
    name,
    value: { type: "mdxJsxAttributeValueExpression", value: expression },
  };
}

export function removeAttrs(n: Jsx, names: readonly string[]) {
  n.attributes = (n.attributes ?? []).filter(
    (a) => !(a.type === "mdxJsxAttribute" && names.includes(a.name ?? "")),
  );
}

/** Attribute names other than `allowed` (spread attributes count as "..."). */
export function unknownAttrs(n: Jsx, allowed: readonly string[]): string[] {
  return (n.attributes ?? [])
    .map((a) => (a.type === "mdxJsxAttribute" ? (a.name ?? "") : "..."))
    .filter((name) => !allowed.includes(name));
}

/** Parse a JS string literal (`"x"`, `'x'`, `` `x` `` without `${}`). */
export function parseJsString(src: string): string | undefined {
  const s = src.trim();
  if (s.length < 2) return undefined;
  const q = s[0];
  if ((q !== '"' && q !== "'" && q !== "`") || s[s.length - 1] !== q)
    return undefined;
  const body = s.slice(1, -1);
  if (q === "`" && body.includes("${")) return undefined;
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (c === q) return undefined; // unescaped closing quote mid-string
    if (c !== "\\") {
      out += c;
      continue;
    }
    const e = body[++i];
    if (e === undefined) return undefined;
    const hex = body.slice(i + 1, i + 5);
    if (e === "u" && /^[0-9a-fA-F]{4}$/.test(hex)) {
      out += String.fromCharCode(parseInt(hex, 16));
      i += 4;
      continue;
    }
    out += e === "n" ? "\n" : e === "t" ? "\t" : e;
  }
  return out;
}

/** Parse `['a', "b", `c`]` (array of string literals only). */
export function parseStringArray(src: string): string[] | undefined {
  const s = src.trim();
  if (!s.startsWith("[") || !s.endsWith("]")) return undefined;
  const out: string[] = [];
  const body = s.slice(1, -1);
  const re =
    /\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)\s*(,|$)/y;
  let i = 0;
  while (i < body.length) {
    if (/^\s*$/.test(body.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(body);
    if (!m) return undefined;
    const v = parseJsString(m[1]!);
    if (v === undefined) return undefined;
    out.push(v);
    i = re.lastIndex;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export function flow(
  name: string,
  attributes: JsxAttr[],
  children: AstNode[],
): Jsx {
  return { type: "mdxJsxFlowElement", name, attributes, children };
}

export function text(value: string): AstNode {
  return { type: "text", value };
}

export function paragraph(children: AstNode[]): AstNode {
  return { type: "paragraph", children };
}

export function strong(children: AstNode[]): AstNode {
  return { type: "strong", children };
}

/** Plain text of a node (inline code values included). */
export function textOf(n: AstNode): string {
  if (typeof n.value === "string" && n.type !== "code") return n.value;
  return (n.children ?? []).map(textOf).join("");
}

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

/** Depth-first, pre-order; `fn` returning "skip" does not descend. */
export function walk(
  n: AstNode,
  fn: (
    node: AstNode,
    parent: AstNode | null,
    ancestors: readonly AstNode[],
  ) => void | "skip",
  ancestors: AstNode[] = [],
) {
  const parent = ancestors[ancestors.length - 1] ?? null;
  if (fn(n, parent, ancestors) === "skip") return;
  const kids = n.children;
  if (!kids) return;
  ancestors.push(n);
  for (const c of [...kids]) walk(c, fn, ancestors);
  ancestors.pop();
}

/**
 * Post-order replacement: every node for which `fn` returns an array is
 * replaced by those nodes (children are processed first, so nested matches
 * are converted before their ancestors). Returning undefined keeps the node.
 */
export function replaceNodes(
  tree: AstNode,
  fn: (
    node: AstNode,
    parent: AstNode,
    ancestors: readonly AstNode[],
  ) => AstNode[] | undefined,
): number {
  let count = 0;
  const ancestors: AstNode[] = [];
  const visit = (n: AstNode) => {
    const kids = n.children;
    if (!kids) return;
    ancestors.push(n);
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i]!;
      visit(c);
      const out = fn(c, n, ancestors);
      if (out) {
        kids.splice(i, 1, ...out);
        i += out.length - 1;
        count++;
      }
    }
    ancestors.pop();
  };
  visit(tree);
  return count;
}

/** Names of the JSX ancestors of a node. */
export function jsxAncestorNames(ancestors: readonly AstNode[]): string[] {
  return ancestors.filter((a) => isJsx(a)).map((a) => String(a.name ?? ""));
}

// ---------------------------------------------------------------------------
// Assets (spec §1.4, migration/asset-refs.csv)
// ---------------------------------------------------------------------------

/** Public prefixes that moved under /docs-assets/. */
const ASSET_PREFIXES = ["/assets/", "/images/", "/img/"] as const;

/**
 * `/assets/X` -> `/docs-assets/assets/X` (also `/images/`, `/img/`).
 * Anything else (external URLs, already-rewritten paths) is returned as is.
 */
export function docsAssetUrl(url: string): string {
  for (const p of ASSET_PREFIXES) {
    if (url.startsWith(p)) return `/docs-assets${url}`;
  }
  return url;
}

export function isLegacyAssetUrl(url: string): boolean {
  return ASSET_PREFIXES.some((p) => url.startsWith(p));
}

let assetIndex: Set<string> | undefined;

/** Every public path under apps/docs/docs-assets ("/docs-assets/..."). */
function assets(): Set<string> {
  if (assetIndex) return assetIndex;
  const out = new Set<string>();
  const root = path.join(docsRoot, "docs-assets");
  const visit = (dir: string, rel: string) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) visit(path.join(dir, e.name), r);
      else out.add(`/docs-assets${r}`);
    }
  };
  visit(root, "");
  return (assetIndex = out);
}

/**
 * Does a `/docs-assets/...` URL resolve to a committed file? Reads the
 * asset tree once (read-only, deterministic for a given checkout). Query
 * strings and fragments are ignored.
 */
export function docsAssetExists(url: string): boolean {
  const clean = url.split(/[?#]/)[0]!;
  let decoded = clean;
  try {
    decoded = decodeURI(clean);
  } catch {
    // keep as is
  }
  return assets().has(clean) || assets().has(decoded);
}

// ---------------------------------------------------------------------------
// No-JS helper (migration/setup-nojs-fallback.css)
// ---------------------------------------------------------------------------

/** className of blocks shown only when JavaScript is off. */
export const NOJS_CLASS = "nojs-only";

export function isNojsBlock(n: AstNode | undefined): boolean {
  return (
    isJsx(n) &&
    (n.name === "div" || n.name === "span") &&
    (strAttr(n, "className") ?? "").split(/\s+/).includes(NOJS_CLASS)
  );
}
