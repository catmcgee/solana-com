/**
 * Mermaid: Mintlify's native ```` ```mermaid ```` plus a static no-JS
 * fallback (decisions.md "Mermaid must have a static fallback").
 *
 * Mintlify renders mermaid fences client-side only (SSR probe: nothing in
 * the server HTML). Output:
 *
 *   ```mermaid
 *   flowchart LR …
 *   ```
 *
 *   <div className="nojs-only" data-fallback="mermaid">
 *     ```text Mermaid
 *     flowchart LR …
 *     ```
 *   </div>
 *
 *   <p className="sol-caption">Durable Nonce</p>
 *
 * - The fallback div is hidden while JavaScript runs (`.nojs-only`, see
 *   migration/setup-nojs-fallback.css) and shows the diagram source when it
 *   does not. It is a source-text fallback, not an image: transforms are
 *   pure (no headless browser), and the source is the single truth.
 * - The fallback is re-synced from the fence on every run, so editing the
 *   diagram and re-running convert keeps both in step (idempotent).
 * - `title="T"` (Code Hike) becomes the caption paragraph after the
 *   fallback, the same output fences.ts specifies (§3.2), so the two
 *   transforms agree whichever runs first.
 */
import type { AstNode, Transform } from "../../types.ts";
import { attr, type Code, flow, getAttr, isCode, isJsx } from "./_wp3.ts";

export const FALLBACK_MARK = "mermaid";

function isFallback(n: AstNode | undefined): boolean {
  return isJsx(n, "div") && getAttr(n, "data-fallback") === FALLBACK_MARK;
}

function fallbackFor(source: string): AstNode {
  return flow(
    "div",
    [attr("className", "nojs-only"), attr("data-fallback", FALLBACK_MARK)],
    [{ type: "code", lang: "text", meta: "Mermaid", value: source }],
  );
}

function titleOf(meta: string | null | undefined): string | undefined {
  if (!meta) return undefined;
  const m = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)')/.exec(meta);
  return m ? (m[1] ?? m[2]) : undefined;
}

export const transform: Transform = {
  name: "mermaid",
  order: 86,
  owner: "WP3",
  appliesTo: (source) => source.includes("mermaid"),
  run(tree) {
    const visit = (parent: AstNode) => {
      const kids = parent.children;
      if (!kids) return;
      for (let i = 0; i < kids.length; i++) {
        const c = kids[i]!;
        if (isFallback(c)) continue;
        if (!(isCode(c) && c.lang === "mermaid")) {
          visit(c);
          continue;
        }
        const code = c as Code;
        const title = titleOf(code.meta);
        if (code.meta) code.meta = null;
        const next = kids[i + 1];
        if (isFallback(next)) {
          const inner = (next!.children ?? []).find(isCode) as Code | undefined;
          if (
            !inner ||
            inner.value !== code.value ||
            inner.lang !== "text" ||
            (next!.children ?? []).length !== 1
          ) {
            kids.splice(i + 1, 1, fallbackFor(code.value));
          }
        } else {
          kids.splice(i + 1, 0, fallbackFor(code.value));
        }
        if (title) {
          // One line (`<p …>T</p>`): MDX unravels the paragraph, so this
          // renders as a single <p>, not <p><p>.
          kids.splice(i + 2, 0, {
            type: "paragraph",
            children: [
              {
                type: "mdxJsxTextElement",
                name: "p",
                attributes: [attr("className", "sol-caption")],
                children: [{ type: "text", value: title }],
              },
            ],
          });
        }
        i += title ? 2 : 1;
      }
    };
    visit(tree);
  },
};
