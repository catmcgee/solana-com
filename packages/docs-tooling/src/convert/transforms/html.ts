/**
 * Raw HTML/JSX in content (spec §3.1 `html.ts`).
 *
 * The legacy pages style a few boxes with Fumadocs Tailwind tokens
 * (`bg-fd-muted`, `dark:bg-gray-950/20`, …) that the docs do not ship, and
 * one box (`learn/what-is-solana`) is dark-only (`bg-zinc-900 text-white`),
 * which breaks light mode. They become built-in components or Markdown that
 * work in both modes:
 *
 * 1. Pros/cons grid (`tools/litesvm/**`): `div.grid > div > h4 + ul > li`
 *    -> `<Columns cols={2}><Card title="Pros" icon="check">` list `</Card>`
 *    `<Card title="Cons" icon="x">` list `</Card></Columns>`. The icon comes
 *    from the ✓/✗ glyph, so translated labels keep the right icon.
 * 2. Label + list (`div > div(label) + ul > li`) -> `**label**` paragraph
 *    and a Markdown list.
 * 3. Badge link (`div > a > svg + text`) -> a paragraph with the link
 *    (the decorative svg is dropped).
 * 4. Any other box with background/border classes -> `<Note>` whose body
 *    is the box content as Markdown (headings become bold paragraphs).
 *    This covers the dark-only `what-is-solana` box.
 *
 * `<iframe>`: lower-case HTML attributes are normalized to JSX
 * (`frameborder` -> `frameBorder`, `allowfullscreen` -> `allowFullScreen`,
 * `referrerpolicy`, `class`, …). The iframe content needs JavaScript (the
 * embedded app or player), so a `nojs-only` link to it follows, unless one
 * is already there. YouTube embeds link to the watch/playlist page.
 *
 * `<video>`/`<img>` `src` rewrites are images.ts. Plain inline HTML (`<br>`,
 * `<sup>`, `<small>`, `<b>`) is valid in the docs and left alone.
 */
import type { AstNode, Transform } from "../../types.ts";
import {
  type Jsx,
  NOJS_CLASS,
  attr,
  exprAttr,
  flow,
  isBlankText,
  isJsx,
  isNojsBlock,
  paragraph,
  replaceNodes,
  strAttr,
  strong,
  text,
  textOf,
} from "./_wp2.ts";

const HTML_ATTR_RENAMES: Readonly<Record<string, string>> = {
  class: "className",
  frameborder: "frameBorder",
  allowfullscreen: "allowFullScreen",
  referrerpolicy: "referrerPolicy",
  marginheight: "marginHeight",
  marginwidth: "marginWidth",
  allowtransparency: "allowTransparency",
  autoplay: "autoPlay",
  playsinline: "playsInline",
  crossorigin: "crossOrigin",
  srcdoc: "srcDoc",
  tabindex: "tabIndex",
};

const classes = (n: Jsx) => (strAttr(n, "className") ?? "").split(/\s+/);
const jsxKids = (n: AstNode): Jsx[] =>
  (n.children ?? []).filter((c): c is Jsx => isJsx(c));

/** Every `<name>` element under `n` (not descending into matches). */
function findAll(n: AstNode, name: string): Jsx[] {
  const out: Jsx[] = [];
  const visit = (c: AstNode) => {
    if (isJsx(c, name)) out.push(c);
    else c.children?.forEach(visit);
  };
  n.children?.forEach(visit);
  return out;
}

// ---------------------------------------------------------------------------
// HTML subtree -> mdast
// ---------------------------------------------------------------------------

/** Inline content of an HTML subtree. */
export function phrasing(nodes: readonly AstNode[]): AstNode[] {
  const out: AstNode[] = [];
  for (const n of nodes) {
    if (isJsx(n)) {
      switch (n.name) {
        case "svg":
        case "path":
        case "img":
          continue;
        case "code":
          out.push({ type: "inlineCode", value: textOf(n) });
          continue;
        case "b":
        case "strong":
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6":
          out.push(strong(phrasing(n.children)));
          continue;
        case "i":
        case "em":
          out.push({ type: "emphasis", children: phrasing(n.children) });
          continue;
        case "br":
          out.push({ type: "break" });
          continue;
        case "a": {
          const href = strAttr(n, "href");
          const kids = phrasing(n.children);
          out.push(
            href
              ? { type: "link", url: href, title: null, children: kids }
              : ({ type: "emphasis", children: kids } as AstNode),
          );
          continue;
        }
        default:
          out.push(...phrasing(n.children));
          continue;
      }
    }
    if (n.type === "paragraph" || n.type === "heading") {
      if (out.length && !endsWithSpace(out)) out.push(text(" "));
      out.push(...phrasing(n.children ?? []));
      continue;
    }
    out.push(n);
  }
  return trimPhrasing(out);
}

