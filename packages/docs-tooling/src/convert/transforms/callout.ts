/**
 * Fumadocs `<Callout type title>` -> Mintlify callouts (spec §3.1).
 *
 *   <Callout type="warn" title="Heads up">Body</Callout>
 *
 * becomes
 *
 *   <Warning>
 *     **Heads up**
 *
 *     Body
 *   </Warning>
 *
 * - type: info -> Info, warn/warning -> Warning, caution/error/danger ->
 *   Danger, tip/idea -> Tip, success/check -> Check, none -> Note. Unknown
 *   types become Note with a warning.
 * - `title` (string or string-literal expression `title={"T"}`) becomes a
 *   bold first paragraph; Mintlify callouts have no title prop. A non-literal
 *   expression is kept as `**{expr}**`.
 * - An inline callout that is the only content of its paragraph
 *   (`<Callout>text</Callout>` on one line) is lifted to a block callout.
 * - A `<Callout>` with any attribute other than type/title (for example the
 *   generated concept cards' `<Callout icon color className>`) is already a
 *   Mintlify callout and is left alone, so the transform is idempotent.
 *
 * All Mintlify callouts are server-rendered and visible without JavaScript.
 */
import type { AstNode, Transform } from "../../types.ts";
import {
  type Jsx,
  exprAttrSource,
  findAttr,
  isBlankText,
  isJsx,
  paragraph,
  replaceNodes,
  strAttr,
  strong,
  text,
  unknownAttrs,
} from "./_wp2.ts";

export const CALLOUT_TYPES: Readonly<Record<string, string>> = {
  info: "Info",
  warn: "Warning",
  warning: "Warning",
  caution: "Danger",
  error: "Danger",
  danger: "Danger",
  tip: "Tip",
  idea: "Tip",
  success: "Check",
  check: "Check",
  note: "Note",
};

function titleNodes(el: Jsx): AstNode[] | undefined {
  const a = findAttr(el, "title");
  if (!a) return undefined;
  const s = strAttr(el, "title");
  if (s !== undefined) return s.trim() ? [text(s.trim())] : undefined;
  const expr = exprAttrSource(el, "title");
  return expr ? [{ type: "mdxTextExpression", value: expr }] : undefined;
}

export const transform: Transform = {
  name: "callout",
  order: 210,
  owner: "WP2",
  appliesTo: (source) => source.includes("<Callout"),
  run(tree, _file, ctx) {
    const convert = (el: Jsx): { name: string; title?: AstNode[] } | null => {
      if (unknownAttrs(el, ["type", "title"]).length > 0) return null;
      const type = (strAttr(el, "type") ?? "").trim().toLowerCase();
      let name = type ? CALLOUT_TYPES[type] : "Note";
      if (!name) {
        ctx.warn(`Callout type="${type}" is unknown; using <Note>`);
        name = "Note";
      }
      return { name, title: titleNodes(el) };
    };

    const soleCallout = (p: AstNode): Jsx | undefined => {
      if (p.type !== "paragraph") return undefined;
      const kids = (p.children ?? []).filter((c) => !isBlankText(c));
      const only = kids[0];
      return kids.length === 1 && isJsx(only, "Callout") ? only : undefined;
    };

    replaceNodes(tree, (node, parent) => {
      // Inline callout alone in its paragraph -> block callout. (Post-order:
      // the inline element is visited first and left for this branch.)
      if (node.type === "paragraph") {
        const only = soleCallout(node);
        if (!only) return undefined;
        const c = convert(only);
        if (!c) return undefined;
        const body = only.children ?? [];
        const children: AstNode[] = [];
        if (c.title) children.push(paragraph([strong(c.title)]));
        if (body.length) children.push(paragraph(body));
        return [
          {
            type: "mdxJsxFlowElement",
            name: c.name,
            attributes: [],
            children,
          },
        ];
      }
      if (!isJsx(node, "Callout")) return undefined;
      if (node.type === "mdxJsxTextElement" && soleCallout(parent) === node)
        return undefined;
      const c = convert(node);
      if (!c) return undefined;
      node.name = c.name;
      node.attributes = [];
      if (c.title) {
        if (node.type === "mdxJsxFlowElement") {
          node.children.unshift(paragraph([strong(c.title)]));
        } else {
          node.children.unshift(strong(c.title), text(" "));
        }
      }
      return undefined;
    });
  },
};
