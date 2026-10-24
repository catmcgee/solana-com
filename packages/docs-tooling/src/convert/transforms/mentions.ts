/**
 * WithMentions + `[x](mention:name)` + `// !mention name` (spec §3.1
 * `mentions.ts`).
 *
 * Code Hike used mentions only to highlight a code line while the reader
 * hovered a prose link; there is no tooltip text to preserve. Static output:
 * - `<WithMentions>` is unwrapped (its children stay in place);
 * - a `mention:` link is replaced by its own children, so `` [`owner`](…) ``
 *   becomes `` `owner` `` and `[bump seed](…)` becomes plain `bump seed`
 *   (the text was always visible; nothing is hidden without JS);
 * - `!mention` comment lines are removed from every fence in the file.
 *
 * `mention:` links are also handled outside WithMentions (SideBySide
 * implied a WithMentions wrapper in Code Hike).
 */
import type { AstNode, Transform } from "../../types.ts";
import {
  isCode,
  isJsx,
  replaceJsx,
  stripAnnotations,
  walk,
} from "./_codehike.ts";

const MENTION = new Set(["mention"]);

function unwrapMentionLinks(n: AstNode): number {
  let count = 0;
  const kids = n.children;
  if (!kids) return 0;
  for (let i = 0; i < kids.length; i++) {
    const c = kids[i]!;
    count += unwrapMentionLinks(c);
    if (
      c.type === "link" &&
      typeof c.url === "string" &&
      c.url.startsWith("mention:")
    ) {
      const inner = c.children ?? [];
      kids.splice(i, 1, ...inner);
      i += inner.length - 1;
      count++;
    }
  }
  return count;
}

export const transform: Transform = {
  name: "mentions",
  order: 81,
  appliesTo: (source) =>
    source.includes("<WithMentions") ||
    source.includes("mention:") ||
    source.includes("!mention"),
  run(tree, _file, ctx) {
    replaceJsx(tree, "WithMentions", (el) => el.children ?? []);
    unwrapMentionLinks(tree);
    walk(tree, (n) => {
      if (isCode(n)) stripAnnotations(n, MENTION);
      if (isJsx(n, "WithMentions")) ctx.error("WithMentions left unconverted");
    });
  },
};