function endsWithSpace(nodes: AstNode[]): boolean {
  const last = nodes[nodes.length - 1];
  return last?.type === "text" && /\s$/.test(String(last.value));
}

/** Collapse whitespace at the edges and inside text runs. */
function trimPhrasing(nodes: AstNode[]): AstNode[] {
  const out = nodes
    .map((n) =>
      n.type === "text"
        ? { ...n, value: String(n.value).replace(/\s+/g, " ") }
        : n,
    )
    .filter((n) => !(n.type === "text" && n.value === ""));
  const first = out[0];
  if (first?.type === "text")
    out[0] = { ...first, value: String(first.value).trimStart() };
  const last = out[out.length - 1];
  if (last?.type === "text")
    out[out.length - 1] = { ...last, value: String(last.value).trimEnd() };
  return out.filter((n) => !(n.type === "text" && n.value === ""));
}

function list(items: AstNode[][]): AstNode {
  return {
    type: "list",
    ordered: false,
    spread: false,
    children: items.map((p) => ({
      type: "listItem",
      spread: false,
      checked: null,
      children: [paragraph(p)],
    })),
  };
}

/** List items of a `<ul>`/`<ol>` as phrasing, dropping "•" bullet spans. */
function listItems(ul: Jsx): AstNode[][] {
  const bullet = (c: AstNode) =>
    isJsx(c, "span") && /^\s*[•·]\s*$/.test(textOf(c));
  return findAll(ul, "li").map((li) =>
    phrasing(
      li.children
        .flatMap((c) => (c.type === "paragraph" ? (c.children ?? []) : [c]))
        .filter((c) => !bullet(c)),
    ),
  );
}

