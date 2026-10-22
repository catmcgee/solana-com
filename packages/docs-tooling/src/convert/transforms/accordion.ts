/**
 * Legacy `<Accordions>` / `<Accordion title>` -> docs
 * `<AccordionGroup>` / `<Accordion title>` (spec §3.1). Rename only.
 *
 * - `Accordions` attributes (`type="single"`, `defaultValue`, …) have no
 *   docs equivalent and are dropped with a warning.
 * - `Accordion` keeps `title`; `value` is dropped. A string-literal
 *   expression title (`title={"T"}`) becomes a plain string.
 *
 * No-JS: the docs render Accordion as native `<details>/<summary>`, so the
 * body is in the server HTML and opens without JavaScript.
 */
import type { Transform } from "../../types.ts";
import {
  attr,
  exprAttrSource,
  isJsx,
  strAttr,
  unknownAttrs,
  walk,
} from "./_wp2.ts";

export const transform: Transform = {
  name: "accordion",
  order: 250,
  owner: "WP2",
  appliesTo: (source) => source.includes("<Accordion"),
  run(tree, _file, ctx) {
    walk(tree, (n) => {
      if (isJsx(n, "Accordions")) {
        n.name = "AccordionGroup";
        if (n.attributes.length) {
          ctx.warn(
            `<Accordions> attributes dropped: ${unknownAttrs(n, []).join(", ")}`,
          );
          n.attributes = [];
        }
        return;
      }
      if (!isJsx(n, "Accordion")) return;
      const hasValue = n.attributes.some(
        (a) => a.type === "mdxJsxAttribute" && a.name === "value",
      );
      const titleExpr = exprAttrSource(n, "title");
      const title = titleExpr !== undefined ? strAttr(n, "title") : undefined;
      if (!hasValue && title === undefined) return;
      n.attributes = n.attributes.flatMap((a) => {
        if (a.type !== "mdxJsxAttribute") return [a];
        if (a.name === "value") return [];
        if (a.name === "title" && title !== undefined)
          return [attr("title", title)];
        return [a];
      });
    });
  },
};
