/**
 * codetabs: Code Hike `<CodeTabs>` that are not example
 * blocks -> docs `<CodeGroup>`.
 *
 *   <CodeTabs storage="x" flags="r">            <CodeGroup>
 *   ```ts !! title="Kit"                         ```ts !! title="Kit"
 *   …                                     ->     …
 *   ```                                          ```
 *   ```rs !! title="Rust"                        ```rs !! title="Rust"
 *   …                                            …
 *   ```                                          ```
 *   </CodeTabs>                                  </CodeGroup>
 *
 * Rules
 * - Only fences inside (blank text ignored): rename to `<CodeGroup>`. Every
 *   fence, with its language and meta, is kept untouched; `fences.ts`
 *   (order 900) later turns the Code Hike meta (`!! title="Kit"`) into the
 *   docs title, which CodeGroup uses as the tab label.
 * - A single fence: the wrapper is removed and the fence stands alone. Its
 *   title becomes the code block's header, which is what a one-tab
 *   CodeTabs showed.
 * - Fences mixed with other content (prose between tabs, e.g. "Run with
 *   `cargo test`" after the Rust tab on surfpool/sdk/installation): a
 *   CodeGroup may only hold code blocks, so this becomes `<Tabs>` with one
 *   `<Tab title>` per fence. Content after a fence stays in that fence's
 *   tab; content before the first fence goes into the first tab.
 * - `storage=` (tab persistence key), `flags=` (`r` = runnable) and
 *   `runner=` are dropped. Blocks with no recorded output get no Run button
 *   (decisions.md); recorded examples were already replaced by
 *   `codetabs-examples` (order 85).
 * - A fence still carrying `file=packages/…` is an error: codetabs-examples
 *   should have replaced the whole block (WP5 handoff), and renaming it
 *   would publish an empty code block.
 *
 * No-JS: the renderer at conversion time server-rendered every CodeGroup
 * panel (inactive ones with `[hidden]`) and every Tab panel (inactive ones
 * with `.hidden`); styles/nojs.css un-hides and stacks them when JavaScript is off.
 *
 * Order 300 (components band): after terminal.ts (88), which keeps a
 * terminal fence inside tabs as one block, and before fences.ts (900),
 * which treats `CodeGroup` exactly like `CodeTabs`.
 */
import type { AstNode, Transform } from "../../types.ts";
import { attr, flow, isBlankText, isJsx, replaceNodes } from "./_mdx.ts";
import { parseMeta } from "./fences.ts";

const DROPPED = new Set(["storage", "flags", "runner"]);

function tabTitle(code: AstNode): string {
  const meta = parseMeta(code.meta as string | null | undefined);
  return meta.title || String(code.lang ?? "") || "Code";
}

export const transform: Transform = {
  name: "codetabs",
  order: 300,
  appliesTo: (source) => source.includes("<CodeTabs"),
  run(tree, _file, ctx) {
    replaceNodes(tree, (n) => {
      if (!isJsx(n, "CodeTabs")) return undefined;
      const unknown = n.attributes
        .filter(
          (a) => a.type !== "mdxJsxAttribute" || !DROPPED.has(String(a.name)),
        )
        .map((a) => (a.type === "mdxJsxAttribute" ? String(a.name) : "{…}"));
      if (unknown.length)
        ctx.warn(`<CodeTabs> attributes dropped: ${unknown.join(", ")}`);

      const kids = n.children.filter((c) => !isBlankText(c));
      const codes = kids.filter((c) => c.type === "code");
      for (const c of codes) {
        if (/(^|\s)file=packages\//.test(String(c.meta ?? ""))) {
          ctx.error(
            "<CodeTabs> fence still has file=packages/…; codetabs-examples should have replaced this block (run `examples extract` + `examples:build`)",
          );
          return undefined;
        }
      }
      if (codes.length === 0) {
        ctx.warn("<CodeTabs> without code blocks unwrapped");
        return kids;
      }
      if (codes.length === kids.length) {
        if (codes.length === 1) return codes;
        n.name = "CodeGroup";
        n.attributes = [];
        return [n];
      }
      // Mixed content: Tabs with one Tab per fence.
      const tabs: AstNode[][] = [];
      const leading: AstNode[] = [];
      for (const c of kids) {
        if (c.type === "code") tabs.push([c]);
        else if (tabs.length) tabs[tabs.length - 1]!.push(c);
        else leading.push(c);
      }
      tabs[0]!.unshift(...leading);
      return [
        flow(
          "Tabs",
          [],
          tabs.map((children) => {
            const code = children.find((c) => c.type === "code")!;
            return flow("Tab", [attr("title", tabTitle(code))], children);
          }),
        ),
      ];
    });
  },
};