/** Block content of an HTML subtree, as Markdown. */
export function blocks(nodes: readonly AstNode[]): AstNode[] {
  const out: AstNode[] = [];
  let inline: AstNode[] = [];
  const flush = () => {
    const p = trimPhrasing(inline);
    if (p.length) out.push(paragraph(p));
    inline = [];
  };
  for (const n of nodes) {
    if (isJsx(n)) {
      if (/^h[1-6]$/.test(n.name ?? "")) {
        flush();
        out.push(paragraph([strong(phrasing(n.children))]));
        continue;
      }
      if (n.name === "ul" || n.name === "ol") {
        flush();
        const l = list(listItems(n));
        if (n.name === "ol") l.ordered = true;
        out.push(l);
        continue;
      }
      if (n.name === "p" || n.name === "div" || n.name === "section") {
        flush();
        out.push(...blocks(n.children));
        continue;
      }
      if (n.name === "svg") continue;
      if (n.name === "a" && n.type === "mdxJsxFlowElement") {
        flush();
        out.push(paragraph(phrasing([n])));
        continue;
      }
      if (n.type === "mdxJsxFlowElement" && /^[A-Z]/.test(n.name ?? "")) {
        flush();
        out.push(n); // a component (Callout, Card, …) inside a box
        continue;
      }
      inline.push(...phrasing([n]));
      continue;
    }
    if (n.type === "paragraph") {
      flush();
      const p = phrasing(n.children ?? []);
      if (p.length) out.push(paragraph(p));
      continue;
    }
    if (n.type === "text" && isBlankText(n)) continue;
    if (
      n.type === "text" ||
      n.type === "inlineCode" ||
      n.type === "emphasis" ||
      n.type === "strong" ||
      n.type === "link"
    ) {
      inline.push(n);
      continue;
    }
    flush();
    out.push(n); // code, list, table, …
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------------
// Box patterns
// ---------------------------------------------------------------------------

function prosCons(grid: Jsx): AstNode[] | undefined {
  if (!classes(grid).includes("grid")) return undefined;
  const boxes = jsxKids(grid);
  if (boxes.length < 2 || !boxes.every((b) => b.name === "div"))
    return undefined;
  const cards: AstNode[] = [];
  for (const box of boxes) {
    const head = jsxKids(box).find((c) => /^h[1-6]$/.test(c.name ?? ""));
    const ul = jsxKids(box).find((c) => c.name === "ul");
    if (!head || !ul) return undefined;
    const label = textOf(head).replace(/\s+/g, " ").trim();
    const glyph = /^[✓✔]/.test(label)
      ? "check"
      : /^[✗✘×]/.test(label)
        ? "x"
        : undefined;
    const title = label.replace(/^[✓✔✗✘×]\s*/, "");
    cards.push(
      flow(
        "Card",
        [attr("title", title), ...(glyph ? [attr("icon", glyph)] : [])],
        [list(listItems(ul))],
      ),
    );
  }
  return [flow("Columns", [exprAttr("cols", String(cards.length))], cards)];
}

function labelList(box: Jsx): AstNode[] | undefined {
  const kids = jsxKids(box);
  if (kids.length !== 2) return undefined;
  const [label, ul] = kids;
  if (label!.name !== "div" || (ul!.name !== "ul" && ul!.name !== "ol"))
    return undefined;
  const l = list(listItems(ul!));
  if (ul!.name === "ol") l.ordered = true;
  return [paragraph([strong(phrasing(label!.children))]), l];
}

function badgeLink(box: Jsx): AstNode[] | undefined {
  const kids = jsxKids(box);
  if (kids.length !== 1 || kids[0]!.name !== "a") return undefined;
  if (
    box.children.some(
      (c) => !isJsx(c) && !isBlankText(c) && c.type !== "paragraph",
    )
  )
    return undefined;
  return [paragraph(phrasing(kids))];
}

const BOX_CLASS = /^(dark:)?(bg-|border|rounded|shadow|p-|px-|py-)/;

function convertBox(div: Jsx): AstNode[] | undefined {
  return (
    prosCons(div) ??
    labelList(div) ??
    badgeLink(div) ??
    (classes(div).some((c) => BOX_CLASS.test(c))
      ? [flow("Note", [], blocks(div.children))]
      : undefined)
  );
}

// ---------------------------------------------------------------------------
// iframes
// ---------------------------------------------------------------------------

/** Where the no-JS link of an iframe points. */
export function iframeLink(src: string): string {
  const yt =
    /^https?:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/([^?#]+)(?:\?(.*))?$/.exec(
      src,
    );
  if (yt) {
    const params = new URLSearchParams(yt[2] ?? "");
    if (yt[1] === "videoseries" && params.get("list"))
      return `https://www.youtube.com/playlist?list=${params.get("list")}`;
    return `https://www.youtube.com/watch?v=${yt[1]}`;
  }
  return src;
}

function normalizeIframe(n: Jsx): boolean {
  let changed = false;
  for (const a of n.attributes) {
    if (a.type !== "mdxJsxAttribute" || !a.name) continue;
    const to = HTML_ATTR_RENAMES[a.name.toLowerCase()];
    if (to && a.name !== to) {
      a.name = to;
      changed = true;
    }
  }
  return changed;
}

// ---------------------------------------------------------------------------

export const transform: Transform = {
  name: "html",
  order: 270,
  owner: "WP2",
  appliesTo: (source) => /<(div|iframe|span)\b/.test(source),
  run(tree, _file, ctx) {
    replaceNodes(tree, (node, parent, ancestors) => {
      if (!isJsx(node) || node.type !== "mdxJsxFlowElement") return undefined;
      if (node.name === "iframe") {
        normalizeIframe(node);
        const src = strAttr(node, "src") ?? "";
        if (!/^https?:\/\//.test(src)) return undefined;
        const siblings = parent.children ?? [];
        const i = siblings.indexOf(node);
        const next = siblings.slice(i + 1).find((s) => !isBlankText(s));
        // The iframe may sit in a <Frame>; the link goes after the Frame
        // (handled when the Frame's parent is visited, see below).
        if (isJsx(parent, "Frame")) return undefined;
        if (isNojsBlock(next)) return undefined;
        const url = iframeLink(src);
        return [
          node,
          flow(
            "div",
            [attr("className", NOJS_CLASS)],
            [
              paragraph([
                { type: "link", url, title: null, children: [text(url)] },
              ]),
            ],
          ),
        ];
      }
      if (node.name !== "div") return undefined;
      if (isNojsBlock(node)) return undefined;
      // Our own generated wrappers (sol-caption, …) are not legacy boxes.
      if (classes(node).every((c) => c === NOJS_CLASS || c.startsWith("sol-")))
        return undefined;
      // Only the outermost box is converted (inner divs are part of it).
      if (ancestors.some((a) => isJsx(a, "div"))) return undefined;
      if (!strAttr(node, "className")) return undefined;
      const out = convertBox(node);
      if (!out) {
        ctx.warn(
          `<div className="${strAttr(node, "className")}"> left as HTML (no known pattern)`,
        );
        return undefined;
      }
      return out;
    });
  },
};
