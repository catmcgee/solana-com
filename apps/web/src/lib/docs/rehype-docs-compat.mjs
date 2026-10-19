/**
 * rehype-docs-compat (runs before rehype-code):
 *
 * - Mermaid: each ```mermaid fence in the content is followed by its
 *   pre-rendered light/dark SVG pair (`<div className="sol-mermaid">`,
 *   written by docs-tooling's mermaid transform and scripts/render-mermaid.ts).
 *   The page shows the images; the fence stays in the source and in the
 *   Markdown twin (this runs on HTML only), but is not rendered. A fence
 *   without a figure after it is kept as a code block.
 */
function isWhitespace(node) {
  return node.type === "text" && !node.value.trim();
}

function className(node) {
  const attr = node.attributes?.find?.(
    (a) => a.type === "mdxJsxAttribute" && a.name === "className",
  );
  return typeof attr?.value === "string" ? attr.value : "";
}

function isMermaidFence(node) {
  if (node.type !== "element" || node.tagName !== "pre") return false;
  const code = node.children?.[0];
  const cls = code?.properties?.className;
  return Array.isArray(cls) && cls.includes("language-mermaid");
}

function isMermaidFigure(node) {
  return (
    node?.type === "mdxJsxFlowElement" &&
    node.name === "div" &&
    /(^|\s)sol-mermaid(\s|$)/.test(className(node))
  );
}

function strip(parent) {
  if (!parent.children) return;
  parent.children = parent.children.filter((node, i, all) => {
    if (!isMermaidFence(node)) return true;
    let j = i + 1;
    while (j < all.length && isWhitespace(all[j])) j++;
    return !isMermaidFigure(all[j]);
  });
  for (const child of parent.children) strip(child);
}

export function rehypeDocsCompat() {
  return (tree) => strip(tree);
}
