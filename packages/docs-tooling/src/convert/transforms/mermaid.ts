/**
 * Mermaid: the ```` ```mermaid ```` fence stays the single source; every
 * fence is followed by a pre-rendered, themed SVG pair (decisions.md
 * "Mermaid must have a static fallback", redesign 2026-10-15):
 *
 *   ```mermaid
 *   flowchart LR …
 *   ```
 *
 *   <div className="sol-mermaid" data-fallback="mermaid" data-mermaid="<hash>">
 *     <img className="block dark:hidden" src="/docs-assets/assets/docs/mermaid/<hash>-light.svg" alt="…" />
 *     <img className="hidden dark:block" src="/docs-assets/assets/docs/mermaid/<hash>.svg" alt="…" />
 *   </div>
 *
 *   <p className="sol-caption">Durable Nonce</p>
 *
 * - `<hash>` is `mermaidHash(source)`. The SVGs are drawn by
 *   `scripts/render-mermaid.ts` (headless Chromium + the mermaid package,
 *   Solana palette, light and dark) and get their font from
 *   `scripts/embed-diagram-fonts.py`. Transforms stay pure: this only
 *   computes the hash.
 * - The figure renders on the server, so it reads without JavaScript, and
 *   styles/diagrams.css hides Mintlify's client-side render of the fence when
 *   the figure follows it, so readers see one drawing in every mode.
 * - The figure is re-synced from the fence on every run (editing the diagram
 *   changes the hash), and the older source-text fallback
 *   (`<div className="nojs-only" data-fallback="mermaid">```text …```</div>`)
 *   is replaced, so the transform stays idempotent.
 * - `title="T"` (Code Hike) becomes the caption paragraph after the figure,
 *   the same output fences.ts specifies (§3.2), and is the image alt text.
 */
import { createHash } from "node:crypto";
import type { AstNode, Transform } from "../../types.ts";
import { attr, type Code, flow, getAttr, isCode, isJsx } from "./_wp3.ts";

export const FALLBACK_MARK = "mermaid";

function isFallback(n: AstNode | undefined): boolean {
  return isJsx(n, "div") && getAttr(n, "data-fallback") === FALLBACK_MARK;
}

export const MERMAID_DIR = "/docs-assets/assets/docs/mermaid";

/** Stable id of a diagram source (file names of its SVG pair). */
export function mermaidHash(source: string): string {
  return createHash("sha256").update(source).digest("hex").slice(0, 12);
}

function fallbackFor(source: string, alt: string): AstNode {
  const h = mermaidHash(source);
  const img = (cls: string, file: string) =>
    flow(
      "img",
      [
        attr("className", cls),
        attr("src", `${MERMAID_DIR}/${file}`),
        attr("alt", alt),
      ],
      [],
    );
  return flow(
    "div",
    [
      attr("className", "sol-mermaid"),
      attr("data-fallback", FALLBACK_MARK),
      attr("data-mermaid", h),
    ],
    [
      img("block dark:hidden", `${h}-light.svg`),
      img("hidden dark:block", `${h}.svg`),
    ],
  );
}

/** Caption text of a `<p className="sol-caption">` paragraph, if `n` is one. */
function captionOf(n: AstNode | undefined): string | undefined {
  const el =
    n?.type === "paragraph" && n.children?.length === 1 ? n.children[0] : n;
  if (!el || !isJsx(el) || getAttr(el, "className") !== "sol-caption")
    return undefined;
  const t = (el.children ?? [])
    .map((k) =>
      typeof k.value === "string"
        ? k.value
        : (k.children ?? []).map((g) => g.value ?? "").join(""),
    )
    .join("")
    .trim();
  return t || undefined;
}

/** True when `n` is exactly the figure `fallbackFor(source, alt)` builds. */
function isCurrent(n: AstNode, source: string, alt: string): boolean {
  if (getAttr(n as never, "data-mermaid") !== mermaidHash(source)) return false;
  const imgs = (n.children ?? []).filter((k) => isJsx(k, "img"));
  return (
    (n.children ?? []).length === 2 &&
    imgs.length === 2 &&
    imgs.every((k) => getAttr(k as never, "alt") === alt)
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
        const caption =
          title ?? captionOf(kids[i + (isFallback(next) ? 2 : 1)]);
        const alt = caption ?? "Diagram";
        if (isFallback(next)) {
          if (!isCurrent(next!, code.value, alt))
            kids.splice(i + 1, 1, fallbackFor(code.value, alt));
        } else {
          kids.splice(i + 1, 0, fallbackFor(code.value, alt));
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
