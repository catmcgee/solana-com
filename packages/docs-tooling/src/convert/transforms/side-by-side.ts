/**
 * SideBySide `### !left` / `### !right` -> `<Columns cols={2}>` with one
 * `<div>` per side (spec §3.1 `side-by-side.ts`).
 *
 * Columns is server-rendered and stacks on narrow screens, so both sides
 * are always readable without JavaScript, in light and dark mode. Content
 * before the first `### !left|!right` marker stays before the Columns.
 * Mentions inside (Code Hike wrapped SideBySide in WithMentions) are
 * handled by mentions.ts.
 */
import type { AstNode, Transform } from "../../types.ts";
import {
  exprAttr,
  flow,
  isJsx,
  markerHeading,
  replaceJsx,
  walk,
} from "./_codehike.ts";

export const transform: Transform = {
  name: "side-by-side",
  order: 82,
  appliesTo: (source) => source.includes("<SideBySide"),
  run(tree, _file, ctx) {
    replaceJsx(tree, "SideBySide", (el) => {
      const before: AstNode[] = [];
      const sides: Record<string, AstNode[]> = {};
      const order: string[] = [];
      let current: AstNode[] | null = null;
      for (const c of el.children ?? []) {
        const m = markerHeading(c, 3);
        if (m && m.bang === "!") {
          const key = m.rest;
          if (!sides[key]) {
            sides[key] = [];
            order.push(key);
          }
          current = sides[key]!;
          continue;
        }
        (current ?? before).push(c);
      }
      const known = ["left", "right"];
      for (const k of order) {
        if (!known.includes(k))
          ctx.warn(`SideBySide: unknown section "!${k}" kept as a column`);
      }
      const keys = [
        ...known.filter((k) => sides[k]),
        ...order.filter((k) => !known.includes(k)),
      ];
      if (!keys.length) {
        ctx.warn("SideBySide without !left/!right sections: unwrapped");
        return before;
      }
      const columns = flow(
        "Columns",
        [exprAttr("cols", String(Math.max(1, Math.min(keys.length, 4))))],
        keys.map((k) => flow("div", [], sides[k]!)),
      );
      return [...before, columns];
    });
    walk(tree, (n) => {
      if (isJsx(n, "SideBySide")) ctx.error("SideBySide left unconverted");
    });
  },
};
