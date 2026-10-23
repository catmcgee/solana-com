/**
 * Markdown and HTML images (spec §1.4, §3.1 `images.ts`).
 *
 *   ![Phantom wallet setup](/images/learn/phantom.webp)
 *
 * becomes
 *
 *   <Frame caption="Phantom wallet setup">
 *     ![Phantom wallet setup](/docs-assets/images/learn/phantom.webp)
 *   </Frame>
 *
 * - Asset URLs move under `/docs-assets/` (`/assets/X` ->
 *   `/docs-assets/assets/X`, same for `/images/` and `/img/`), matching
 *   migration/asset-refs.csv. This covers markdown images and the
 *   `src`/`poster` of JSX `<img>`, `<video>` and `<source>` (a rewritten
 *   URL with no file under apps/docs/docs-assets is a warning), plus links
 *   and reference definitions whose target file exists under docs-assets
 *   (e.g. a PDF brochure).
 * - A markdown image that is alone in its paragraph, with non-empty alt
 *   text, is wrapped in `<Frame caption="alt">`: the legacy renderer showed
 *   every such image with its alt text as a caption. Images inside text,
 *   tables, links or an existing `<Frame>` are only rewritten.
 * - Themed diagram pairs are themed-image.ts (runs first).
 *
 * Frame, captions and images are all in the server HTML.
 */
import type { Transform } from "../../types.ts";
import {
  attr,
  docsAssetExists,
  docsAssetUrl,
  flow,
  isBlankText,
  isJsx,
  isLegacyAssetUrl,
  replaceNodes,
  walk,
} from "./_mdx.ts";

/** Containers whose paragraphs are block-level (a Frame may replace them). */
const FLOW_PARENTS = new Set([
  "root",
  "mdxJsxFlowElement",
  "listItem",
  "blockquote",
]);

const URL_ATTRS: Readonly<Record<string, readonly string[]>> = {
  img: ["src"],
  video: ["src", "poster"],
  source: ["src"],
  audio: ["src"],
};

export const transform: Transform = {
  name: "images",
  order: 290,
  appliesTo: (source) =>
    source.includes("![") ||
    source.includes("<img") ||
    source.includes("<video") ||
    source.includes("<source") ||
    /\]\(\/(assets|images|img)\/|\]:\s*\/(assets|images|img)\//.test(source),
  run(tree, _file, ctx) {
    const rewrite = (url: string): string => {
      if (!isLegacyAssetUrl(url)) return url;
      const next = docsAssetUrl(url);
      if (!docsAssetExists(next))
        ctx.warn(`asset ${next} (from ${url}) does not exist under apps/docs`);
      return next;
    };

    // 1. URL rewrites.
    walk(tree, (n) => {
      if (n.type === "image") {
        const url = String(n.url ?? "");
        const next = rewrite(url);
        if (next !== url) n.url = next;
        return;
      }
      // Links/definitions to assets (PDFs, images): rewrite only when the
      // file moved into docs-assets, so page links are never touched.
      if (n.type === "link" || n.type === "definition") {
        const url = String(n.url ?? "");
        if (isLegacyAssetUrl(url) && docsAssetExists(docsAssetUrl(url)))
          n.url = docsAssetUrl(url);
      }
      if (isJsx(n) && n.name && URL_ATTRS[n.name]) {
        for (const a of n.attributes) {
          if (
            a.type === "mdxJsxAttribute" &&
            URL_ATTRS[n.name]!.includes(a.name ?? "") &&
            typeof a.value === "string"
          ) {
            const next = rewrite(a.value);
            if (next !== a.value) a.value = next;
          }
        }
      }
    });

    // 2. Captions: a lone image with alt text becomes a captioned Frame.
    replaceNodes(tree, (node, parent, ancestors) => {
      if (node.type !== "paragraph" || !FLOW_PARENTS.has(parent.type))
        return undefined;
      if (ancestors.some((a) => isJsx(a, "Frame"))) return undefined;
      if (isJsx(parent, "Frame")) return undefined;
      const kids = (node.children ?? []).filter((c) => !isBlankText(c));
      const only = kids[0];
      if (kids.length !== 1 || only?.type !== "image") return undefined;
      const alt = String(only.alt ?? "").trim();
      if (!alt) return undefined;
      return [flow("Frame", [attr("caption", alt)], [node])];
    });
  },
};
