/**
 * Light/dark diagram pairs (spec §3.1 `themed-image.ts`).
 *
 * The legacy app swapped every `<DocsDiagram src alt>` and every markdown
 * image of `/assets/docs/core/**.svg` or `/assets/docs/tools/kora/kora.svg`
 * for a pair of images: `X-light.svg` in light mode, `X.svg` in dark mode
 * (`ThemedDiagram` in the old mdx-components.tsx). The docs have no such
 * component, so the pair is written out:
 *
 *   ![Accounts](/assets/docs/core/accounts/accounts.svg)
 *
 * becomes
 *
 *   <Frame caption="Accounts">
 *     <img className="block dark:hidden" src="/docs-assets/assets/docs/core/accounts/accounts-light.svg" alt="Accounts" />
 *     <img className="hidden dark:block" src="/docs-assets/assets/docs/core/accounts/accounts.svg" alt="Accounts" />
 *   </Frame>
 *
 * - Markdown images keep their alt text as the caption (as today).
 *   `<DocsDiagram>` had no caption today, so its Frame has none either; the
 *   alt text stays on both images.
 * - URLs are rewritten to `/docs-assets/...` (spec §1.4).
 * - A missing `-light.svg` sibling (or dark original) under
 *   apps/docs/docs-assets is an error, which leaves the file unconverted.
 * - Without JavaScript the renderer at conversion time always rendered dark mode (setup probe), so
 *   no-JS readers get the dark image; both images and alts are in the HTML.
 *
 * Runs before images.ts, which then leaves these Frames alone.
 */
import type { AstNode, Transform } from "../../types.ts";
import {
  type Jsx,
  attr,
  docsAssetExists,
  docsAssetUrl,
  flow,
  isBlankText,
  isJsx,
  replaceNodes,
  strAttr,
} from "./_wp2.ts";

/** Legacy rule: which markdown images were auto-themed. */
export function isThemedPath(url: string): boolean {
  const u = url.replace(/^\/docs-assets/, "");
  return (
    u.endsWith(".svg") &&
    !u.endsWith("-light.svg") &&
    (u.startsWith("/assets/docs/core/") ||
      u === "/assets/docs/tools/kora/kora.svg")
  );
}

export function lightVariant(url: string): string {
  return url.replace(/\.svg$/, "-light.svg");
}

function img(
  type: "mdxJsxFlowElement" | "mdxJsxTextElement",
  className: string,
  src: string,
  alt: string,
): Jsx {
  return {
    type,
    name: "img",
    attributes: [
      attr("className", className),
      attr("src", src),
      attr("alt", alt),
    ],
    children: [],
  };
}

export function themedPair(
  url: string,
  alt: string,
  type: "mdxJsxFlowElement" | "mdxJsxTextElement" = "mdxJsxFlowElement",
): AstNode[] {
  const dark = docsAssetUrl(url);
  const shown = type === "mdxJsxFlowElement" ? "block" : "inline";
  return [
    img(type, `${shown} dark:hidden`, lightVariant(dark), alt),
    img(type, `hidden dark:${shown}`, dark, alt),
  ];
}

export const transform: Transform = {
  name: "themed-image",
  order: 280,
  owner: "WP2",
  appliesTo: (source) =>
    source.includes("<DocsDiagram") ||
    source.includes("/assets/docs/core/") ||
    source.includes("/assets/docs/tools/kora/kora.svg"),
  run(tree, _file, ctx) {
    const check = (url: string) => {
      const dark = docsAssetUrl(url);
      const light = lightVariant(dark);
      let ok = true;
      for (const u of [dark, light]) {
        if (!docsAssetExists(u)) {
          ctx.error(`themed image ${u} does not exist under apps/docs`);
          ok = false;
        }
      }
      return ok;
    };

    const soleImage = (p: AstNode): AstNode | undefined => {
      if (p.type !== "paragraph") return undefined;
      const kids = (p.children ?? []).filter((c) => !isBlankText(c));
      return kids.length === 1 && kids[0]!.type === "image"
        ? kids[0]
        : undefined;
    };

    replaceNodes(tree, (node, parent) => {
      if (isJsx(node, "DocsDiagram")) {
        const src = strAttr(node, "src") ?? "";
        const alt = strAttr(node, "alt") ?? "";
        if (!src.endsWith(".svg")) {
          ctx.error(`<DocsDiagram src="${src}"> is not an .svg`);
          return undefined;
        }
        if (!check(src)) return undefined;
        const frame = flow("Frame", [], themedPair(src, alt));
        if (node.type === "mdxJsxTextElement") {
          ctx.warn("inline <DocsDiagram> emitted as inline images");
          return themedPair(src, alt, "mdxJsxTextElement");
        }
        return [frame];
      }

      // Markdown image alone in a paragraph -> Frame with caption.
      if (node.type === "paragraph") {
        const only = soleImage(node);
        if (!only) return undefined;
        const url = String(only.url ?? "");
        if (!isThemedPath(url) || !check(url)) return undefined;
        const alt = String(only.alt ?? "");
        const attrs = alt.trim() ? [attr("caption", alt.trim())] : [];
        return [flow("Frame", attrs, themedPair(url, alt))];
      }

      // Inline themed image among other text (the sole-image paragraph case
      // is handled when its paragraph is visited, right after this).
      if (
        node.type === "image" &&
        soleImage(parent) !== node &&
        isThemedPath(String(node.url ?? ""))
      ) {
        const url = String(node.url);
        if (!check(url)) return undefined;
        return themedPair(url, String(node.alt ?? ""), "mdxJsxTextElement");
      }
      return undefined;
    });
  },
};
