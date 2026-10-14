/**
 * Shared helpers for the WP3 Code Hike transforms (notes, mentions,
 * side-by-side, scrolly, files, mermaid, terminal). `<DocsDiagram>` is
 * converted by WP2's themed-image.ts (it also checks the asset pair).
 *
 * Not a transform: files starting with `_` are skipped by discovery.
 *
 * Ordering contract (see each module's `order`): every WP3 transform runs at
 * order 80-88 (notes 80 … terminal 88), BEFORE fences.ts (900). `notes` needs
 * the raw `!tooltip[/re/] name` comment lines, which `fences.ts` (WP2)
 * deletes. The other WP3 transforms are order-independent with respect to
 * `fences.ts`: they read fence titles in both the Code Hike form
 * (`lang !! title="X"`) and the converted Mintlify form (`lang X` /
 * `lang title="X Y"`), and they never rewrite annotation lines other than
 * the ones whose semantics they own (`!tooltip`, `!mention`).
 */
import type { AstNode } from "../../types.ts";

export type Jsx = AstNode & {
  type: "mdxJsxFlowElement" | "mdxJsxTextElement";
  name: string | null;
  attributes: JsxAttr[];
  children: AstNode[];
};

export interface JsxAttr {
  type: "mdxJsxAttribute" | "mdxJsxExpressionAttribute";
  name?: string;
  value?: string | null | { type: string; value: string };
  [key: string]: unknown;
}

export type Code = AstNode & {
  type: "code";
  lang?: string | null;
  meta?: string | null;
  value: string;
};

export function isJsx(n: AstNode | undefined, name?: string): n is Jsx {
  if (!n) return false;
  if (n.type !== "mdxJsxFlowElement" && n.type !== "mdxJsxTextElement")
    return false;
  return name === undefined || n.name === name;
}

export function isCode(n: AstNode | undefined): n is Code {
  return n?.type === "code";
}

/** String value of a JSX attribute (`name="x"`), or undefined. */
export function getAttr(n: Jsx, name: string): string | undefined {
  const a = n.attributes?.find(
    (x) => x.type === "mdxJsxAttribute" && x.name === name,
  );
  if (!a) return undefined;
  if (a.value === null || a.value === undefined) return "";
  if (typeof a.value === "string") return a.value;
  return a.value.value;
}

export function hasAttr(n: Jsx, name: string): boolean {
  return (n.attributes ?? []).some(
    (x) => x.type === "mdxJsxAttribute" && x.name === name,
  );
}

/** `name="value"` (string), `name` (boolean, value === true). */
export function attr(name: string, value: string | true): JsxAttr {
  return {
    type: "mdxJsxAttribute",
    name,
    value: value === true ? null : value,
  };
}

/** `name={expression}`. */
export function exprAttr(name: string, expression: string): JsxAttr {
  return {
    type: "mdxJsxAttribute",
    name,
    value: { type: "mdxJsxAttributeValueExpression", value: expression },
  };
}

export function flow(
  name: string,
  attributes: JsxAttr[],
  children: AstNode[],
): Jsx {
  return { type: "mdxJsxFlowElement", name, attributes, children };
}

/** Plain text of a node (inline code values included). */
export function textOf(n: AstNode): string {
  if (typeof n.value === "string" && n.type !== "code") return n.value;
  return (n.children ?? []).map(textOf).join("");
}

/** Depth-first visit; `fn` returning "skip" does not descend. */
export function walk(
  n: AstNode,
  fn: (node: AstNode, parent: AstNode | null) => void | "skip",
  parent: AstNode | null = null,
) {
  if (fn(n, parent) === "skip") return;
  for (const c of [...(n.children ?? [])]) walk(c, fn, n);
}

/**
 * Replace every JSX element named `name` (deepest first, so nested
 * instances are handled before their ancestors) with the nodes returned by
 * `fn`. Returns the number of replacements.
 */
export function replaceJsx(
  tree: AstNode,
  name: string,
  fn: (el: Jsx, parent: AstNode) => AstNode[],
): number {
  let count = 0;
  const visit = (n: AstNode) => {
    const kids = n.children;
    if (!kids) return;
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i]!;
      visit(c);
      if (isJsx(c, name)) {
        const out = fn(c, n);
        kids.splice(i, 1, ...out);
        i += out.length - 1;
        count++;
      }
    }
  };
  visit(tree);
  return count;
}

