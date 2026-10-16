/**
 * Shared mdast helpers for the WP7 special-collection transforms
 * (bootcamp, video-guides, learn). Not a transform: files starting
 * with `_` are skipped by discovery.
 */
import type { AstNode } from "../../types.ts";

export type JsxAttrValue = string | number | boolean | null | { expr: string };

export interface JsxAttribute extends AstNode {
  type: "mdxJsxAttribute";
  name: string;
  value?: unknown;
}

export const isJsx = (n: AstNode | undefined, name?: string): boolean =>
  !!n &&
  (n.type === "mdxJsxFlowElement" || n.type === "mdxJsxTextElement") &&
  (name === undefined || n.name === name);

/** Build an MDX JSX element. `null` / `true` values are boolean attributes. */
export function jsx(
  name: string,
  attrs: Record<string, JsxAttrValue | undefined> = {},
  children: AstNode[] = [],
  flow = true,
): AstNode {
  const attributes: JsxAttribute[] = [];
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (v === null || v === true) {
      attributes.push({ type: "mdxJsxAttribute", name: k, value: null });
    } else if (typeof v === "object") {
      attributes.push({
        type: "mdxJsxAttribute",
        name: k,
        value: { type: "mdxJsxAttributeValueExpression", value: v.expr },
      });
    } else if (typeof v === "number") {
      attributes.push({
        type: "mdxJsxAttribute",
        name: k,
        value: { type: "mdxJsxAttributeValueExpression", value: String(v) },
      });
    } else {
      attributes.push({ type: "mdxJsxAttribute", name: k, value: v });
    }
  }
  return {
    type: flow ? "mdxJsxFlowElement" : "mdxJsxTextElement",
    name,
    attributes,
    children,
  };
}

export const text = (value: string): AstNode => ({ type: "text", value });
export const strong = (value: string): AstNode => ({
  type: "strong",
  children: [text(value)],
});
export const link = (url: string, children: AstNode[] | string): AstNode => ({
  type: "link",
  url,
  title: null,
  children: typeof children === "string" ? [text(children)] : children,
});
export const paragraph = (children: AstNode[]): AstNode => ({
  type: "paragraph",
  children,
});
export const heading = (depth: number, value: string): AstNode => ({
  type: "heading",
  depth,
  children: [text(value)],
});
export const listItem = (children: AstNode[]): AstNode => ({
  type: "listItem",
  spread: false,
  checked: null,
  children: [paragraph(children)],
});
export const list = (items: AstNode[][], ordered = false): AstNode => ({
  type: "list",
  ordered,
  start: ordered ? 1 : null,
  spread: false,
  children: items.map(listItem),
});
/** `{/* value *\/}` flow comment, used as an idempotency marker. */
export const flowComment = (value: string): AstNode => ({
  type: "mdxFlowExpression",
  value: `/* ${value} */`,
});

export function hasFlowComment(tree: AstNode, value: string): boolean {
  const want = `/* ${value} */`;
  return (tree.children ?? []).some(
    (n) =>
      n.type === "mdxFlowExpression" &&
      typeof n.value === "string" &&
      n.value.trim() === want,
  );
}

/** Index of the first root child after frontmatter and leading imports. */
export function contentStart(tree: AstNode): number {
  const kids = tree.children ?? [];
  let i = 0;
  while (
    i < kids.length &&
    (kids[i]!.type === "yaml" || kids[i]!.type === "mdxjsEsm")
  )
    i++;
  return i;
}

/** Plain text of a node (inline code included). */
export function toText(n: AstNode): string {
  if (typeof n.value === "string" && n.type !== "mdxFlowExpression")
    return n.value;
  return (n.children ?? []).map(toText).join("");
}

// ---------------------------------------------------------------------------
// Attribute evaluation (static literals only: no eval)
// ---------------------------------------------------------------------------

interface EsNode {
  type: string;
  [k: string]: unknown;
}

