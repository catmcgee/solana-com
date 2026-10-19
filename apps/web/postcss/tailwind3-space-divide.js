/**
 * Tailwind 4's space-* and divide-* utilities target every child but the
 * last (`:where(.x > :not(:last-child))`, margin/border on the end side).
 * Tailwind 3 targeted every visible child after the first
 * (`.x > :not([hidden]) ~ :not([hidden])`, margin/border on the start
 * side), with the higher specificity that implies. Grids, hidden children
 * and per-item border overrides (e.g. `xl:!border-t-0`) render differently,
 * so rewrite these rules to the Tailwind 3 form.
 */
const WHERE = /^:where\((.+?)\s*>\s*:not\(:last-child\)\)$/;
const SIBLINGS = " > :not([hidden]) ~ :not([hidden])";

// Tailwind 4 property (start side, holds the `* reverse` term) and end side
// (holds the `* (1 - reverse)` term) -> Tailwind 3's property for each term.
const SWAPS = [
  ["margin-block-start", "margin-block-end", "margin-bottom", "margin-top"],
  ["margin-inline-start", "margin-inline-end", "margin-right", "margin-left"],
  [
    "border-top-width",
    "border-bottom-width",
    "border-bottom-width",
    "border-top-width",
  ],
  [
    "border-inline-start-width",
    "border-inline-end-width",
    "border-right-width",
    "border-left-width",
  ],
];

module.exports = () => ({
  postcssPlugin: "tailwind3-space-divide",
  Rule(rule) {
    if (!rule.selector.includes(":not(:last-child)")) return;
    const selectors = rule.selectors.map((s) => {
      const m = WHERE.exec(s.trim());
      return m ? m[1] + SIBLINGS : null;
    });
    if (selectors.some((s) => s === null)) return;
    rule.selectors = selectors;
    for (const [start, end, startTo, endTo] of SWAPS) {
      const s = rule.nodes.find((d) => d.type === "decl" && d.prop === start);
      const e = rule.nodes.find((d) => d.type === "decl" && d.prop === end);
      if (s) s.prop = startTo;
      if (e) e.prop = endTo;
    }
  },
});
module.exports.postcss = true;
