/**
 * Tailwind 3 emitted variant utilities (hover:, md:, [&_svg]:, ...) at the
 * end of the stylesheet, after any plain CSS that followed
 * `@tailwind utilities`, while plain utilities stayed in place. So in
 * globals.css a rule such as `.nd-body-xl { @apply my-0 ... }` beat a plain
 * `mt-8` but lost to `xl:mt-8`. Tailwind 4 emits all utilities in one block.
 *
 * globals.css brackets `@tailwind utilities` with two marker rules; this
 * plugin moves every variant utility from between them to the end of the
 * file, restoring Tailwind 3's order, and removes the markers.
 */
const START = "#tw3-utilities-start";
const END = "#tw3-utilities-end";

// A plain utility selector: one escaped class, or the child selector that
// space-* and divide-* utilities use (as tailwind3-space-divide.js writes
// it).
const CLASS = String.raw`\.(?:\\.|[^\s:.\[\]>+~#,()\\])+`;
const PLAIN = new RegExp(
  String.raw`^${CLASS}(?:\s*>\s*:not\(\[hidden\]\)\s*~\s*:not\(\[hidden\]\))?$`,
);

module.exports = () => ({
  postcssPlugin: "tailwind3-variant-order",
  OnceExit(root) {
    const nodes = root.nodes;
    const start = nodes.findIndex(
      (n) => n.type === "rule" && n.selector === START,
    );
    const end = nodes.findIndex((n) => n.type === "rule" && n.selector === END);
    if (start < 0 || end < start) return;

    const moved = [];
    for (const node of nodes.slice(start + 1, end)) {
      if (node.type === "atrule") {
        if (/^(media|supports|container)$/.test(node.name)) moved.push(node);
        continue;
      }
      if (node.type !== "rule") continue;
      const selectors = node.selectors;
      const plain = selectors.filter((s) => PLAIN.test(s));
      if (plain.length === selectors.length) continue;
      if (plain.length === 0) {
        moved.push(node);
        continue;
      }
      const variant = node.clone({
        selectors: selectors.filter((s) => !PLAIN.test(s)),
      });
      node.selectors = plain;
      moved.push(variant);
    }
    const markers = [nodes[start], nodes[end]];
    for (const marker of markers) marker.remove();
    for (const node of moved) root.append(node);
  },
});
module.exports.postcss = true;