/** Evaluate an ESTree literal expression (objects, arrays, primitives). */
export function evalLiteral(node: EsNode): unknown {
  switch (node.type) {
    case "Literal":
      return node.value;
    case "TemplateLiteral": {
      const exprs = node.expressions as EsNode[];
      if (exprs.length) throw new Error("template literal with expressions");
      return (node.quasis as { value: { cooked: string } }[])
        .map((q) => q.value.cooked)
        .join("");
    }
    case "ArrayExpression":
      return (node.elements as (EsNode | null)[]).map((e) =>
        e ? evalLiteral(e) : undefined,
      );
    case "ObjectExpression": {
      const out: Record<string, unknown> = {};
      for (const p of node.properties as EsNode[]) {
        if (p.type !== "Property" || p.computed)
          throw new Error(`unsupported object member ${p.type}`);
        const key = p.key as EsNode;
        const k =
          key.type === "Identifier" ? (key.name as string) : String(key.value);
        out[k] = evalLiteral(p.value as EsNode);
      }
      return out;
    }
    case "UnaryExpression": {
      const v = evalLiteral(node.argument as EsNode);
      if (node.operator === "-" && typeof v === "number") return -v;
      if (node.operator === "!") return !v;
      throw new Error(`unsupported unary ${String(node.operator)}`);
    }
    case "Identifier":
      if (node.name === "undefined") return undefined;
      throw new Error(`identifier ${String(node.name)} is not a literal`);
    default:
      throw new Error(`unsupported expression ${node.type}`);
  }
}

/**
 * Read a JSX attribute: string value, `true` for a boolean attribute, the
 * evaluated literal for `{...}` values, `undefined` when absent.
 */
export function getAttr(node: AstNode, name: string): unknown {
  const attrs = (node.attributes ?? []) as JsxAttribute[];
  const a = attrs.find((x) => x.type === "mdxJsxAttribute" && x.name === name);
  if (!a) return undefined;
  if (a.value === null || a.value === undefined) return true;
  if (typeof a.value === "string") return a.value;
  const v = a.value as {
    value: string;
    data?: { estree?: { body: { expression: EsNode }[] } };
  };
  const program = v.data?.estree;
  if (program?.body?.[0]?.expression)
    return evalLiteral(program.body[0].expression);
  // No estree (tree not built by remark-mdx): accept JSON-compatible values.
  return JSON.parse(v.value);
}

/** Replace `node` (a child of `parent`) by `replacement` nodes. */
export function replaceChild(
  parent: AstNode,
  node: AstNode,
  replacement: AstNode[],
) {
  const kids = parent.children!;
  const i = kids.indexOf(node);
  if (i < 0) throw new Error("replaceChild: node not in parent");
  kids.splice(i, 1, ...replacement);
}

/** Depth-first walk with parents; `fn` may replace the visited node. */
export function walk(
  node: AstNode,
  fn: (n: AstNode, parent: AstNode | null) => void,
  parent: AstNode | null = null,
) {
  fn(node, parent);
  // Copy: fn may splice siblings.
  for (const c of [...(node.children ?? [])]) walk(c, fn, node);
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

/** Video id from youtu.be / youtube.com watch / embed URLs. */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (/(^|\.)youtube(-nocookie)?\.com$/.test(u.hostname)) {
      if (u.pathname.startsWith("/embed/"))
        return u.pathname.slice("/embed/".length) || null;
      return u.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}

/** Start offset in seconds from `?t=` / `?start=` (`90`, `1m30s`). */
export function youtubeStart(url: string): number {
  const m = url.match(/[?&](?:t|start)=([0-9hms]+)/);
  if (!m) return 0;
  const v = m[1]!;
  if (/^\d+$/.test(v)) return Number(v);
  const part = (u: string) =>
    Number(v.match(new RegExp(`(\\d+)${u}`))?.[1] ?? 0);
  return part("h") * 3600 + part("m") * 60 + part("s");
}

/** Canonical watch URL (tracking params such as `si` dropped). */
export const youtubeWatchUrl = (id: string, start = 0) =>
  `https://youtu.be/${id}${start ? `?t=${start}` : ""}`;

/** Always-present 16:9 thumbnail. */
export const youtubeThumb = (id: string) =>
  `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

export const YOUTUBE_ALLOW =
  "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

/**
 * `<Frame><iframe/></Frame>` for a YouTube video. Mintlify renders iframes
 * client-side only (server HTML has an empty placeholder), so callers must
 * also emit a plain watch link for readers without JavaScript.
 */
export function youtubeFrame(id: string, title: string, start = 0): AstNode {
  const src = `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ""}`;
  return jsx("Frame", {}, [
    jsx("iframe", {
      src,
      title,
      allow: YOUTUBE_ALLOW,
      referrerPolicy: "strict-origin-when-cross-origin",
      allowFullScreen: true,
      className: "w-full aspect-video rounded-xl",
    }),
  ]);
}

/** `h:mm:ss`, as the legacy chapter lists showed it. */
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(s)}`;
}
