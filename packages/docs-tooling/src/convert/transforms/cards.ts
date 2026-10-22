/**
 * Legacy `<Cards>` / `<Card>` -> docs `<Columns cols={2}>` / `<Card>`
 * (spec §3.1).
 *
 *   <Cards>
 *     <Card title="Accounts" href="/docs/core/accounts" description="How state is stored" icon={<Rocket />} />
 *   </Cards>
 *
 * becomes
 *
 *   <Columns cols={2}>
 *     <Card title="Accounts" href="/docs/core/accounts" icon="rocket">
 *       How state is stored
 *     </Card>
 *   </Columns>
 *
 * - `Cards` -> `Columns cols={2}` (the Fumadocs grid is two columns from
 *   the `sm` breakpoint up, one column on phones; Columns does the same).
 * - `description="…"` becomes the card body (before any existing children).
 * - `icon={<Name />}` (Fumadocs/boxicons React element) becomes the docs
 *   icon name, `icon="name"` (lucide, docs.json `icons.library`). Known
 *   boxicons get an explicit mapping; others are kebab-cased. A non-element
 *   expression is dropped with a warning.
 *
 * Cards and Columns are server-rendered; the whole card text is in the HTML
 * without JavaScript.
 */
import type { Transform } from "../../types.ts";
import {
  type Jsx,
  attr,
  exprAttr,
  exprAttrSource,
  findAttr,
  isJsx,
  paragraph,
  strAttr,
  text,
  walk,
} from "./_wp2.ts";

/** Fumadocs/boxicons component -> lucide icon name. */
export const ICONS: Readonly<Record<string, string>> = {
  Rocket: "rocket",
  Download: "download",
  ArrowToBottom: "download",
  Coins: "coins",
  Book: "book",
  BookOpen: "book-open",
  Code: "code",
  Terminal: "terminal",
  Wallet: "wallet",
  Globe: "globe",
};

export function iconName(component: string): string {
  return (
    ICONS[component] ??
    component
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
      .toLowerCase()
  );
}

function convertIcon(card: Jsx): string | null | undefined {
  const a = findAttr(card, "icon");
  if (!a) return undefined;
  const expr = exprAttrSource(card, "icon");
  if (expr === undefined) return undefined; // already a string icon
  const m = /^\s*<\s*([A-Z][A-Za-z0-9]*)\b[^>]*\/>\s*$/.exec(expr);
  return m ? iconName(m[1]!) : null;
}

export const transform: Transform = {
  name: "cards",
  order: 220,
  owner: "WP2",
  appliesTo: (source) => source.includes("<Card"),
  run(tree, _file, ctx) {
    walk(tree, (n) => {
      if (isJsx(n, "Cards")) {
        n.name = "Columns";
        const extra = n.attributes.filter(
          (a) => a.type !== "mdxJsxAttribute" || a.name !== "className",
        );
        if (extra.length)
          ctx.warn("<Cards> attributes other than className were dropped");
        n.attributes = [exprAttr("cols", "2")];
        return;
      }
      if (!isJsx(n, "Card")) return;
      const icon = convertIcon(n);
      const description = strAttr(n, "description");
      if (icon === undefined && description === undefined) return;
      if (description === undefined && findAttr(n, "description"))
        ctx.warn("<Card description={…}> is not a string literal; dropped");
      n.attributes = n.attributes.flatMap((a) => {
        if (a.type !== "mdxJsxAttribute") return [a];
        if (a.name === "description") return [];
        if (a.name === "icon" && icon !== undefined) {
          if (icon === null) {
            ctx.warn("<Card icon={…}> is not an icon element; dropped");
            return [];
          }
          return [attr("icon", icon)];
        }
        return [a];
      });
      if (description?.trim()) {
        if (n.type === "mdxJsxFlowElement")
          n.children.unshift(paragraph([text(description.trim())]));
        else
          n.children.unshift(
            text(description.trim() + (n.children.length ? " " : "")),
          );
      }
    });
  },
};