// ---------------------------------------------------------------------------
// Code Hike comment annotations
// ---------------------------------------------------------------------------

/**
 * A Code Hike annotation comment occupying a whole line:
 * `// !name…`, `# !name…`, `-- !name…`, `/* !name… *\/`, `<!-- !name… -->`,
 * `{/* !name… *\/}`.
 */
const ANNOTATION_LINE =
  /^\s*(?:\/\/|#|--|\/\*|<!--|\{\/\*)\s*!([A-Za-z][\w-]*)(.*?)\s*(?:\*\/\}?|-->)?\s*$/;

export interface Annotation {
  name: string;
  /** `(a:b)` block range, if any. */
  range?: string;
  /** `[/re/flags]` inline regex, if any. */
  regex?: { source: string; flags: string };
  /** Everything after the selector (e.g. the note name for `!tooltip`). */
  query: string;
}

export function parseAnnotationLine(line: string): Annotation | null {
  const m = ANNOTATION_LINE.exec(line);
  if (!m) return null;
  const name = m[1]!;
  let rest = m[2] ?? "";
  const out: Annotation = { name, query: "" };
  const range = /^\(([^)]*)\)/.exec(rest);
  if (range) {
    out.range = range[1];
    rest = rest.slice(range[0].length);
  }
  // Greedy: the regex may itself contain `]` (e.g. `[/#\[account\]/]`).
  const re = /^\[\/(.*)\/([dgimsuy]*)\](?=\s|$)/.exec(rest);
  if (re) {
    out.regex = { source: re[1]!, flags: re[2]! };
    rest = rest.slice(re[0].length);
  }
  out.query = rest.trim();
  return out;
}

export function isAnnotationLine(line: string): boolean {
  return ANNOTATION_LINE.test(line);
}

/** Remove whole-line annotations named in `names`; returns removed lines. */
export function stripAnnotations(
  code: Code,
  names: ReadonlySet<string>,
): Array<{ index: number; annotation: Annotation }> {
  const lines = code.value.split("\n");
  const removed: Array<{ index: number; annotation: Annotation }> = [];
  const kept: string[] = [];
  lines.forEach((line, index) => {
    const a = parseAnnotationLine(line);
    if (a && names.has(a.name)) removed.push({ index, annotation: a });
    else kept.push(line);
  });
  if (removed.length) code.value = kept.join("\n");
  return removed;
}

/** Lines of `value` that are not annotation comments. */
export function contentLines(value: string): string[] {
  return value.split("\n").filter((l) => !isAnnotationLine(l));
}

// ---------------------------------------------------------------------------
// Fence meta
// ---------------------------------------------------------------------------

/** Mintlify fence meta flags that are never a title. */
const META_FLAGS = new Set(["wrap", "expandable", "lines", "-w", "!!", "!"]);

/**
 * Fence title in any of the forms the corpus can be in while converting:
 * Code Hike `!! title="X"` / `title="X"` / `!name` (slot), or Mintlify
 * `Title words {1-3} focus={2}`.
 */
export function fenceTitle(
  meta: string | null | undefined,
): string | undefined {
  if (!meta) return undefined;
  const quoted = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)')/.exec(meta);
  if (quoted) return quoted[1] ?? quoted[2];
  const words: string[] = [];
  for (const tok of meta.trim().split(/\s+/)) {
    if (META_FLAGS.has(tok) || /^!/.test(tok)) continue;
    if (/^\{.*\}$/.test(tok) || /^[\w-]+=/.test(tok)) continue;
    words.push(tok);
  }
  return words.length ? words.join(" ") : undefined;
}

/** True when the fence is a Code Hike block/slot (`!!` meta). */
export function isCodeHikeSlot(meta: string | null | undefined): boolean {
  return !!meta && /(?:^|\s)!!(?:\s|$)/.test(meta);
}

/** Heading text when it is a Code Hike section marker (`!name`, `!!name`). */
export function markerHeading(
  n: AstNode,
  depth: number,
): { bang: "!" | "!!"; rest: string } | null {
  if (n.type !== "heading" || n.depth !== depth) return null;
  const text = textOf(n).trim();
  const m = /^(!!?)(.*)$/s.exec(text);
  if (!m) return null;
  return { bang: m[1] as "!" | "!!", rest: m[2]!.trim() };
}
